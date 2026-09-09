import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';

interface StoredFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploaderDevice: string;
  uploadedAt: number;
  diskPath: string;
  forwardedToDiscord?: boolean;
  discordForwardError?: string;
}

interface ConnectedDevice {
  id: string;
  type: 'projector' | 'phone' | 'pc';
  name: string;
  connectedAt: number;
}

interface Room {
  code: string;
  createdAt: number;
  lastActive: number;
  devices: Map<string, ConnectedDevice>;
  files: Map<string, StoredFile>;
  sockets: Set<WebSocket>;
}

const PORT = 3000;
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const SAVED_DIR = path.join(UPLOAD_DIR, 'saved_files');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(SAVED_DIR)) {
  fs.mkdirSync(SAVED_DIR, { recursive: true });
}

export interface SavedFileItem {
  id: string;
  originalFileId?: string;
  name: string;
  size: number;
  mimeType: string;
  diskPath: string;
  savedAt: number;
  savedByDevice?: string;
  forwardedToDiscord: boolean;
  discordError?: string;
}

interface VaultConfig {
  passcode?: string; // 6-digit numeric string
  files: SavedFileItem[];
}

const VAULT_CONFIG_PATH = path.join(UPLOAD_DIR, 'saved_vault.json');

function loadVaultConfig(): VaultConfig {
  try {
    if (fs.existsSync(VAULT_CONFIG_PATH)) {
      const raw = fs.readFileSync(VAULT_CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        passcode: parsed.passcode || undefined,
        files: Array.isArray(parsed.files) ? parsed.files : [],
      };
    }
  } catch (err) {
    console.error('Failed to load saved_vault.json:', err);
  }
  return { files: [] };
}

function saveVaultConfig(cfg: VaultConfig) {
  try {
    fs.writeFileSync(VAULT_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save saved_vault.json:', err);
  }
}

// In-memory active session tokens for vault access
const activeVaultTokens = new Set<string>();

// 24 Hours lifetime in milliseconds for transient files used in rooms/website
const TRANSIENT_FILE_TTL = 24 * 60 * 60 * 1000;

function purgeExpiredTransientFiles() {
  const now = Date.now();
  let anyRemoved = false;
  const vault = loadVaultConfig();
  const savedPaths = new Set(vault.files.map((f) => f.diskPath));

  for (const [code, room] of rooms.entries()) {
    for (const [fileId, file] of room.files.entries()) {
      if (now - file.uploadedAt > TRANSIENT_FILE_TTL) {
        console.log(`[Memory Cleanup] Purging 24hr expired room file: ${file.name} (${fileId}) from room ${code}`);
        try {
          if (fs.existsSync(file.diskPath) && !savedPaths.has(file.diskPath)) {
            fs.unlinkSync(file.diskPath);
          }
        } catch (err) {
          console.error(`Failed to delete expired disk file ${file.diskPath}:`, err);
        }
        room.files.delete(fileId);
        broadcastToRoom(room, { type: 'file_removed', fileId });
        anyRemoved = true;
      }
    }
  }

  if (anyRemoved) {
    saveRoomsToDisk();
  }
}

// Purge 24-hour expired transient files periodically every 5 minutes
setInterval(purgeExpiredTransientFiles, 5 * 60 * 1000);

// In-memory rooms registry with disk persistence fallback
const rooms = new Map<string, Room>();
const ROOMS_META_PATH = path.join(UPLOAD_DIR, 'rooms_meta.json');
const DISCORD_CONFIG_PATH = path.join(UPLOAD_DIR, 'discord_config.json');

interface DiscordConfig {
  webhookUrl?: string;
  webhookName?: string;
  channelId?: string;
  guildId?: string;
  adminPin?: string;
  botEndpoint?: string;
  botSecret?: string;
}

function loadDiscordConfig(): DiscordConfig {
  try {
    if (fs.existsSync(DISCORD_CONFIG_PATH)) {
      const raw = fs.readFileSync(DISCORD_CONFIG_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to read discord_config.json:', err);
  }
  return {};
}

function saveDiscordConfig(config: DiscordConfig) {
  try {
    fs.writeFileSync(DISCORD_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save discord_config.json:', err);
  }
}

function maskWebhookUrl(url: string): string {
  if (!url) return '';
  const parts = url.split('/');
  if (parts.length >= 6) {
    const id = parts[5];
    const maskedId = id.length > 8 ? `${id.slice(0, 6)}...` : id;
    return `https://discord.com/api/webhooks/${maskedId}/••••••••`;
  }
  return 'https://discord.com/api/webhooks/••••••••';
}

let cachedEnvWebhookName = '';

function getEffectiveDiscordSettings() {
  const saved = loadDiscordConfig();
  const envWebhook = (
    process.env.DISCORD_WEBHOOK_API ||
    process.env.DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK ||
    ''
  ).trim();

  const webhookUrl = (saved.webhookUrl || envWebhook).trim();
  const botEndpoint = (saved.botEndpoint || process.env.DISCORD_BOT_ENDPOINT || '').trim();
  const botSecret = (saved.botSecret || process.env.DISCORD_BOT_SECRET || '').trim();
  const adminPin = saved.adminPin || '';
  const webhookName = saved.webhookName || cachedEnvWebhookName || '';

  // Asynchronously resolve webhook name if missing and we have a valid webhook URL
  if (webhookUrl && !saved.webhookName && !cachedEnvWebhookName) {
    fetch(webhookUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: any) => {
        if (data?.name) {
          cachedEnvWebhookName = data.name;
        }
      })
      .catch(() => {});
  }

  return {
    webhookUrl,
    botEndpoint,
    botSecret,
    adminPin,
    webhookName,
    hasAdminPin: Boolean(adminPin),
  };
}

function saveRoomsToDisk() {
  try {
    const serialized: Record<string, unknown> = {};
    for (const [code, r] of rooms.entries()) {
      serialized[code] = {
        code: r.code,
        createdAt: r.createdAt,
        lastActive: r.lastActive,
        devices: Array.from(r.devices.values()),
        files: Array.from(r.files.values()),
      };
    }
    fs.writeFileSync(ROOMS_META_PATH, JSON.stringify(serialized, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save rooms to disk:', err);
  }
}

function loadRoomsFromDisk() {
  try {
    if (fs.existsSync(ROOMS_META_PATH)) {
      const raw = fs.readFileSync(ROOMS_META_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      for (const [code, r] of Object.entries<any>(parsed)) {
        rooms.set(code, {
          code: r.code,
          createdAt: r.createdAt || Date.now(),
          lastActive: r.lastActive || Date.now(),
          devices: new Map((r.devices || []).map((d: ConnectedDevice) => [d.id, d])),
          files: new Map((r.files || []).map((f: StoredFile) => [f.id, f])),
          sockets: new Set(),
        });
      }
      console.log(`[Server] Loaded ${rooms.size} rooms from persistent disk cache.`);
    }
  } catch (err) {
    console.error('Failed to load rooms from disk:', err);
  }
}
loadRoomsFromDisk();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Sanitize filename to avoid directory traversal
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${uniqueSuffix}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 250 * 1024 * 1024, // 250MB limit per file
  },
});

// Generate unambiguous 6-character code (excludes 0, O, 1, I to prevent blurry screen misreadings)
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generatePairingCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * CODE_CHARS.length);
    code += CODE_CHARS[idx];
  }
  // Ensure uniqueness
  if (rooms.has(code)) {
    return generatePairingCode();
  }
  return code;
}

