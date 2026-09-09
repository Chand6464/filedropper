import React, { useState, useEffect } from 'react';
import {
  Projector,
  Smartphone,
  Eye,
  Download,
  Trash2,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Sun,
  Moon,
  QrCode,
  ShieldAlert,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Film,
  FileQuestion,
  Check,
  Copy,
  Sparkles,
  ArrowLeft,
  Tv,
  RefreshCw,
  Bot,
  ShieldCheck,
  Webhook,
  Bookmark,
  Clock,
} from 'lucide-react';
import { RoomData, SharedFile, DiscordBridgeStatus } from '../types';
import { formatFileSize, getFileCategory } from '../utils/format';
import { QRCodeBox } from './QRCodeBox';

interface ProjectorScreenViewProps {
  room: RoomData;
  connectedPhoneCount: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenFile: (file: SharedFile) => void;
  onDeleteFile: (fileId: string) => void;
  onClearRoom: () => void;
  onUploadFile: (files: FileList) => void;
  onBackToSelection: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isUploading: boolean;
  discordStatus?: DiscordBridgeStatus | null;
  onOpenDiscordModal?: () => void;
  onForwardToDiscord?: (fileId: string) => Promise<{ success: boolean; message?: string }>;
  onOpenSavedVault: () => void;
  onSaveFile: (file: SharedFile) => void;
  savedVaultCount?: number;
}

