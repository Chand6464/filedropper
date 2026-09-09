const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');
const multer = require('multer');

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// In-memory rooms
const rooms = new Map();

// Multer disk storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${unique}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 }, // 250MB limit
});

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generateCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  if (rooms.has(code)) return generateCode();
  return code;
}

function normalizeCode(raw) {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function getRoomDTO(room) {
  return {
    code: room.code,
    createdAt: room.createdAt,
    devices: Array.from(room.devices.values()),
    files: Array.from(room.files.values()).map(f => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      uploaderDevice: f.uploaderDevice,
      uploadedAt: f.uploadedAt,
      rawUrl: `/api/files/${f.id}/raw`,
      downloadUrl: `/api/files/${f.id}/download`,
    })),
  };
}

function broadcast(room, payload, excludeSocket = null) {
  const msg = JSON.stringify(payload);
  for (const ws of room.sockets) {
    if (ws !== excludeSocket && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  let boundCode = null;
  let boundDeviceId = null;

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'subscribe') {
        const code = normalizeCode(data.code);
        const room = rooms.get(code);
        if (room) {
          boundCode = code;
          boundDeviceId = data.deviceId;
          room.sockets.add(ws);
          ws.send(JSON.stringify({ type: 'sync', room: getRoomDTO(room) }));
        }
      } else if (data.type === 'beam') {
        if (boundCode && rooms.has(boundCode)) {
          const room = rooms.get(boundCode);
          broadcast(room, {
            type: 'file_beamed',
            fileId: data.fileId,
            senderDeviceId: boundDeviceId,
          });
        }
      }
    } catch (e) {
      console.error('WS error:', e);
    }
  });

  ws.on('close', () => {
    if (boundCode && rooms.has(boundCode)) {
      const room = rooms.get(boundCode);
      room.sockets.delete(ws);
      if (boundDeviceId && room.devices.has(boundDeviceId)) {
        room.devices.delete(boundDeviceId);
        broadcast(room, { type: 'room_updated', room: getRoomDTO(room) });
      }
    }
  });
});

// REST API
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Create Room
app.post('/api/rooms/create', (req, res) => {
  const code = generateCode();
  const deviceType = req.body.deviceType || 'projector';
  const deviceId = 'dev-' + Math.random().toString(36).substring(2, 9);
  const deviceName = deviceType === 'projector' ? 'Projector Screen' : 'Host PC';

  const room = {
    code,
    createdAt: Date.now(),
    lastActive: Date.now(),
    devices: new Map(),
    files: new Map(),
    sockets: new Set(),
  };

  room.devices.set(deviceId, {
    id: deviceId,
    type: deviceType,
    name: deviceName,
    connectedAt: Date.now(),
  });

  rooms.set(code, room);
  res.json({ success: true, code, deviceId, room: getRoomDTO(room) });
});

// Join Room
app.post('/api/rooms/join', (req, res) => {
  const code = normalizeCode(req.body.code);
  const room = rooms.get(code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found. Check the 6-digit code on the screen.' });
  }

  const deviceType = req.body.deviceType || 'phone';
  const deviceId = 'dev-' + Math.random().toString(36).substring(2, 9);
  const count = room.devices.size + 1;
  const deviceName = deviceType === 'phone' ? `Phone #${count}` : `Laptop #${count}`;

  room.devices.set(deviceId, {
    id: deviceId,
    type: deviceType,
    name: deviceName,
    connectedAt: Date.now(),
  });

  broadcast(room, { type: 'room_updated', room: getRoomDTO(room) });
  res.json({ success: true, code, deviceId, room: getRoomDTO(room) });
});

// Upload files
app.post('/api/rooms/:code/upload', upload.array('files', 10), (req, res) => {
  const code = normalizeCode(req.params.code);
  const room = rooms.get(code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const uploaderName = req.body.uploaderName || 'Phone User';
  const uploadedFiles = [];

  for (const f of req.files) {
    const fileId = 'f-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now();
    const stored = {
      id: fileId,
      name: f.originalname,
      size: f.size,
      mimeType: f.mimetype,
      uploaderDevice: uploaderName,
      uploadedAt: Date.now(),
      diskPath: f.path,
    };
    room.files.set(fileId, stored);
    uploadedFiles.push({
      id: stored.id,
      name: stored.name,
      size: stored.size,
      mimeType: stored.mimeType,
      uploaderDevice: stored.uploaderDevice,
      uploadedAt: stored.uploadedAt,
      rawUrl: `/api/files/${stored.id}/raw`,
      downloadUrl: `/api/files/${stored.id}/download`,
    });
  }

  broadcast(room, {
    type: 'files_uploaded',
    files: uploadedFiles,
    room: getRoomDTO(room),
  });

  res.json({ success: true, files: uploadedFiles });
});

// Clear room for privacy
app.post('/api/rooms/:code/clear', (req, res) => {
  const code = normalizeCode(req.params.code);
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  for (const f of room.files.values()) {
    try {
      if (fs.existsSync(f.diskPath)) fs.unlinkSync(f.diskPath);
    } catch (e) {}
  }
  room.files.clear();
  broadcast(room, { type: 'room_cleared' });
  res.json({ success: true });
});

// Raw file for preview
app.get('/api/files/:fileId/raw', (req, res) => {
  const { fileId } = req.params;
  let file = null;
  for (const r of rooms.values()) {
    if (r.files.has(fileId)) {
      file = r.files.get(fileId);
      break;
    }
  }
  if (!file || !fs.existsSync(file.diskPath)) {
    return res.status(404).send('File not found or cleared');
  }
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
  fs.createReadStream(file.diskPath).pipe(res);
});

// Download attachment
app.get('/api/files/:fileId/download', (req, res) => {
  const { fileId } = req.params;
  let file = null;
  for (const r of rooms.values()) {
    if (r.files.has(fileId)) {
      file = r.files.get(fileId);
      break;
    }
  }
  if (!file || !fs.existsSync(file.diskPath)) {
    return res.status(404).send('File not found or cleared');
  }
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
  fs.createReadStream(file.diskPath).pipe(res);
});

// Fallback to index.html for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`🚀 Chand's File Dropper running on http://localhost:${PORT}`);
  console.log(`🦆 DuckDNS address: http://chandsfiledropper.duckdns.org:${PORT}`);
  console.log(`=================================================\n`);
});