function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function getOrRestoreRoom(rawCode: string): Room | undefined {
  const code = normalizeCode(rawCode);
  let room = rooms.get(code);
  if (!room) {
    loadRoomsFromDisk();
    room = rooms.get(code);
  }
  return room;
}

function getRoomDTO(room: Room) {
  const now = Date.now();
  const vault = loadVaultConfig();
  const savedOriginalIds = new Set(vault.files.map((f) => f.originalFileId || f.id));

  // Only return transient files uploaded within the last 24 hours
  const validFiles = Array.from(room.files.values()).filter(
    (f) => now - f.uploadedAt <= TRANSIENT_FILE_TTL
  );

  return {
    code: room.code,
    createdAt: room.createdAt,
    devices: Array.from(room.devices.values()),
    files: validFiles.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      uploaderDevice: f.uploaderDevice,
      uploadedAt: f.uploadedAt,
      rawUrl: `/api/files/${f.id}/raw`,
      downloadUrl: `/api/files/${f.id}/download`,
      forwardedToDiscord: f.forwardedToDiscord,
      discordForwardError: f.discordForwardError,
      isSaved: savedOriginalIds.has(f.id),
      expiresInMs: Math.max(0, TRANSIENT_FILE_TTL - (now - f.uploadedAt)),
    })),
  };
}

function broadcastToRoom(room: Room, message: Record<string, unknown>, senderSocket?: WebSocket) {
  const payload = JSON.stringify(message);
  for (const socket of room.sockets) {
    if (socket !== senderSocket && socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    }
  }
}

