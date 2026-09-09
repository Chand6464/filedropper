import React, { useState, useRef, useEffect } from 'react';
import {
  Smartphone,
  Upload,
  Camera,
  FileText,
  Image as ImageIcon,
  Film,
  FileQuestion,
  Cast,
  Eye,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  X,
  ShieldCheck,
  Zap,
  RefreshCw,
  Bot,
  Webhook,
  Bookmark,
  Clock,
} from 'lucide-react';
import { RoomData, SharedFile, DiscordBridgeStatus } from '../types';
import { formatFileSize, getFileCategory } from '../utils/format';

interface PhoneSenderViewProps {
  initialCode?: string;
  room: RoomData | null;
  onJoinRoom: (code: string) => Promise<boolean>;
  onUploadFiles: (files: FileList) => Promise<void>;
  onRemoteOpen: (fileId: string) => void;
  onOpenFile: (file: SharedFile) => void;
  onDeleteFile: (fileId: string) => void;
  onDisconnect: () => void;
  onBackToSelection: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isUploading: boolean;
  uploadProgress?: number;
  discordStatus?: DiscordBridgeStatus | null;
  onForwardToDiscord?: (fileId: string) => Promise<{ success: boolean; message?: string }>;
  onOpenSavedVault?: () => void;
  onSaveFile?: (file: SharedFile) => void;
  savedVaultCount?: number;
}