export const ProjectorScreenView: React.FC<ProjectorScreenViewProps> = ({
  room,
  connectedPhoneCount,
  soundEnabled,
  onToggleSound,
  onOpenFile,
  onDeleteFile,
  onClearRoom,
  onUploadFile,
  onBackToSelection,
  onRefresh,
  isRefreshing = false,
  isUploading,
  discordStatus,
  onOpenDiscordModal,
  onForwardToDiscord,
  onOpenSavedVault,
  onSaveFile,
  savedVaultCount = 0,
}) => {
  const [highContrast, setHighContrast] = useState(false);
  const [showQR, setShowQR] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sendingDiscordFileId, setSendingDiscordFileId] = useState<string | null>(null);

  // Full URL for mobile pairing
  const pairingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}?code=${room.code}&role=phone`
    : '';

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(pairingUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const codeChars = room.code.split('');

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        highContrast
          ? 'bg-black text-amber-300 font-mono'
          : 'bg-slate-950 text-slate-100 font-sans'
      }`}
    >
      {/* Top Projector Toolbar */}
      <header
        className={`px-4 sm:px-8 py-4 border-b flex flex-wrap items-center justify-between gap-4 ${
          highContrast
            ? 'border-amber-400 bg-black'
            : 'border-slate-800 bg-slate-900/70 backdrop-blur-md'
        }`}
      >
        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToSelection}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
            title="Change device role"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-2.5">
            <div
              className={`p-2 rounded-xl ${
                highContrast
                  ? 'bg-amber-400 text-black font-bold'
                  : 'bg-indigo-600/20 text-indigo-400'
              }`}
            >
              <Projector className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base sm:text-lg">Chand's File Dropper</span>
                <a
                  href="https://chand6464.github.io/r/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-indigo-200 border border-slate-700 font-semibold transition"
                  title="Visit Chand's Profile"
                >
                  By Chand
                </a>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 ${
                    connectedPhoneCount > 0
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      connectedPhoneCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  <span>
                    {connectedPhoneCount > 0
                      ? `${connectedPhoneCount} Phone${connectedPhoneCount > 1 ? 's' : ''} Connected`
                      : 'Waiting for Phone...'}
                  </span>
                </span>
              </div>
              <p className="text-xs opacity-70">
                Private, direct file display • Zero WhatsApp leak risk
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Live Sync Status & Manual Refresh */}
          {onRefresh && (
            <button
              id="live-sync-refresh-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition disabled:opacity-60"
              title="Click to force-sync room files immediately"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Live Sync'}</span>
            </button>
          )}

          {/* Discord Webhook Bridge Modal Button */}
          {onOpenDiscordModal && (
            <button
              id="discord-bridge-modal-btn"
              onClick={onOpenDiscordModal}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                discordStatus?.configured
                  ? 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/40 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Connect & relay files directly to Discord Webhook (No bot hosting needed)"
            >
              <Webhook className="w-3.5 h-3.5 text-indigo-400" />
              <span>Discord {discordStatus?.webhookConfigured ? 'Webhook' : 'Relay'}</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  discordStatus?.configured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
            </button>
          )}

          {/* High Contrast Toggle for Blurry Projectors */}
          <button
            id="high-contrast-toggle"
            onClick={() => setHighContrast(!highContrast)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              highContrast
                ? 'bg-amber-400 text-black border-amber-400 font-bold'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Toggle high-contrast mode for blurry projectors"
          >
            {highContrast ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span>{highContrast ? 'Standard Mode' : 'Blurry Lens Boost'}</span>
          </button>

          {/* Sound Alert Toggle */}
          <button
            id="sound-toggle-btn"
            onClick={onToggleSound}
            className={`p-2 rounded-lg border transition ${
              soundEnabled
                ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title={soundEnabled ? 'Arrival chime active' : 'Sound muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* QR Code Toggle */}
          <button
            id="toggle-qr-btn"
            onClick={() => setShowQR(!showQR)}
            className={`flex items-center space-x-1 px-3 py-1.5 text-xs rounded-lg border transition ${
              showQR
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Toggle QR code"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{showQR ? 'Hide QR' : 'Show QR'}</span>
          </button>

          {/* Fullscreen Button */}
          <button
            id="fullscreen-screen-btn"
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Saved Files Vault Button */}
          <button
            id="saved-vault-header-btn"
            onClick={onOpenSavedVault}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition shadow-sm"
            title="Saved Files Vault (6-digit passcode protection & Discord archive)"
          >
            <Bookmark className="w-3.5 h-3.5 fill-amber-400/20 text-amber-400" />
            <span className="hidden sm:inline">Saved Files</span>
            <span className="sm:hidden">Saved</span>
            {savedVaultCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-200 border border-amber-500/30 font-bold">
                {savedVaultCount}
              </span>
            )}
          </button>

          {/* Privacy Wipe */}
          <button
            id="privacy-wipe-btn"
            onClick={() => {
              if (window.confirm('Wipe all beamed files from the screen and server?')) {
                onClearRoom();
              }
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition"
            title="Instant wipe all files for privacy"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Wipe & Clear</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 flex flex-col space-y-8">
        {/* Blurry-Screen Proof Pairing Banner */}
        <section
          className={`p-6 sm:p-8 rounded-3xl border shadow-2xl transition-all ${
            highContrast
              ? 'bg-black border-4 border-amber-400 text-amber-300'
              : 'bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            {/* Pairing Instructions & Giant Code */}
            <div className="space-y-4 text-center lg:text-left flex-1">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Pair from Any Phone or Laptop Without App Installation</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold">
                1. On your phone, go to this website:
              </h2>
              <div className="flex items-center justify-center lg:justify-start space-x-2">
                <span className="font-mono text-sm sm:text-lg bg-slate-800/90 px-4 py-2 rounded-xl border border-slate-700 select-all font-bold text-white">
                  {typeof window !== 'undefined' ? window.location.host : 'this website'}
                </span>
                <button
                  onClick={copyUrl}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition"
                  title="Copy direct phone link"
                >
                  {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold pt-2">
                2. Enter this 6-Digit Pairing Code:
              </h2>

              {/* Blurry-Safe Giant 6-Character Display */}
              <div className="flex items-center justify-center lg:justify-start gap-2 sm:gap-3 my-3">
                {codeChars.map((char, index) => (
                  <React.Fragment key={index}>
                    {index === 3 && (
                      <span className="text-2xl sm:text-4xl font-black text-slate-600 px-1 select-none">
                        -
                      </span>
                    )}
                    <div
                      className={`w-12 h-16 sm:w-16 sm:h-20 flex items-center justify-center rounded-2xl border-3 text-2xl sm:text-4xl font-black font-mono shadow-xl transition transform hover:scale-105 select-all ${
                        highContrast
                          ? 'bg-amber-400 text-black border-white'
                          : 'bg-slate-800 text-white border-indigo-500/60 shadow-indigo-500/10'
                      }`}
                    >
                      {char}
                    </div>
                  </React.Fragment>
                ))}

                <button
                  onClick={copyCode}
                  className="ml-2 p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  title="Copy 6-digit code"
                >
                  {copiedCode ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>

              <p className="text-xs text-slate-400">
                👓 <strong>Designed for blurry projectors:</strong> Ambiguous characters (0, O, 1, I) are disabled.
              </p>

              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs text-indigo-300 flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  <strong>Tip for cross-device testing:</strong> Scan the QR code or ensure both your phone and PC are on the exact same published URL.
                </span>
              </div>
            </div>

            {/* Optional QR Code Box for Clear Projectors */}
            {showQR && (
              <div className="flex flex-col items-center p-4 bg-slate-900 rounded-2xl border border-slate-800 shadow-xl text-center shrink-0">
                <span className="text-xs font-semibold text-slate-300 mb-2">
                  Or Scan with Phone Camera:
                </span>
                <QRCodeBox url={pairingUrl} size={160} />
                <span className="text-[11px] text-slate-400 mt-2 max-w-[180px]">
                  (If the projector is blurry, just type the 6 digits on the left)
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Beamed Files Grid */}
        <section className="space-y-4 flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-bold">Beamed Files</h3>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-xs font-semibold text-slate-300">
                {room.files.length} file{room.files.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Also allow Projector/PC to drop files to share back with phone */}
            <label className="cursor-pointer flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition">
              <UploadCloud className="w-4 h-4 text-indigo-400" />
              <span>{isUploading ? 'Uploading...' : 'Send File from Screen'}</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onUploadFile(e.target.files);
                  }
                }}
              />
            </label>
          </div>

          {room.files.length === 0 ? (
            <div className="p-12 sm:p-16 border-2 border-dashed border-slate-800 rounded-3xl text-center space-y-3 bg-slate-900/30">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Tv className="w-8 h-8 opacity-80" />
              </div>
              <h4 className="text-base font-semibold text-slate-200">No files beamed yet</h4>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                Once someone enters code <strong className="font-mono text-indigo-400">{room.code}</strong> on their phone, any photo, PDF, or document they send will appear right here instantly!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {room.files.map((file) => {
                const category = getFileCategory(file.mimeType, file.name);

                return (
                  <div
                    key={file.id}
                    className="group relative bg-slate-900 border border-slate-800 hover:border-indigo-500/70 rounded-2xl overflow-hidden shadow-lg transition-all duration-200 flex flex-col justify-between"
                  >
                    {/* Thumbnail / Category Header */}
                    <div
                      onClick={() => onOpenFile(file)}
                      className="cursor-pointer aspect-video bg-slate-950/80 relative flex items-center justify-center overflow-hidden border-b border-slate-800/80"
                    >
                      {category === 'image' ? (
                        <img
                          src={file.rawUrl}
                          alt={file.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          loading="lazy"
                        />
                      ) : category === 'pdf' ? (
                        <div className="flex flex-col items-center justify-center space-y-2 text-rose-400">
                          <FileText className="w-10 h-10" />
                          <span className="text-[11px] font-semibold uppercase tracking-wider bg-rose-500/20 px-2 py-0.5 rounded">
                            PDF Document
                          </span>
                        </div>
                      ) : category === 'video' ? (
                        <div className="flex flex-col items-center justify-center space-y-2 text-sky-400">
                          <Film className="w-10 h-10" />
                          <span className="text-[11px] font-semibold uppercase tracking-wider bg-sky-500/20 px-2 py-0.5 rounded">
                            Video
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center space-y-2 text-slate-400">
                          <FileQuestion className="w-10 h-10" />
                          <span className="text-[11px] font-semibold uppercase tracking-wider bg-slate-800 px-2 py-0.5 rounded">
                            {category.toUpperCase()}
                          </span>
                        </div>
                      )}

                      {/* Hover Overlay with Preview Icon */}
                      <div className="absolute inset-0 bg-indigo-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition backdrop-blur-[2px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFile(file);
                          }}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg transition"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Open</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSaveFile(file);
                          }}
                          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-lg transition ${
                            file.isSaved
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 hover:bg-amber-500 text-white hover:text-slate-950'
                          }`}
                          title={file.isSaved ? 'Saved in Vault & Discord' : 'Save File'}
                        >
                          <Bookmark className={`w-3.5 h-3.5 ${file.isSaved ? 'fill-current' : ''}`} />
                          <span>{file.isSaved ? 'Saved' : 'Save'}</span>
                        </button>
                      </div>

                      {/* Expiry / Saved Badge */}
                      <div className="absolute top-2 right-2 z-10 pointer-events-none">
                        {file.isSaved ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/90 text-slate-950 shadow-md">
                            <Bookmark className="w-2.5 h-2.5 fill-current" />
                            <span>Vault Saved</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-900/80 text-slate-400 border border-slate-700/60 backdrop-blur-sm">
                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                            <span>24h memory</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* File Meta & Quick Actions */}
                    <div className="p-3.5 flex flex-col justify-between flex-1 space-y-2">
                      <div>
                        <h4
                          onClick={() => onOpenFile(file)}
                          className="text-xs sm:text-sm font-semibold text-slate-100 truncate cursor-pointer hover:text-indigo-400 transition"
                          title={file.name}
                        >
                          {file.name}
                        </h4>
                        <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-1">
                          <span>{formatFileSize(file.size)}</span>
                          <span>•</span>
                          <span className="truncate">From {file.uploaderDevice}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <button
                          onClick={() => onOpenFile(file)}
                          className="flex items-center space-x-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Present</span>
                        </button>

                        <div className="flex items-center space-x-1.5">
                          {/* Save to Vault (Button + Icon) */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSaveFile(file);
                            }}
                            className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-semibold transition ${
                              file.isSaved
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700/70'
                            }`}
                            title={file.isSaved ? 'Saved in Vault & Discord' : 'Save File (requires 6-digit code, saved to Discord)'}
                          >
                            <Bookmark className={`w-3.5 h-3.5 ${file.isSaved ? 'fill-amber-400 text-amber-400' : ''}`} />
                            <span className="hidden sm:inline">{file.isSaved ? 'Saved' : 'Save'}</span>
                          </button>

                          {/* Discord Status / Forward Button */}
                          {file.forwardedToDiscord ? (
                            <span
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                              title="Saved / Forwarded to Discord Server"
                            >
                              <Bot className="w-3 h-3" />
                              <span>Discord ✓</span>
                            </span>
                          ) : onForwardToDiscord ? (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                setSendingDiscordFileId(file.id);
                                await onForwardToDiscord(file.id);
                                setSendingDiscordFileId(null);
                              }}
                              disabled={sendingDiscordFileId === file.id}
                              className="p-1.5 rounded-lg hover:bg-indigo-900/30 text-indigo-400 hover:text-indigo-300 transition disabled:opacity-50"
                              title="Forward file to Discord bot / webhook"
                            >
                              <Bot className={`w-3.5 h-3.5 ${sendingDiscordFileId === file.id ? 'animate-spin' : ''}`} />
                            </button>
                          ) : null}

                          <a
                            href={file.downloadUrl}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => onDeleteFile(file.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-900/30 text-slate-400 hover:text-rose-300 transition"
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="max-w-6xl mx-auto w-full text-center text-xs text-slate-500 py-3 mt-4 border-t border-slate-850 flex items-center justify-between">
        <span>Chand's File Dropper • Zero WhatsApp Leak Risk</span>
        <span>
          Created by{' '}
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