// Room auto-cleanup interval (rooms older than 24 hours inactive)
setInterval(() => {
  const now = Date.now();
  const vault = loadVaultConfig();
  const savedPaths = new Set(vault.files.map((f) => f.diskPath));

  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActive > 24 * 60 * 60 * 1000) {
      // Remove transient files on disk (preserving any that were saved to vault)
      for (const f of room.files.values()) {
        try {
          if (fs.existsSync(f.diskPath) && !savedPaths.has(f.diskPath)) {
            fs.unlinkSync(f.diskPath);
          }
        } catch (e) {
          console.error(`Failed to clean file ${f.diskPath}:`, e);
        }
      }
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

// ============================================================================
// Zero-Leak Discord Bot & Webhook Relay Bridge (Strictly Server-Side)
// Public visitors and DevTools source code never see your Bot Token, Endpoint or Secret!
// ============================================================================
function getDiscordConfigStatus() {
  const settings = getEffectiveDiscordSettings();

  const botConfigured = Boolean(settings.botEndpoint);
  const webhookConfigured = Boolean(settings.webhookUrl);
  const configured = botConfigured || webhookConfigured;

  let mode: 'webhook' | 'bot' | 'hybrid' | 'none' = 'none';
  if (botConfigured && webhookConfigured) {
    mode = 'hybrid';
  } else if (webhookConfigured) {
    mode = 'webhook';
  } else if (botConfigured) {
    mode = 'bot';
  }

  let targetDescription = 'Not configured (Paste a Discord Webhook URL below to connect in seconds — no hosting needed)';
  if (mode === 'hybrid') {
    targetDescription = `Connected to Discord Webhook (${settings.webhookName || 'Active'}) + Python Bot`;
  } else if (mode === 'webhook') {
    targetDescription = settings.webhookName
      ? `Connected to Discord Webhook: #${settings.webhookName} (Zero Hosting Required)`
      : 'Connected to Discord Webhook (Zero Hosting Required)';
  } else if (mode === 'bot') {
    targetDescription = 'Connected to Python Bot API';
  }

  return {
    configured,
    mode,
    botEndpointConfigured: botConfigured,
    webhookConfigured,
    secretConfigured: Boolean(settings.botSecret),
    targetDescription,
    webhookMasked: settings.webhookUrl ? maskWebhookUrl(settings.webhookUrl) : undefined,
    webhookName: settings.webhookName || undefined,
    hasAdminPin: settings.hasAdminPin,
  };
}

async function forwardFileToDiscord(stored: StoredFile | SavedFileItem, roomCode: string = 'Saved Vault') {
  const settings = getEffectiveDiscordSettings();
  const botEndpoint = settings.botEndpoint;
  const secret = settings.botSecret;
  const webhookUrl = settings.webhookUrl;

  const targets: {
    pythonBot?: { success: boolean; status?: number; error?: string };
    webhook?: { success: boolean; status?: number; error?: string };
  } = {};

  if (!botEndpoint && !webhookUrl) {
    return {
      success: false,
      message: 'No Discord destination configured. Add a Webhook in the Discord Bridge settings.',
      targets,
    };
  }

  if (!fs.existsSync(stored.diskPath)) {
    return {
      success: false,
      message: 'File does not exist on disk',
      targets,
    };
  }

  const fileBuffer = fs.readFileSync(stored.diskPath);
  const sizeFormatted = stored.size >= 1024 * 1024
    ? `${(stored.size / (1024 * 1024)).toFixed(2)} MB`
    : `${(stored.size / 1024).toFixed(1)} KB`;

  const senderDevice = ('uploaderDevice' in stored ? stored.uploaderDevice : stored.savedByDevice) || 'User';
  const fileTimestamp = 'uploadedAt' in stored ? stored.uploadedAt : stored.savedAt;

  // 1. Forward to Python Bot endpoint if configured
  if (botEndpoint) {
    try {
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: stored.mimeType });
      formData.append('file', blob, stored.name);
      formData.append('fileName', stored.name);
      formData.append('fileSize', String(stored.size));
      formData.append('mimeType', stored.mimeType);
      formData.append('uploader', senderDevice);
      formData.append('roomCode', roomCode);
      formData.append('timestamp', String(fileTimestamp));

      const headers: Record<string, string> = {};
      if (secret) {
        headers['Authorization'] = `Bearer ${secret}`;
        headers['X-Bot-Secret'] = secret;
      }

      const response = await fetch(botEndpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (response.ok) {
        targets.pythonBot = { success: true, status: response.status };
        console.log(`[Discord Bridge] Successfully forwarded "${stored.name}" to Python bot endpoint.`);
      } else {
        const errText = await response.text().catch(() => '');
        targets.pythonBot = {
          success: false,
          status: response.status,
          error: `Bot returned HTTP ${response.status}: ${errText.substring(0, 150)}`,
        };
        console.warn(`[Discord Bridge] Python Bot returned HTTP ${response.status}: ${errText}`);
      }
    } catch (err: any) {
      targets.pythonBot = {
        success: false,
        error: err?.message || 'Failed to connect to Python Bot endpoint',
      };
      console.error('[Discord Bridge] Network error calling Python Bot:', err);
    }
  }

  // 2. Forward to direct Discord Webhook (Zero Hosting Required!)
  if (webhookUrl) {
    try {
      const isImage = stored.mimeType.startsWith('image/');
      const isLargeFile = stored.size > 25 * 1024 * 1024; // Discord free limit is 25MB

      const embed: Record<string, any> = {
        title: `💾 ${stored.name}`,
        description: `Saved permanently to user vault via **Chand's File Dropper**`,
        color: 0x4f46e5,
        fields: [
          { name: 'File Size', value: `\`${sizeFormatted}\``, inline: true },
          { name: 'Saved By', value: `\`${senderDevice}\``, inline: true },
          { name: 'Source', value: `\`${roomCode}\``, inline: true },
        ],
        footer: { text: 'Zero-Leak Vault Backup • Only Saved Files Synced to Discord' },
        timestamp: new Date().toISOString(),
      };

      if (isLargeFile) {
        embed.fields.push({
          name: 'Notice',
          value: `This file exceeds Discord's 25MB webhook attachment limit. It can be viewed or downloaded directly from the Saved Files vault.`,
          inline: false,
        });

        // Send json message without binary attachment
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `💾 **New Saved File** • **${stored.name}** saved by **${senderDevice}**`,
            embeds: [embed],
          }),
        });

        if (response.ok) {
          targets.webhook = { success: true, status: response.status };
          console.log(`[Discord Bridge] Successfully logged large file notice "${stored.name}" to Discord Webhook.`);
        } else {
          const errText = await response.text().catch(() => '');
          targets.webhook = {
            success: false,
            status: response.status,
            error: `Discord Webhook returned HTTP ${response.status}: ${errText.substring(0, 150)}`,
          };
        }
      } else {
        // Send multipart form-data with attached binary
        if (isImage) {
          embed.image = { url: `attachment://${stored.name}` };
        }

        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: stored.mimeType });
        formData.append('files[0]', blob, stored.name);

        const payload = {
          content: `💾 **New Saved File** • **${stored.name}** saved by **${senderDevice}**`,
          embeds: [embed],
        };

        formData.append('payload_json', JSON.stringify(payload));

        const response = await fetch(webhookUrl, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          targets.webhook = { success: true, status: response.status };
          console.log(`[Discord Bridge] Successfully sent saved file "${stored.name}" to Discord Webhook.`);
        } else {
          const errText = await response.text().catch(() => '');
          targets.webhook = {
            success: false,
            status: response.status,
            error: `Discord Webhook returned HTTP ${response.status}: ${errText.substring(0, 150)}`,
          };
          console.warn(`[Discord Bridge] Discord Webhook returned HTTP ${response.status}: ${errText}`);
        }
      }
    } catch (err: any) {
      targets.webhook = {
        success: false,
        error: err?.message || 'Failed to send to Discord Webhook',
      };
      console.error('[Discord Bridge] Network error calling Discord Webhook:', err);
    }
  }

  const anySuccess = targets.pythonBot?.success || targets.webhook?.success;
  return {
    success: Boolean(anySuccess),
    message: anySuccess
      ? 'File successfully relayed to Discord'
      : 'Failed to deliver to configured Discord destination.',
    targets,
  };
}

