import { useState, useEffect, useRef, useCallback } from 'react';
import { DeviceType, RoomData, SharedFile, DiscordBridgeStatus } from './types';
import { DeviceSelection } from './components/DeviceSelection';
import { ProjectorScreenView } from './components/ProjectorScreenView';
import { PhoneSenderView } from './components/PhoneSenderView';
import { FileViewerModal } from './components/FileViewerModal';
import { DiscordBridgeModal } from './components/DiscordBridgeModal';
import { SavedVaultModal } from './components/SavedVaultModal';
import { playChime } from './utils/audio';
import { Bookmark } from 'lucide-react';

export default function App() {
  const [role, setRole] = useState<DeviceType | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [activeViewingFile, setActiveViewingFile] = useState<SharedFile | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialCodeParam, setInitialCodeParam] = useState<string>('');
  const [discordStatus, setDiscordStatus] = useState<DiscordBridgeStatus | null>(null);
  const [isDiscordModalOpen, setIsDiscordModalOpen] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [pendingFileToSave, setPendingFileToSave] = useState<SharedFile | null>(null);
  const [savedVaultCount, setSavedVaultCount] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const roomRef = useRef<RoomData | null>(null);
  roomRef.current = room;

  const roleRef = useRef<DeviceType | null>(null);
  roleRef.current = role;

  const activeViewingRef = useRef<SharedFile | null>(null);
  activeViewingRef.current = activeViewingFile;

  const pingIntervalRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Background HTTP polling to guarantee sync even if WebSockets are dropped by Cloud Run/mobile network
  const refreshRoomData = useCallback(async (code: string) => {
    try {
      const res = await fetch(`/api/rooms/${code}`);
      if (!res.ok) return;
      const data: RoomData = await res.json();
      setRoom((prev) => {
        if (!prev) return data;
        const prevFileIds = new Set(prev.files.map((f) => f.id));
        const hasNew = data.files.some((f) => !prevFileIds.has(f.id));
        if (hasNew && roleRef.current === 'projector' && soundRef.current) {
          playChime();
        }
        return data;
      });
    } catch {
      // transient network poll failure
    }
  }, []);

  // Fetch Discord Bridge status
  const refreshDiscordStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/discord/status');
      if (res.ok) {
        const data: DiscordBridgeStatus = await res.json();
        setDiscordStatus(data);
      }
    } catch (err) {
      console.error('Failed to load Discord bridge status:', err);
    }
  }, []);

  useEffect(() => {
    refreshDiscordStatus();
  }, [refreshDiscordStatus]);

  // Fetch Saved Vault count
  const fetchVaultCount = useCallback(async () => {
    try {
      const res = await fetch('/api/vault/status');
      if (res.ok) {
        const data = await res.json();
        setSavedVaultCount(data.count || 0);
      }
    } catch (err) {
      console.error('Failed to get vault count:', err);
    }
  }, []);

  useEffect(() => {
    fetchVaultCount();
  }, [fetchVaultCount]);

  // Save file trigger
  const handleSaveFile = (file: SharedFile) => {
    setPendingFileToSave(file);
    setIsVaultModalOpen(true);
  };

  // Open vault
  const handleOpenVault = () => {
    setPendingFileToSave(null);
    setIsVaultModalOpen(true);
  };

  // Forward a specific file to Discord bot/webhook
  const handleForwardToDiscord = useCallback(async (fileId: string): Promise<{ success: boolean; message?: string }> => {
    if (!roomRef.current?.code) return { success: false, message: 'No active room found' };
    try {
      const res = await fetch(`/api/rooms/${roomRef.current.code}/files/${fileId}/forward-discord`, {
        method: 'POST',
      });
      const result = await res.json();
      if (result.success) {
        setRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            files: prev.files.map((f) =>
              f.id === fileId ? { ...f, forwardedToDiscord: true } : f
            ),
          };
        });
      }
      return { success: result.success, message: result.message };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to send to Discord' };
    }
  }, []);

  // Poll room every 1.5 seconds while room is active
  useEffect(() => {
    if (!room?.code) return;
    const interval = setInterval(() => {
      refreshRoomData(room.code);
    }, 1500);
    return () => clearInterval(interval);
  }, [room?.code, refreshRoomData]);

  // Inspect URL query params on launch (e.g. ?code=XYZ&role=phone)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    const roleParam = params.get('role') as DeviceType | null;

    if (codeParam) {
      setInitialCodeParam(codeParam.toUpperCase());
    }

    if (roleParam === 'phone' || roleParam === 'projector' || roleParam === 'pc') {
      setRole(roleParam);
    }
  }, []);

  // Initialize or connect WebSocket with heartbeat and auto-reconnection
  const setupWebSocket = useCallback((code: string, currentDeviceId: string, currentRole: DeviceType) => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'join',
          code,
          deviceId: currentDeviceId,
          deviceType: currentRole,
          name: currentRole === 'projector' ? 'Projector Screen' : 'Phone',
        })
      );

      // Cloud Run keepalive heartbeat every 15 seconds
      pingIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 15000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'room_state') {
          setRoom(data.room);
        } else if (data.type === 'file_added') {
          const newFile: SharedFile = data.file;
          setRoom((prev) => {
            if (!prev) return prev;
            // Prevent duplicate insertion
            if (prev.files.some((f) => f.id === newFile.id)) return prev;
            return {
              ...prev,
              files: [newFile, ...prev.files],
            };
          });

          // If on projector, play audio chime
          if (currentRole === 'projector' && soundRef.current) {
            playChime();
          }
        } else if (data.type === 'file_updated') {
          const updatedFile: SharedFile = data.file;
          setRoom((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              files: prev.files.map((f) => (f.id === updatedFile.id ? updatedFile : f)),
            };
          });
        } else if (data.type === 'file_removed') {
          setRoom((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              files: prev.files.filter((f) => f.id !== data.fileId),
            };
          });
          if (activeViewingRef.current?.id === data.fileId) {
            setActiveViewingFile(null);
          }
        } else if (data.type === 'room_cleared') {
          setRoom((prev) => {
            if (!prev) return prev;
            return { ...prev, files: [] };
          });
          setActiveViewingFile(null);
        } else if (data.type === 'peer_joined') {
          setRoom((prev) => {
            if (!prev) return prev;
            const exists = prev.devices.some((d) => d.id === data.device.id);
            if (exists) return prev;
            return { ...prev, devices: [...prev.devices, data.device] };
          });
        } else if (data.type === 'peer_left') {
          setRoom((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              devices: prev.devices.filter((d) => d.id !== data.deviceId),
            };
          });
        } else if (data.type === 'remote_open') {
          // Presenter commanded screen to open file full screen
          if (currentRole === 'projector') {
            setActiveViewingFile(data.file);
            if (soundRef.current) {
              playChime();
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    ws.onclose = () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      // Auto reconnect after 2 seconds if session is still active
      if (roomRef.current?.code === code && roleRef.current) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (roomRef.current?.code === code && roleRef.current) {
            setupWebSocket(code, currentDeviceId, currentRole);
          }
        }, 2000);
      }
    };

    socketRef.current = ws;
  }, [refreshRoomData]);

  // Cleanup timers and websocket on unmount
  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  // Force manual refresh
  const handleManualRefresh = async () => {
    if (!room?.code) return;
    setIsRefreshing(true);
    try {
      await refreshRoomData(room.code);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Handle device selection
  const handleSelectRole = async (selectedRole: DeviceType) => {
    setRole(selectedRole);

    if (selectedRole === 'projector' || selectedRole === 'pc') {
      try {
        const res = await fetch('/api/rooms/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceType: selectedRole,
            deviceName: selectedRole === 'projector' ? 'Projector Screen' : 'PC Screen',
          }),
        });
        const data = await res.json();
        if (data.success) {
          setRoom(data.room);
          setDeviceId(data.deviceId);
          setupWebSocket(data.code, data.deviceId, selectedRole);
        }
      } catch (err) {
        console.error('Failed to create room:', err);
      }
    }
  };

  // Handle joining room via 6-digit code (Phone or Guest PC)
  const handleJoinRoom = async (code: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          deviceType: role || 'phone',
          deviceName: role === 'phone' ? 'Phone' : 'PC Guest',
        }),
      });

      if (!res.ok) {
        return false;
      }

      const data = await res.json();
      if (data.success) {
        setRoom(data.room);
        setDeviceId(data.deviceId);
        setupWebSocket(data.code, data.deviceId, role || 'phone');
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to join room:', err);
      return false;
    }
  };

  // Upload files handler
  const handleUploadFiles = async (files: FileList) => {
    if (!room) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      formData.append('uploaderName', role === 'phone' ? 'Phone' : 'Projector / Screen');

      const res = await fetch(`/api/rooms/${room.code}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${res.status}`);
      }

      const data = await res.json();
      if (data.success && data.files) {
        // Immediately fetch updated room to sync with server
        await refreshRoomData(room.code);
      }
    } catch (err: any) {
      console.error('File upload error:', err);
      alert(`Upload error: ${err?.message || 'Could not upload files. Please check network connection.'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Remote open trigger (from phone to projector)
  const handleRemoteOpen = async (fileId: string) => {
    if (!room) return;
    try {
      await fetch(`/api/rooms/${room.code}/remote-open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
    } catch (err) {
      console.error('Remote open error:', err);
    }
  };

  // Delete file
  const handleDeleteFile = async (fileId: string) => {
    if (!room) return;
    try {
      await fetch(`/api/rooms/${room.code}/files/${fileId}`, {
        method: 'DELETE',
      });
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          files: prev.files.filter((f) => f.id !== fileId),
        };
      });
      if (activeViewingFile?.id === fileId) {
        setActiveViewingFile(null);
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Privacy wipe & clear all files
  const handleClearRoom = async () => {
    if (!room) return;
    try {
      await fetch(`/api/rooms/${room.code}/clear`, {
        method: 'POST',
      });
      setRoom((prev) => {
        if (!prev) return prev;
        return { ...prev, files: [] };
      });
      setActiveViewingFile(null);
    } catch (err) {
      console.error('Clear room error:', err);
    }
  };

  // Disconnect & Reset
  const handleDisconnect = () => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    setRoom(null);
    setDeviceId(null);
    setActiveViewingFile(null);
  };

  const handleBackToSelection = () => {
    handleDisconnect();
    setRole(null);
  };

  // Calculate connected phones
  const connectedPhones = room
    ? room.devices.filter((d) => d.type === 'phone').length
    : 0;

  return (
    <div id="app-container" className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* 1. Device Selection Prompt */}
      {!role && (
        <DeviceSelection
          onSelect={handleSelectRole}
        />
      )}

      {/* 2. Projector / Big Screen Mode */}
      {role === 'projector' && room && (
        <ProjectorScreenView
          room={room}
          connectedPhoneCount={connectedPhones}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          onOpenFile={(file) => setActiveViewingFile(file)}
          onDeleteFile={handleDeleteFile}
          onClearRoom={handleClearRoom}
          onUploadFile={handleUploadFiles}
          onBackToSelection={handleBackToSelection}
          onRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
          isUploading={isUploading}
          discordStatus={discordStatus}
          onOpenDiscordModal={() => setIsDiscordModalOpen(true)}
          onForwardToDiscord={handleForwardToDiscord}
          onOpenSavedVault={handleOpenVault}
          onSaveFile={handleSaveFile}
          savedVaultCount={savedVaultCount}
        />
      )}

      {/* 3. Phone Mode */}
      {role === 'phone' && (
        <PhoneSenderView
          initialCode={initialCodeParam}
          room={room}
          onJoinRoom={handleJoinRoom}
          onUploadFiles={handleUploadFiles}
          onRemoteOpen={handleRemoteOpen}
          onOpenFile={(file) => setActiveViewingFile(file)}
          onDeleteFile={handleDeleteFile}
          onDisconnect={handleDisconnect}
          onBackToSelection={handleBackToSelection}
          onRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
          isUploading={isUploading}
          discordStatus={discordStatus}
          onForwardToDiscord={handleForwardToDiscord}
          onOpenSavedVault={handleOpenVault}
          onSaveFile={handleSaveFile}
          savedVaultCount={savedVaultCount}
        />
      )}

      {/* 4. PC Mode (Can display as receiver or join with code) */}
      {role === 'pc' && room && (
        <ProjectorScreenView
          room={room}
          connectedPhoneCount={connectedPhones}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          onOpenFile={(file) => setActiveViewingFile(file)}
          onDeleteFile={handleDeleteFile}
          onClearRoom={handleClearRoom}
          onUploadFile={handleUploadFiles}
          onBackToSelection={handleBackToSelection}
          onRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
          isUploading={isUploading}
          discordStatus={discordStatus}
          onOpenDiscordModal={() => setIsDiscordModalOpen(true)}
          onForwardToDiscord={handleForwardToDiscord}
          onOpenSavedVault={handleOpenVault}
          onSaveFile={handleSaveFile}
          savedVaultCount={savedVaultCount}
        />
      )}

      {/* Fullscreen File Viewer for Images, PDFs, Video, Audio, Text */}
      <FileViewerModal
        file={activeViewingFile}
        files={room?.files || []}
        onClose={() => setActiveViewingFile(null)}
        onSelectFile={(f) => setActiveViewingFile(f)}
        onSaveFile={handleSaveFile}
      />

      {/* Everywhere Floating Quick-Access Vault Button */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          id="floating-saved-vault-btn"
          onClick={handleOpenVault}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-2xl shadow-amber-500/20 transition-all transform hover:scale-105 active:scale-95 border border-amber-300 select-none"
          title="Saved Files Vault (6-digit passcode protection & Discord archive)"
        >
          <Bookmark className="w-4 h-4 fill-current text-slate-950" />
          <span>Saved Files</span>
          {savedVaultCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950 text-amber-300 font-black">
              {savedVaultCount}
            </span>
          )}
        </button>
      </div>

      {/* Saved Files Vault Modal (Passcode setup / login / permanent storage) */}
      <SavedVaultModal
        isOpen={isVaultModalOpen}
        onClose={() => {
          setIsVaultModalOpen(false);
          setPendingFileToSave(null);
          fetchVaultCount();
        }}
        pendingFileToSave={pendingFileToSave}
        onClearPendingFile={() => {
          setPendingFileToSave(null);
          fetchVaultCount();
          if (room?.code) {
            refreshRoomData(room.code);
          }
        }}
        onOpenFile={(f) => setActiveViewingFile(f)}
      />

      {/* Discord Bot Bridge Modal */}
      <DiscordBridgeModal
        isOpen={isDiscordModalOpen}
        onClose={() => setIsDiscordModalOpen(false)}
        status={discordStatus}
        onRefreshStatus={refreshDiscordStatus}
      />
    </div>
  );
}
