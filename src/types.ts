export type DeviceType = 'projector' | 'phone' | 'pc';

export interface DeviceInfo {
  id: string;
  type: DeviceType;
  name: string;
  connectedAt: number;
}

export interface SharedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploaderDevice: string;
  uploadedAt: number;
  rawUrl: string;
  downloadUrl: string;
  forwardedToDiscord?: boolean;
  discordForwardError?: string;
  isSaved?: boolean;
  expiresInMs?: number;
}

export interface SavedVaultFile {
  id: string;
  originalFileId?: string;
  name: string;
  size: number;
  mimeType: string;
  savedAt: number;
  savedByDevice?: string;
  forwardedToDiscord: boolean;
  discordError?: string;
  rawUrl: string;
  downloadUrl: string;
}

export interface VaultStatus {
  hasPasscode: boolean;
  count: number;
}

export interface DiscordBridgeStatus {
  configured: boolean;
  mode: 'webhook' | 'bot' | 'hybrid' | 'none';
  botEndpointConfigured: boolean;
  webhookConfigured: boolean;
  secretConfigured: boolean;
  targetDescription: string;
  webhookMasked?: string;
  webhookName?: string;
  hasAdminPin?: boolean;
}

export interface DiscordForwardResult {
  success: boolean;
  message: string;
  targets?: {
    pythonBot?: { success: boolean; status?: number; error?: string };
    webhook?: { success: boolean; status?: number; error?: string };
  };
}

export interface RoomData {
  code: string;
  createdAt: number;
  devices: DeviceInfo[];
  files: SharedFile[];
}

export type WsClientAction =
  | { type: 'join'; code: string; deviceId: string; deviceType: DeviceType; name: string }
  | { type: 'ping' }
  | { type: 'remote_open'; code: string; fileId: string };

export type WsServerEvent =
  | { type: 'room_state'; room: RoomData }
  | { type: 'peer_joined'; device: DeviceInfo }
  | { type: 'peer_left'; deviceId: string }
  | { type: 'file_added'; file: SharedFile }
  | { type: 'file_updated'; file: SharedFile }
  | { type: 'file_removed'; fileId: string }
  | { type: 'room_cleared' }
  | { type: 'remote_open'; file: SharedFile };