async function sendDiscordTestPing() {
  const settings = getEffectiveDiscordSettings();
  const botEndpoint = settings.botEndpoint;
  const secret = settings.botSecret;
  const webhookUrl = settings.webhookUrl;

  const targets: Record<string, any> = {};

  if (!botEndpoint && !webhookUrl) {
    return {
      success: false,
      message: 'No Discord Webhook or Bot configured yet.',
      targets,
    };
  }

  // Ping Python Bot endpoint
  if (botEndpoint) {
    try {
      let pingUrl = botEndpoint;
      if (pingUrl.endsWith('/api/receive-file')) {
        pingUrl = pingUrl.replace('/api/receive-file', '/api/ping');
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secret) {
        headers['Authorization'] = `Bearer ${secret}`;
        headers['X-Bot-Secret'] = secret;
      }

      const response = await fetch(pingUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ping: true, timestamp: Date.now() }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        targets.pythonBot = { success: true, status: response.status, data };
      } else {
        const errText = await response.text().catch(() => '');
        targets.pythonBot = {
          success: false,
          status: response.status,
          error: `HTTP ${response.status}: ${errText.substring(0, 150)}`,
        };
      }
    } catch (err: any) {
      targets.pythonBot = { success: false, error: err?.message || 'Could not connect to Python bot server' };
    }
  }

  // Ping Discord Webhook
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '🔔 **Chand\'s File Dropper Webhook Test**',
          embeds: [
            {
              title: 'Discord Webhook Connected Successfully',
              description: 'Your webhook is working directly without needing any external bot hosting! All uploads will be relayed here automatically.',
              color: 0x10b981,
              fields: [
                { name: 'Hosting Needed', value: '❌ Zero (Direct Webhook)', inline: true },
                { name: 'Source Code Security', value: '🛡️ Zero-Leak Shielded', inline: true },
              ],
              footer: { text: 'Zero-Leak Server Proxy • Chandler File Dropper' },
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });

      if (response.ok) {
        targets.webhook = { success: true, status: response.status };
      } else {
        const errText = await response.text().catch(() => '');
        targets.webhook = { success: false, status: response.status, error: errText.substring(0, 150) };
      }
    } catch (err: any) {
      targets.webhook = { success: false, error: err?.message || 'Could not send test message to Discord Webhook' };
    }
  }

  const anySuccess = targets.pythonBot?.success || targets.webhook?.success;
  return {
    success: Boolean(anySuccess),
    message: anySuccess ? 'Discord test message delivered successfully!' : 'Discord test ping failed. Please check the Webhook URL.',
    targets,
  };
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Enable CORS headers for cross-device access and mobile browsers
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (_req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // WebSocket connection handler
  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    let currentCode: string | null = null;
    let currentDeviceId: string | null = null;

    ws.on('message', (data: Buffer | string) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'join') {
          const code = normalizeCode(message.code || '');
          const room = getOrRestoreRoom(code);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session code not found' }));
            return;
          }

          currentCode = code;
          currentDeviceId = message.deviceId;
          room.sockets.add(ws);
          room.lastActive = Date.now();

          // If device info provided, update room devices
          if (message.deviceId) {
            const device: ConnectedDevice = {
              id: message.deviceId,
              type: message.deviceType || 'phone',
              name: message.name || (message.deviceType === 'projector' ? 'Projector Screen' : 'Mobile Device'),
              connectedAt: Date.now(),
            };
            room.devices.set(message.deviceId, device);

            // Notify others
            broadcastToRoom(room, { type: 'peer_joined', device }, ws);
            saveRoomsToDisk();
          }

          // Send current state to newly joined client
          ws.send(JSON.stringify({ type: 'room_state', room: getRoomDTO(room) }));
        } else if (message.type === 'remote_open') {
          // Presenter on phone requests projector to open file
          const code = normalizeCode(message.code || currentCode || '');
          const room = getOrRestoreRoom(code);
          if (room) {
            const file = room.files.get(message.fileId);
            if (file) {
              const fileDTO = {
                id: file.id,
                name: file.name,
                size: file.size,
                mimeType: file.mimeType,
                uploaderDevice: file.uploaderDevice,
                uploadedAt: file.uploadedAt,
                rawUrl: `/api/files/${file.id}/raw`,
                downloadUrl: `/api/files/${file.id}/download`,
              };
              broadcastToRoom(room, { type: 'remote_open', file: fileDTO });
            }
          }
        } else if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (err) {
        console.error('WS message error:', err);
      }
    });

    ws.on('close', () => {
      if (currentCode && rooms.has(currentCode)) {
        const room = rooms.get(currentCode)!;
        room.sockets.delete(ws);
        if (currentDeviceId && room.devices.has(currentDeviceId)) {
          room.devices.delete(currentDeviceId);
          broadcastToRoom(room, { type: 'peer_left', deviceId: currentDeviceId });
        }
      }
    });
  });

  // REST API Routes

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      activeRooms: rooms.size,
      time: new Date().toISOString(),
    });
  });

  // Backend hosting guide & info for user
  app.get('/api/server-info', (_req, res) => {
    res.json({
      name: 'Cross-Device File Transfer Backend',
      cost: '100% Free - Self Contained in this container or deployable to any free Node.js hosting',
      endpoints: [
        'POST /api/rooms/create - Create pairing room',
        'POST /api/rooms/join - Join with 6-digit code',
        'POST /api/rooms/:code/upload - Upload files',
        'GET /api/files/:fileId/raw - Inline preview (PNG/PDF/Video/Audio/Text)',
        'GET /api/files/:fileId/download - Download file',
        'DELETE /api/rooms/:code/files/:fileId - Delete file',
        'POST /api/rooms/:code/clear - Wipe room',
        'WS /ws - Real-time WebSocket synchronization',
      ],
    });
  });

  // Create a new room (e.g. by Projector / Screen)
  app.post('/api/rooms/create', (req, res) => {
    const { deviceType = 'projector', deviceName } = req.body;
    const code = generatePairingCode();
    const deviceId = 'dev-' + Math.random().toString(36).substring(2, 9);

    const initialDevice: ConnectedDevice = {
      id: deviceId,
      type: deviceType,
      name: deviceName || (deviceType === 'projector' ? 'Projector Screen' : 'Host PC'),
      connectedAt: Date.now(),
    };

    const newRoom: Room = {
      code,
      createdAt: Date.now(),
      lastActive: Date.now(),
      devices: new Map([[deviceId, initialDevice]]),
      files: new Map(),
      sockets: new Set(),
    };

    rooms.set(code, newRoom);
    saveRoomsToDisk();

    res.json({
      success: true,
      code,
      deviceId,
      room: getRoomDTO(newRoom),
    });
  });

  // Join an existing room via 6-digit code
  app.post('/api/rooms/join', (req, res) => {
    const { code: rawCode, deviceType = 'phone', deviceName } = req.body;
    if (!rawCode) {
      return res.status(400).json({ error: 'Pairing code is required' });
    }

    const code = normalizeCode(rawCode);
    const room = getOrRestoreRoom(code);

    if (!room) {
      return res.status(404).json({ error: 'Room not found. Please check the 6-digit code on screen.' });
    }

    room.lastActive = Date.now();
    const deviceId = 'dev-' + Math.random().toString(36).substring(2, 9);
    const device: ConnectedDevice = {
      id: deviceId,
      type: deviceType,
      name: deviceName || (deviceType === 'phone' ? 'Phone Sender' : 'Guest PC'),
      connectedAt: Date.now(),
    };

    room.devices.set(deviceId, device);

    // Notify connected projector/peers
    broadcastToRoom(room, { type: 'peer_joined', device });
    saveRoomsToDisk();

    res.json({
      success: true,
      code,
      deviceId,
      room: getRoomDTO(room),
    });
  });

  // Get current room status
  app.get('/api/rooms/:code', (req, res) => {
    const code = normalizeCode(req.params.code);
    const room = getOrRestoreRoom(code);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    room.lastActive = Date.now();
    res.json(getRoomDTO(room));
  });

  // Upload files to room
  app.post('/api/rooms/:code/upload', upload.array('files', 10), (req, res) => {
    const code = normalizeCode(req.params.code);
    const room = getOrRestoreRoom(code);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploader = req.body.uploaderName || 'Phone';
    const addedFiles: StoredFile[] = [];

    for (const f of files) {
      const fileId = 'f-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now();
      const stored: StoredFile = {
        id: fileId,
        name: Buffer.from(f.originalname, 'latin1').toString('utf8'), // handle UTF-8 characters safely
        size: f.size,
        mimeType: f.mimetype || 'application/octet-stream',
        uploaderDevice: uploader,
        uploadedAt: Date.now(),
        diskPath: f.path,
      };

      room.files.set(fileId, stored);
      addedFiles.push(stored);

      const fileDTO = {
        id: stored.id,
        name: stored.name,
        size: stored.size,
        mimeType: stored.mimeType,
        uploaderDevice: stored.uploaderDevice,
        uploadedAt: stored.uploadedAt,
        rawUrl: `/api/files/${stored.id}/raw`,
        downloadUrl: `/api/files/${stored.id}/download`,
      };

      // Real-time broadcast to projector and other connected devices
      broadcastToRoom(room, { type: 'file_added', file: fileDTO });
    }

    room.lastActive = Date.now();
    saveRoomsToDisk();

    // Note: Normal uploaded files are NOT sent to Discord.
    // Per user rules: Only files explicitly saved by the user are saved/forwarded to Discord.

    res.json({
      success: true,
      files: addedFiles.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        mimeType: f.mimeType,
        uploaderDevice: f.uploaderDevice,
        uploadedAt: f.uploadedAt,
        rawUrl: `/api/files/${f.id}/raw`,
        downloadUrl: `/api/files/${f.id}/download`,
        forwardedToDiscord: false,
        discordForwardError: undefined,
        isSaved: false,
        expiresInMs: TRANSIENT_FILE_TTL,
      })),
    });
  });

  // Remote beam / present action (phone triggers projector preview)
  app.post('/api/rooms/:code/remote-open', (req, res) => {
    const code = normalizeCode(req.params.code);
    const { fileId } = req.body;
    const room = getOrRestoreRoom(code);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const file = room.files.get(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileDTO = {
      id: file.id,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      uploaderDevice: file.uploaderDevice,
      uploadedAt: file.uploadedAt,
      rawUrl: `/api/files/${file.id}/raw`,
      downloadUrl: `/api/files/${file.id}/download`,
    };

    broadcastToRoom(room, { type: 'remote_open', file: fileDTO });
    res.json({ success: true });
  });

  // Delete specific file
  app.delete('/api/rooms/:code/files/:fileId', (req, res) => {
    const code = normalizeCode(req.params.code);
    const { fileId } = req.params;
    const room = getOrRestoreRoom(code);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const file = room.files.get(fileId);
    if (file) {
      try {
        if (fs.existsSync(file.diskPath)) {
          fs.unlinkSync(file.diskPath);
        }
      } catch (e) {
        console.error('Error deleting file:', e);
      }
      room.files.delete(fileId);
      broadcastToRoom(room, { type: 'file_removed', fileId });
      saveRoomsToDisk();
    }

    room.lastActive = Date.now();
    res.json({ success: true });
  });

  // Clear all files in room (privacy wipe)
  app.post('/api/rooms/:code/clear', (req, res) => {
    const code = normalizeCode(req.params.code);
    const room = getOrRestoreRoom(code);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    for (const f of room.files.values()) {
      try {
        if (fs.existsSync(f.diskPath)) {
          fs.unlinkSync(f.diskPath);
        }
      } catch (e) {
        console.error('Error clearing file:', e);
      }
    }

    room.files.clear();
    room.lastActive = Date.now();
    broadcastToRoom(room, { type: 'room_cleared' });
    saveRoomsToDisk();

    res.json({ success: true, message: 'All files cleared for privacy' });
  });

  // Serve file raw for inline preview (PNG, PDF, TXT, video, etc.)
  app.get('/api/files/:fileId/raw', (req, res) => {
    const { fileId } = req.params;
    let foundFile: StoredFile | null = null;

    for (const room of rooms.values()) {
      if (room.files.has(fileId)) {
        foundFile = room.files.get(fileId)!;
        break;
      }
    }

    if (!foundFile || !fs.existsSync(foundFile.diskPath)) {
      return res.status(404).send('File not found or has been cleared.');
    }

    res.setHeader('Content-Type', foundFile.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(foundFile.name)}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const fileStream = fs.createReadStream(foundFile.diskPath);
    fileStream.pipe(res);
  });

  // Serve file for direct attachment download
  app.get('/api/files/:fileId/download', (req, res) => {
    const { fileId } = req.params;
    let foundFile: StoredFile | null = null;

    for (const room of rooms.values()) {
      if (room.files.has(fileId)) {
        foundFile = room.files.get(fileId)!;
        break;
      }
    }

    if (!foundFile || !fs.existsSync(foundFile.diskPath)) {
      return res.status(404).send('File not found or has been cleared.');
    }

    res.setHeader('Content-Type', foundFile.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(foundFile.name)}"`);

    const fileStream = fs.createReadStream(foundFile.diskPath);
    fileStream.pipe(res);
  });

  // ============================================================================
  // Saved Files Vault API Endpoints (Password Protected with 6-digit Numeric Code)
  // Only files saved to this vault are forwarded/persisted to Discord!
  // Normal website files expire and are deleted from memory after 24 hours.
  // ============================================================================

  // Get status of saved files vault (has passcode set, total saved files count)
  app.get('/api/vault/status', (_req, res) => {
    const vault = loadVaultConfig();
    res.json({
      hasPasscode: Boolean(vault.passcode),
      count: vault.files.length,
    });
  });

  // Set up 6-digit numeric passcode if not already configured
  app.post('/api/vault/setup-passcode', (req, res) => {
    const { passcode } = req.body || {};
    const clean = String(passcode || '').trim();

    if (!/^\d{6}$/.test(clean)) {
      return res.status(400).json({
        success: false,
        error: 'Passcode must be exactly 6 numeric digits (e.g. 123456)',
      });
    }

    const vault = loadVaultConfig();
    if (vault.passcode) {
      return res.status(400).json({
        success: false,
        error: 'Passcode is already configured. Please enter your 6-digit code to login.',
      });
    }

    vault.passcode = clean;
    saveVaultConfig(vault);

    const token = 'vtok-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
    activeVaultTokens.add(token);

    console.log('[Vault] 6-digit numeric passcode successfully initialized.');
    res.json({
      success: true,
      message: '6-digit passcode set successfully!',
      token,
    });
  });

  // Login to Saved Files vault with 6-digit numeric code
  app.post('/api/vault/login', (req, res) => {
    const { passcode } = req.body || {};
    const clean = String(passcode || '').trim();
    const vault = loadVaultConfig();

    if (!vault.passcode) {
      return res.status(400).json({
        success: false,
        needsSetup: true,
        error: 'No passcode has been set up yet. Please setup your 6-digit numeric code first.',
      });
    }

    if (vault.passcode !== clean) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect 6-digit passcode. Please try again.',
      });
    }

    const token = 'vtok-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
    activeVaultTokens.add(token);

    res.json({
      success: true,
      message: 'Vault unlocked successfully',
      token,
    });
  });

  // Helper middleware for vault session token verification
  const requireVaultAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || (req.query.token as string);

    if (!token || !activeVaultTokens.has(token)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please enter your 6-digit code to access Saved Files.',
      });
    }
    next();
  };

  // List all saved files in the vault (requires valid token)
  app.get('/api/vault/files', requireVaultAuth, (req, res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || (req.query.token as string);
    const vault = loadVaultConfig();

    res.json({
      success: true,
      files: vault.files.map((f) => ({
        id: f.id,
        originalFileId: f.originalFileId,
        name: f.name,
        size: f.size,
        mimeType: f.mimeType,
        savedAt: f.savedAt,
        savedByDevice: f.savedByDevice,
        forwardedToDiscord: f.forwardedToDiscord,
        discordError: f.discordError,
        rawUrl: `/api/vault/files/${f.id}/raw?token=${encodeURIComponent(token)}`,
        downloadUrl: `/api/vault/files/${f.id}/download?token=${encodeURIComponent(token)}`,
      })),
    });
  });

  // Save a file to the vault & forward to Discord!
  // Per user rule: Only files that are saved will be sent to Discord.
  app.post('/api/vault/save', async (req, res) => {
    try {
      const { fileId, roomCode, deviceName } = req.body || {};
      if (!fileId) {
        return res.status(400).json({ success: false, error: 'fileId is required to save a file' });
      }

      // Find file in active rooms or search on disk
      let sourceFile: StoredFile | null = null;
      let foundRoom: Room | null = null;

      for (const r of rooms.values()) {
        if (r.files.has(fileId)) {
          sourceFile = r.files.get(fileId)!;
          foundRoom = r;
          break;
        }
      }

      if (!sourceFile || !fs.existsSync(sourceFile.diskPath)) {
        return res.status(404).json({
          success: false,
          error: 'Source file not found or has expired (24h cleanup).',
        });
      }

      const vault = loadVaultConfig();
      // Check if file is already saved
      const existing = vault.files.find((f) => f.originalFileId === fileId || f.id === fileId);
      if (existing) {
        return res.json({
          success: true,
          alreadySaved: true,
          message: 'This file is already in your Saved Files vault.',
          file: existing,
          forwardedToDiscord: existing.forwardedToDiscord,
        });
      }

      // Copy file into permanent SAVED_DIR so 24-hr transient cleanup won't touch it
      const savedId = 'saved-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now();
      const safeName = sourceFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const savedDiskPath = path.join(SAVED_DIR, `${savedId}-${safeName}`);

      fs.copyFileSync(sourceFile.diskPath, savedDiskPath);

      const savedItem: SavedFileItem = {
        id: savedId,
        originalFileId: fileId,
        name: sourceFile.name,
        size: sourceFile.size,
        mimeType: sourceFile.mimeType,
        diskPath: savedDiskPath,
        savedAt: Date.now(),
        savedByDevice: deviceName || sourceFile.uploaderDevice || 'User',
        forwardedToDiscord: false,
      };

      // Forward to Discord! (Only saved files are saved to Discord)
      try {
        const forwardRes = await forwardFileToDiscord(savedItem, roomCode || foundRoom?.code || 'Saved Vault');
        if (forwardRes.success) {
          savedItem.forwardedToDiscord = true;
          savedItem.discordError = undefined;
        } else {
          savedItem.forwardedToDiscord = false;
          savedItem.discordError = forwardRes.message;
        }
      } catch (err: any) {
        savedItem.forwardedToDiscord = false;
        savedItem.discordError = err?.message || 'Discord relay failed';
      }

      // Add to beginning of vault
      vault.files.unshift(savedItem);
      saveVaultConfig(vault);

      // Update in-memory room file status as well
      sourceFile.forwardedToDiscord = savedItem.forwardedToDiscord;
      sourceFile.discordForwardError = savedItem.discordError;
      saveRoomsToDisk();

      if (foundRoom) {
        broadcastToRoom(foundRoom, {
          type: 'file_updated',
          file: {
            id: sourceFile.id,
            name: sourceFile.name,
            size: sourceFile.size,
            mimeType: sourceFile.mimeType,
            uploaderDevice: sourceFile.uploaderDevice,
            uploadedAt: sourceFile.uploadedAt,
            rawUrl: `/api/files/${sourceFile.id}/raw`,
            downloadUrl: `/api/files/${sourceFile.id}/download`,
            forwardedToDiscord: sourceFile.forwardedToDiscord,
            discordForwardError: sourceFile.discordForwardError,
            isSaved: true,
          },
        });
      }

      res.json({
        success: true,
        message: savedItem.forwardedToDiscord
          ? `File "${savedItem.name}" saved to vault and sent to Discord!`
          : `File "${savedItem.name}" saved to vault!`,
        file: savedItem,
        forwardedToDiscord: savedItem.forwardedToDiscord,
      });
    } catch (err: any) {
      console.error('Save file error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to save file' });
    }
  });

  // Remove file from Saved Vault
  app.delete('/api/vault/files/:savedFileId', requireVaultAuth, (req, res) => {
    const { savedFileId } = req.params;
    const vault = loadVaultConfig();
    const idx = vault.files.findIndex((f) => f.id === savedFileId);

    if (idx < 0) {
      return res.status(404).json({ success: false, error: 'File not found in saved vault' });
    }

    const removed = vault.files.splice(idx, 1)[0];
    try {
      if (fs.existsSync(removed.diskPath)) {
        fs.unlinkSync(removed.diskPath);
      }
    } catch (err) {
      console.error('Failed to unlink saved file:', err);
    }

    saveVaultConfig(vault);
    res.json({ success: true, message: 'File removed from saved vault' });
  });

  // Serve saved file for inline preview
  app.get('/api/vault/files/:savedFileId/raw', (req, res) => {
    const { savedFileId } = req.params;
    const vault = loadVaultConfig();
    const found = vault.files.find((f) => f.id === savedFileId);

    if (!found || !fs.existsSync(found.diskPath)) {
      return res.status(404).send('Saved file not found');
    }

    res.setHeader('Content-Type', found.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(found.name)}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const stream = fs.createReadStream(found.diskPath);
    stream.pipe(res);
  });

  // Serve saved file for attachment download
  app.get('/api/vault/files/:savedFileId/download', (req, res) => {
    const { savedFileId } = req.params;
    const vault = loadVaultConfig();
    const found = vault.files.find((f) => f.id === savedFileId);

    if (!found || !fs.existsSync(found.diskPath)) {
      return res.status(404).send('Saved file not found');
    }

    res.setHeader('Content-Type', found.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(found.name)}"`);

    const stream = fs.createReadStream(found.diskPath);
    stream.pipe(res);
  });

  // ============================================================================
  // Discord Bridge API Endpoints (Secure Server-Side Proxy)
  // ============================================================================

  // Get Discord bridge configuration status (Safe: Never exposes tokens or endpoints to clients)
  app.get('/api/discord/status', (_req, res) => {
    res.json(getDiscordConfigStatus());
  });

  // Test Discord connection with a ping payload
  app.post('/api/discord/test', async (_req, res) => {
    try {
      const result = await sendDiscordTestPing();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to perform Discord test ping' });
    }
  });

  // Connect / update Discord Webhook directly (Zero hosting required!)
  app.post('/api/discord/webhook', async (req, res) => {
    try {
      const { webhookUrl, adminPin, currentPin } = req.body;
      const cleanUrl = String(webhookUrl || '').trim();

      if (!cleanUrl) {
        return res.status(400).json({ success: false, error: 'Please provide a valid Discord Webhook URL' });
      }

      // Validate URL pattern
      const isDiscordUrl = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(cleanUrl);
      if (!isDiscordUrl) {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Must be a standard Discord Webhook URL (e.g. https://discord.com/api/webhooks/123456789/abcdef...)',
        });
      }

      const existing = loadDiscordConfig();
      if (existing.adminPin && existing.adminPin !== currentPin) {
        return res.status(403).json({ success: false, error: 'Incorrect Admin PIN. Webhook modification locked.' });
      }

      // Validate directly with Discord API (Discord's official webhook inspection endpoint)
      let webhookName = 'Discord Channel';
      let channelId = '';
      let guildId = '';
      try {
        const discordCheck = await fetch(cleanUrl);
        if (!discordCheck.ok) {
          return res.status(400).json({
            success: false,
            error: `Discord rejected this Webhook URL (HTTP ${discordCheck.status}). Ensure the webhook exists in Discord and hasn't been deleted.`,
          });
        }
        const discordData: any = await discordCheck.json().catch(() => ({}));
        webhookName = discordData.name || webhookName;
        channelId = discordData.channel_id || '';
        guildId = discordData.guild_id || '';
      } catch (err: any) {
        return res.status(502).json({
          success: false,
          error: `Could not reach Discord servers to verify webhook: ${err?.message || 'Network error'}`,
        });
      }

      // Save to server-side config file
      const updatedConfig: DiscordConfig = {
        ...existing,
        webhookUrl: cleanUrl,
        webhookName,
        channelId,
        guildId,
        adminPin: adminPin ? String(adminPin).trim() : existing.adminPin,
      };
      saveDiscordConfig(updatedConfig);

      // Send initial welcome message to the Discord channel
      try {
        await fetch(cleanUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: '🚀 **Chand\'s Cross-Device File Dropper Connected!**',
            embeds: [
              {
                title: `Webhook Bridge Active: #${webhookName}`,
                description: 'Files dropped from phones or presentations will automatically post here with complete zero-leak privacy.',
                color: 0x4f46e5,
                fields: [
                  { name: 'Hosting Needed', value: '❌ None (Direct Webhook)', inline: true },
                  { name: 'DevTools Protection', value: '🛡️ Zero-Leak Server Proxy', inline: true },
                ],
                footer: { text: 'Zero-Leak Server Proxy • No Bot Hosting Required' },
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        });
      } catch (postErr) {
        console.warn('[Discord Bridge] Failed to post initial welcome embed to Discord:', postErr);
      }

      res.json({
        success: true,
        message: `Successfully connected to Discord Webhook (${webhookName})!`,
        webhookName,
        maskedUrl: maskWebhookUrl(cleanUrl),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to save Discord webhook' });
    }
  });

  // Disconnect Discord Webhook
  app.delete('/api/discord/webhook', (req, res) => {
    try {
      const { currentPin } = req.body || {};
      const existing = loadDiscordConfig();

      if (existing.adminPin && existing.adminPin !== currentPin) {
        return res.status(403).json({ success: false, error: 'Incorrect Admin PIN. Webhook modification locked.' });
      }

      const updatedConfig: DiscordConfig = {
        ...existing,
        webhookUrl: undefined,
        webhookName: undefined,
        channelId: undefined,
        guildId: undefined,
        adminPin: undefined,
      };
      saveDiscordConfig(updatedConfig);

      res.json({ success: true, message: 'Discord Webhook disconnected successfully.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to remove Discord webhook' });
    }
  });

  // Manually forward a specific file to Discord
  app.post('/api/rooms/:code/files/:fileId/forward-discord', async (req, res) => {
    const code = normalizeCode(req.params.code);
    const { fileId } = req.params;
    const room = getOrRestoreRoom(code);

    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const file = room.files.get(fileId);
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found in room' });
    }

    const result = await forwardFileToDiscord(file, room.code);
    if (result.success) {
      file.forwardedToDiscord = true;
      file.discordForwardError = undefined;
    } else {
      file.forwardedToDiscord = false;
      file.discordForwardError = result.message;
    }

    saveRoomsToDisk();

    // Broadcast file update to projector and phone clients
    broadcastToRoom(room, {
      type: 'file_updated',
      file: {
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        uploaderDevice: file.uploaderDevice,
        uploadedAt: file.uploadedAt,
        rawUrl: `/api/files/${file.id}/raw`,
        downloadUrl: `/api/files/${file.id}/download`,
        forwardedToDiscord: file.forwardedToDiscord,
        discordForwardError: file.discordForwardError,
      },
    });

    res.json(result);
  });

  // Get the complete Python Discord Bot Bridge script
  app.get('/api/discord/python-bot-template', (_req, res) => {
    try {
      const scriptPath = path.join(process.cwd(), 'discord_bot_bridge.py');
      if (fs.existsSync(scriptPath)) {
        const code = fs.readFileSync(scriptPath, 'utf8');
        res.json({ success: true, code });
      } else {
        res.status(404).json({ success: false, error: 'Template file not found' });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  // Serve pure standalone vanilla HTML, CSS, JS edition
  app.use('/vanilla', express.static(path.join(process.cwd(), 'standalone', 'public')));

  // Vite development vs Production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Cross-Device Transfer server active on http://0.0.0.0:${PORT}`);
  });
}

startServer();