export const PhoneSenderView: React.FC<PhoneSenderViewProps> = ({
  initialCode = '',
  room,
  onJoinRoom,
  onUploadFiles,
  onRemoteOpen,
  onOpenFile,
  onDeleteFile,
  onDisconnect,
  onBackToSelection,
  onRefresh,
  isRefreshing = false,
  isUploading,
  discordStatus,
  onForwardToDiscord,
  onOpenSavedVault,
  onSaveFile,
  savedVaultCount = 0,
}) => {
  const [codeDigits, setCodeDigits] = useState<string[]>(() => {
    const clean = initialCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const arr = ['', '', '', '', '', ''];
    for (let i = 0; i < clean.length; i++) {
      arr[i] = clean[i];
    }
    return arr;
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [beamedFileId, setBeamedFileId] = useState<string | null>(null);
  const [sendingDiscordId, setSendingDiscordId] = useState<string | null>(null);

  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Auto focus first input on mount if not in room
  useEffect(() => {
    if (!room) {
      inputRefs[0].current?.focus();
    }
  }, [room]);

  // Handle auto-submit if initialCode is full 6 chars
  useEffect(() => {
    const fullCode = codeDigits.join('');
    if (fullCode.length === 6 && !room && !isJoining) {
      handleJoinSubmit(fullCode);
    }
  }, []);

  const handleDigitChange = (index: number, val: string) => {
    const char = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const newDigits = [...codeDigits];
    newDigits[index] = char;
    setCodeDigits(newDigits);
    setErrorMsg(null);

    // Auto advance
    if (char && index < 5) {
      inputRefs[index + 1].current?.focus();
    }

    // Check if complete
    const full = newDigits.join('');
    if (full.length === 6) {
      handleJoinSubmit(full);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!pasteData) return;

    const newDigits = [...codeDigits];
    for (let i = 0; i < pasteData.length; i++) {
      newDigits[i] = pasteData[i];
    }
    setCodeDigits(newDigits);
    if (pasteData.length === 6) {
      handleJoinSubmit(pasteData);
    } else {
      inputRefs[Math.min(pasteData.length, 5)].current?.focus();
    }
  };

  const handleJoinSubmit = async (codeToJoin?: string) => {
    const code = (codeToJoin || codeDigits.join('')).trim();
    if (code.length < 6) {
      setErrorMsg('Please enter all 6 characters from the screen.');
      return;
    }

    setIsJoining(true);
    setErrorMsg(null);
    try {
      const success = await onJoinRoom(code);
      if (!success) {
        setErrorMsg('Invalid or expired code. Check the projector screen.');
      }
    } catch {
      setErrorMsg('Could not connect to projector. Please verify code.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleBeamClick = (file: SharedFile) => {
    onRemoteOpen(file.id);
    setBeamedFileId(file.id);
    setTimeout(() => setBeamedFileId(null), 3000);
  };

  // -------------------------------------------------------------
  // VIEW 1: ENTER 6-DIGIT CODE SCREEN
  // -------------------------------------------------------------
  if (!room) {
    return (
      <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6 bg-slate-950 text-slate-100">
        {/* Top bar */}
        <header className="flex items-center justify-between py-2">
          <button
            onClick={onBackToSelection}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Switch Role</span>
          </button>
          
          <div className="flex items-center space-x-2">
            {onOpenSavedVault && (
              <button
                id="phone-vault-btn"
                onClick={onOpenSavedVault}
                className="flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition"
                title="Saved Files Vault (Protected by 6-digit passcode)"
              >
                <Bookmark className="w-3.5 h-3.5 fill-amber-400/20 text-amber-400" />
                <span>Saved Files</span>
                {savedVaultCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-bold">
                    {savedVaultCount}
                  </span>
                )}
              </button>
            )}
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Phone Sender
            </span>
          </div>
        </header>

        {/* Pairing Form */}
        <main className="max-w-md mx-auto w-full my-auto py-8 text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-600/10">
            <Smartphone className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Pair with Projector
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Look at the projector or PC screen and enter the <strong>6-digit code</strong> shown there.
            </p>
          </div>

          {/* 6-Digit PIN Boxes */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 sm:gap-2.5" onPaste={handlePaste}>
              {codeDigits.map((digit, idx) => (
                <React.Fragment key={idx}>
                  {idx === 3 && (
                    <span className="text-slate-600 font-bold text-xl select-none">-</span>
                  )}
                  <input
                    ref={inputRefs[idx]}
                    type="text"
                    inputMode="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className="w-11 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-mono font-black uppercase rounded-xl bg-slate-900 border-2 border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 text-white outline-none transition"
                  />
                </React.Fragment>
              ))}
            </div>

            {errorMsg && (
              <div className="flex items-center justify-center space-x-1.5 text-xs text-rose-400 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              id="connect-room-btn"
              onClick={() => handleJoinSubmit()}
              disabled={isJoining}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition flex items-center justify-center space-x-2"
            >
              {isJoining ? (
                <span>Connecting to Screen...</span>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Connect to Projector</span>
                </>
              )}
            </button>
          </div>

          {/* Privacy Note */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-left flex items-start space-x-3 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>Private & Safe:</strong> Your personal phone number, WhatsApp chats, and profile will never be shown on the projector screen.
            </span>
          </div>
        </main>

        <footer className="text-center text-xs text-slate-500 py-3">
          Chand's File Dropper • Created by{' '}
          <a
            href="https://chand6464.github.io/r/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 transition"
          >
            Chand
          </a>{' '}
          • Fast Ephemeral Pairing
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: PAIRED ACTIVE TRANSFER DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6 bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="max-w-lg mx-auto w-full flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Paired with Screen
              </span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-bold">
                {room.code}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Ready to beam files</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenSavedVault && (
            <button
              id="phone-vault-paired-btn"
              onClick={onOpenSavedVault}
              className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition"
              title="Saved Files Vault"
            >
              <Bookmark className="w-3.5 h-3.5 fill-amber-400/20 text-amber-400" />
              <span>Vault</span>
              {savedVaultCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-bold">
                  {savedVaultCount}
                </span>
              )}
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition disabled:opacity-60"
              title="Refresh room"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          )}

          <button
            id="disconnect-phone-btn"
            onClick={onDisconnect}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Disconnect
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto w-full flex-1 py-6 space-y-6">
        {/* Discord Webhook Relay Notice */}
        {discordStatus?.configured && (
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-[11px] text-indigo-200">
            <div className="flex items-center space-x-2 truncate">
              {discordStatus.webhookConfigured ? (
                <Webhook className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              ) : (
                <Bot className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              )}
              <span className="truncate">
                {discordStatus.webhookConfigured
                  ? `Discord Webhook Active${discordStatus.webhookName ? ` (#${discordStatus.webhookName})` : ''} • Auto-Forwarding`
                  : 'Discord Relay Active • Auto-Forwarding'}
              </span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0 ml-2" />
          </div>
        )}

        {/* Upload Action Area */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Pick Files / Photos */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex flex-col items-center justify-center p-5 rounded-2xl bg-indigo-600/15 hover:bg-indigo-600/25 border-2 border-dashed border-indigo-500/40 text-center transition group cursor-pointer disabled:opacity-50"
            >
              <div className="p-3 rounded-full bg-indigo-600 text-white mb-2 group-hover:scale-110 transition">
                <Upload className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-100">Choose Files</span>
              <span className="text-[10px] text-slate-400 mt-0.5">PDF, PNG, JPG, Docs</span>
            </button>

            {/* Quick Camera Snapshot */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={isUploading}
              className="flex flex-col items-center justify-center p-5 rounded-2xl bg-emerald-600/15 hover:bg-emerald-600/25 border-2 border-dashed border-emerald-500/40 text-center transition group cursor-pointer disabled:opacity-50"
            >
              <div className="p-3 rounded-full bg-emerald-600 text-white mb-2 group-hover:scale-110 transition">
                <Camera className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-100">Take Photo</span>
              <span className="text-[10px] text-slate-400 mt-0.5">Direct to screen</span>
            </button>
          </div>

          {/* Hidden inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onUploadFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onUploadFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />

          {isUploading && (
            <div className="p-3.5 rounded-xl bg-indigo-950/60 border border-indigo-500/40 text-center space-y-1.5 animate-pulse">
              <div className="text-xs font-semibold text-indigo-300">
                Transferring file to projector...
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full w-2/3 animate-indeterminate" />
              </div>
            </div>
          )}
        </div>

        {/* Files Transferred in this Room */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Shared Files ({room.files.length})
            </h3>
            {room.files.length > 0 && (
              <span className="text-[11px] text-indigo-400 font-medium">
                Tap "Beam" to present
              </span>
            )}
          </div>

          {room.files.length === 0 ? (
            <div className="p-8 border border-slate-800/80 rounded-2xl text-center space-y-2 bg-slate-900/30">
              <div className="text-xs text-slate-400">
                No files uploaded yet. Pick a photo or document above to beam it to the projector!
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {room.files.map((file) => {
                const category = getFileCategory(file.mimeType, file.name);
                const isJustBeamed = beamedFileId === file.id;

                return (
                  <div
                    key={file.id}
                    className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col space-y-2.5"
                  >
                    <div className="flex items-center space-x-3 truncate">
                      {/* Icon */}
                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 text-slate-300">
                        {category === 'image' ? (
                          <img
                            src={file.rawUrl}
                            alt=""
                            className="w-10 h-10 object-cover rounded-lg"
                          />
                        ) : category === 'pdf' ? (
                          <FileText className="w-5 h-5 text-rose-400" />
                        ) : category === 'video' ? (
                          <Film className="w-5 h-5 text-sky-400" />
                        ) : (
                          <FileQuestion className="w-5 h-5 text-slate-400" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="truncate flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs sm:text-sm font-semibold text-white truncate">
                            {file.name}
                          </h4>
                          {file.isSaved ? (
                            <span className="shrink-0 ml-1 inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <Bookmark className="w-2.5 h-2.5 fill-current" />
                              <span>Saved</span>
                            </span>
                          ) : (
                            <span className="shrink-0 ml-1 inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800 text-slate-400">
                              <Clock className="w-2.5 h-2.5" />
                              <span>24h</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                          <span>{formatFileSize(file.size)}</span>
                          <span>•</span>
                          <span>{category.toUpperCase()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                      {/* BEAM TO PROJECTOR BUTTON */}
                      <button
                        onClick={() => handleBeamClick(file)}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          isJustBeamed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                        }`}
                      >
                        {isJustBeamed ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Beamed!</span>
                          </>
                        ) : (
                          <>
                            <Cast className="w-3.5 h-3.5" />
                            <span>Beam</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center space-x-1">
                        {/* Save to Vault (Button + Icon) */}
                        {onSaveFile && (
                          <button
                            onClick={() => onSaveFile(file)}
                            className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-semibold transition ${
                              file.isSaved
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300'
                            }`}
                            title={file.isSaved ? 'Saved in Vault & Discord' : 'Save File (6-digit passcode protected)'}
                          >
                            <Bookmark className={`w-3.5 h-3.5 ${file.isSaved ? 'fill-amber-400 text-amber-400' : ''}`} />
                            <span>{file.isSaved ? 'Saved' : 'Save'}</span>
                          </button>
                        )}

                        {/* Discord Forward Status / Button */}
                        {file.forwardedToDiscord ? (
                          <span
                            className="inline-flex items-center space-x-1 px-1.5 py-1 rounded-lg text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                            title="Forwarded to Discord"
                          >
                            <Bot className="w-3 h-3" />
                            <span>Sent ✓</span>
                          </span>
                        ) : onForwardToDiscord ? (
                          <button
                            onClick={async () => {
                              setSendingDiscordId(file.id);
                              await onForwardToDiscord(file.id);
                              setSendingDiscordId(null);
                            }}
                            disabled={sendingDiscordId === file.id}
                            className="p-1.5 rounded-lg bg-slate-800 text-indigo-400 hover:text-indigo-300 transition disabled:opacity-50"
                            title="Send to Discord"
                          >
                            <Bot className={`w-3.5 h-3.5 ${sendingDiscordId === file.id ? 'animate-spin' : ''}`} />
                          </button>
                        ) : null}

                        <button
                          onClick={() => onOpenFile(file)}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                          title="Preview on phone"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={file.downloadUrl}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => onDeleteFile(file.id)}
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <footer className="max-w-lg mx-auto w-full text-center text-xs text-slate-500 py-2 border-t border-slate-850 flex items-center justify-between">
        <span>Presentation safe • WhatsApp leak protected</span>
        <span>
          By{' '}
          <a
            href="https://chand6464.github.io/r/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 transition"
          >
            Chand
          </a>
        </span>
      </footer>
    </div>
  );
};
