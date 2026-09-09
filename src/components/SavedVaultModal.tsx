import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Lock,
  Unlock,
  KeyRound,
  Bookmark,
  ShieldCheck,
  Download,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Film,
  FileQuestion,
  UploadCloud,
  LogOut,
  Sparkles,
  Bot,
  Search,
  Clock,
  HardDrive,
} from 'lucide-react';
import { SavedVaultFile, SharedFile, VaultStatus } from '../types';
import { formatFileSize, getFileCategory } from '../utils/format';

interface SavedVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  // If user clicked "Save" on a file, pendingFileToSave will be set
  pendingFileToSave?: SharedFile | null;
  onClearPendingFile?: () => void;
  onOpenFile?: (file: SharedFile) => void;
}

export const SavedVaultModal: React.FC<SavedVaultModalProps> = ({
  isOpen,
  onClose,
  pendingFileToSave,
  onClearPendingFile,
  onOpenFile,
}) => {
  // Vault status: hasPasscode, count
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>({ hasPasscode: false, count: 0 });
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Authentication session
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return sessionStorage.getItem('vault_token') || null;
  });

  // PIN Inputs (6 digits)
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [confirmDigits, setConfirmDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isConfirmingSetup, setIsConfirmingSetup] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Saved files data
  const [savedFiles, setSavedFiles] = useState<SavedVaultFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [isSavingPending, setIsSavingPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const digitRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const confirmRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Fetch status on open
  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/vault/status');
      if (res.ok) {
        const data: VaultStatus = await res.json();
        setVaultStatus(data);
      }
    } catch (err) {
      console.error('Failed to get vault status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Fetch saved files
  const fetchSavedFiles = async (token: string) => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch('/api/vault/files', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSavedFiles(data.files || []);
        }
      } else if (res.status === 401) {
        // Token expired
        sessionStorage.removeItem('vault_token');
        setSessionToken(null);
      }
    } catch (err) {
      console.error('Failed to load saved files:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setAuthError(null);
      fetchStatus();
      if (sessionToken) {
        fetchSavedFiles(sessionToken);
      } else {
        setTimeout(() => {
          digitRefs[0].current?.focus();
        }, 150);
      }
    }
  }, [isOpen]);

  // Execute saving pending file once unlocked
  useEffect(() => {
    if (isOpen && sessionToken && pendingFileToSave && !isSavingPending) {
      executeSaveFile(pendingFileToSave);
    }
  }, [isOpen, sessionToken, pendingFileToSave]);

  const executeSaveFile = async (fileToSave: SharedFile) => {
    setIsSavingPending(true);
    try {
      const res = await fetch('/api/vault/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          fileId: fileToSave.id,
          deviceName: fileToSave.uploaderDevice,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSaveToast(data.message || `File "${fileToSave.name}" saved to your vault!`);
        if (sessionToken) {
          fetchSavedFiles(sessionToken);
        }
        fetchStatus();
      } else {
        setSaveToast(`Error: ${data.error || 'Failed to save file'}`);
      }
    } catch (err: any) {
      setSaveToast(`Save failed: ${err?.message || 'Network error'}`);
    } finally {
      setIsSavingPending(false);
      onClearPendingFile?.();
      setTimeout(() => setSaveToast(null), 5000);
    }
  };

  // Handle PIN input changes
  const handleDigitChange = (index: number, val: string, isConfirm: boolean = false) => {
    const cleanVal = val.replace(/\D/g, '').slice(-1);
    const targetArr = isConfirm ? [...confirmDigits] : [...pinDigits];
    const setTarget = isConfirm ? setConfirmDigits : setPinDigits;
    const refs = isConfirm ? confirmRefs : digitRefs;

    targetArr[index] = cleanVal;
    setTarget(targetArr);
    setAuthError(null);

    if (cleanVal && index < 5) {
      refs[index + 1].current?.focus();
    }

    // Check if 6 digits complete
    const full = targetArr.join('');
    if (full.length === 6 && !targetArr.includes('')) {
      if (!isConfirm && !vaultStatus.hasPasscode) {
        // In setup mode: ask to confirm
        setIsConfirmingSetup(true);
        setTimeout(() => {
          confirmRefs[0].current?.focus();
        }, 100);
      } else if (isConfirm && !vaultStatus.hasPasscode) {
        // Finalizing setup
        submitPasscodeSetup(pinDigits.join(''), full);
      } else if (vaultStatus.hasPasscode) {
        // Logging in
        submitLogin(full);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>, isConfirm: boolean = false) => {
    const targetArr = isConfirm ? confirmDigits : pinDigits;
    const refs = isConfirm ? confirmRefs : digitRefs;

    if (e.key === 'Backspace' && !targetArr[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, isConfirm: boolean = false) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newArr = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newArr[i] = pasted[i];
    }

    if (isConfirm) {
      setConfirmDigits(newArr);
      if (pasted.length === 6) {
        submitPasscodeSetup(pinDigits.join(''), pasted);
      }
    } else {
      setPinDigits(newArr);
      if (pasted.length === 6) {
        if (!vaultStatus.hasPasscode) {
          setIsConfirmingSetup(true);
          setTimeout(() => confirmRefs[0].current?.focus(), 100);
        } else {
          submitLogin(pasted);
        }
      }
    }
  };

  // Submit Passcode Setup
  const submitPasscodeSetup = async (firstPass: string, secondPass: string) => {
    if (firstPass !== secondPass) {
      setAuthError('The 6-digit codes do not match. Please re-enter.');
      setConfirmDigits(['', '', '', '', '', '']);
      confirmRefs[0].current?.focus();
      return;
    }

    setIsSubmittingAuth(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/vault/setup-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: firstPass }),
      });

      const data = await res.json();
      if (data.success && data.token) {
        sessionStorage.setItem('vault_token', data.token);
        setSessionToken(data.token);
        setVaultStatus((prev) => ({ ...prev, hasPasscode: true }));
        fetchSavedFiles(data.token);
      } else {
        setAuthError(data.error || 'Failed to setup 6-digit passcode');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Network error during setup');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Submit Login
  const submitLogin = async (passcode: string) => {
    setIsSubmittingAuth(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/vault/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });

      const data = await res.json();
      if (data.success && data.token) {
        sessionStorage.setItem('vault_token', data.token);
        setSessionToken(data.token);
        fetchSavedFiles(data.token);
      } else {
        setAuthError(data.error || 'Incorrect 6-digit passcode');
        setPinDigits(['', '', '', '', '', '']);
        digitRefs[0].current?.focus();
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Network error during login');
      setPinDigits(['', '', '', '', '', '']);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Lock / Logout
  const handleLockVault = () => {
    sessionStorage.removeItem('vault_token');
    setSessionToken(null);
    setPinDigits(['', '', '', '', '', '']);
    setConfirmDigits(['', '', '', '', '', '']);
    setIsConfirmingSetup(false);
    setAuthError(null);
    setTimeout(() => {
      digitRefs[0].current?.focus();
    }, 100);
  };

  // Delete saved file
  const handleDeleteSavedFile = async (savedFileId: string) => {
    if (!window.confirm('Remove this file from your Saved Vault?')) return;
    setDeletingId(savedFileId);
    try {
      const res = await fetch(`/api/vault/files/${savedFileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setSavedFiles((prev) => prev.filter((f) => f.id !== savedFileId));
        fetchStatus();
      } else {
        alert(data.error || 'Failed to delete file from vault');
      }
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  const filteredFiles = savedFiles.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      id="saved-vault-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        id="saved-vault-modal"
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100"
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Bookmark className="w-5 h-5 fill-amber-400/20" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Saved Files Vault</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center space-x-1">
                  <Bot className="w-3 h-3" />
                  <span>Discord Synced</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Permanent private storage • Files here are saved to Discord and exempted from 24-hr deletion
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {sessionToken && (
              <button
                id="vault-lock-btn"
                onClick={handleLockVault}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition"
                title="Lock Vault"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Lock</span>
              </button>
            )}
            <button
              id="vault-close-btn"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toast Notification */}
        {saveToast && (
          <div className="px-6 py-2.5 bg-emerald-500/20 border-b border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{saveToast}</span>
            </div>
            <button onClick={() => setSaveToast(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Pending File Banner */}
        {pendingFileToSave && (
          <div className="px-6 py-2.5 bg-indigo-500/10 border-b border-indigo-500/20 text-indigo-300 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2 truncate">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="truncate">
                Saving: <strong>{pendingFileToSave.name}</strong> ({formatFileSize(pendingFileToSave.size)})
              </span>
            </div>
            {isSavingPending && (
              <span className="text-xs font-semibold text-indigo-400 animate-pulse">Archiving...</span>
            )}
          </div>
        )}

        {/* BODY CONTENT */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoadingStatus ? (
            <div className="py-20 text-center text-slate-400 text-sm">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading security status...
            </div>
          ) : !sessionToken ? (
            /* ==================================================================== */
            /* 1. AUTHENTICATION VIEW (SETUP OR ENTER 6-DIGIT CODE)                 */
            /* ==================================================================== */
            <div className="max-w-md mx-auto py-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center shadow-lg">
                <KeyRound className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">
                  {vaultStatus.hasPasscode
                    ? 'Enter 6-Digit Passcode'
                    : isConfirmingSetup
                    ? 'Confirm 6-Digit Passcode'
                    : 'Set Up 6-Digit Numeric Code'}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  {vaultStatus.hasPasscode
                    ? 'Enter your private 6-digit numeric code to unlock your saved files and archive.'
                    : isConfirmingSetup
                    ? 'Re-enter your 6-digit code to confirm and protect your private vault.'
                    : 'Create a 6-digit numeric passcode to protect your saved files.'}
                </p>
              </div>

              {/* 6-DIGIT INPUT BOXES */}
              {!isConfirmingSetup ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2 sm:gap-3">
                    {pinDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={digitRefs[idx]}
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(idx, e.target.value, false)}
                        onKeyDown={(e) => handleKeyDown(idx, e, false)}
                        onPaste={(e) => handlePaste(e, false)}
                        className={`w-11 h-14 sm:w-12 sm:h-16 text-center text-xl sm:text-2xl font-bold font-mono rounded-2xl border-2 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 select-all ${
                          digit
                            ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-md shadow-indigo-500/10'
                            : 'bg-slate-800/80 border-slate-700 text-slate-200 focus:border-indigo-500'
                        }`}
                        autoFocus={idx === 0}
                      />
                    ))}
                  </div>

                  {!vaultStatus.hasPasscode && (
                    <p className="text-[11px] text-amber-400 font-medium">
                      Note: You will use this 6-digit code whenever you access or save files.
                    </p>
                  )}
                </div>
              ) : (
                /* CONFIRMATION INPUT BOXES */
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2 sm:gap-3">
                    {confirmDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={confirmRefs[idx]}
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(idx, e.target.value, true)}
                        onKeyDown={(e) => handleKeyDown(idx, e, true)}
                        onPaste={(e) => handlePaste(e, true)}
                        className={`w-11 h-14 sm:w-12 sm:h-16 text-center text-xl sm:text-2xl font-bold font-mono rounded-2xl border-2 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 select-all ${
                          digit
                            ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-md shadow-indigo-500/10'
                            : 'bg-slate-800/80 border-slate-700 text-slate-200 focus:border-indigo-500'
                        }`}
                        autoFocus={idx === 0}
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-center space-x-3">
                    <button
                      onClick={() => {
                        setIsConfirmingSetup(false);
                        setConfirmDigits(['', '', '', '', '', '']);
                        setTimeout(() => digitRefs[0].current?.focus(), 100);
                      }}
                      className="text-xs text-slate-400 hover:text-white underline"
                    >
                      Back to edit passcode
                    </button>
                  </div>
                </div>
              )}

              {/* Error Box */}
              {authError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {isSubmittingAuth && (
                <div className="text-xs text-indigo-400 font-medium flex items-center justify-center space-x-2">
                  <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <span>Verifying passcode...</span>
                </div>
              )}
            </div>
          ) : (
            /* ==================================================================== */
            /* 2. SAVED FILES VAULT PAGE                                            */
            /* ==================================================================== */
            <div className="space-y-6">
              {/* Vault Storage Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <Bookmark className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">{savedFiles.length}</div>
                    <div className="text-xs text-slate-400">Total Saved Files</div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">
                      {savedFiles.filter((f) => f.forwardedToDiscord).length} / {savedFiles.length}
                    </div>
                    <div className="text-xs text-slate-400">Saved to Discord</div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/60 flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">Permanent</div>
                    <div className="text-xs text-slate-400">Exempt from 24h Purge</div>
                  </div>
                </div>
              </div>

              {/* Search & Actions Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search saved files..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-800/70 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400">
                    Normal website files delete after 24 hrs • Saved files stay forever
                  </span>
                </div>
              </div>

              {/* Files Grid / List */}
              {isLoadingFiles ? (
                <div className="py-20 text-center text-slate-400 text-sm">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Retrieving saved files...
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-slate-800 rounded-3xl space-y-3 bg-slate-900/30">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                    <Bookmark className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-white">
                      {searchQuery ? 'No matching saved files found' : 'No saved files in vault yet'}
                    </h4>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Click the "Save" icon or button on any file on the screen or phone to save it permanently here and archive it to Discord.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {filteredFiles.map((file) => {
                    const category = getFileCategory(file.mimeType, file.name);

                    return (
                      <div
                        key={file.id}
                        className="group bg-slate-850/80 border border-slate-800 hover:border-indigo-500/50 rounded-2xl overflow-hidden shadow-md flex flex-col transition duration-200"
                      >
                        {/* Thumbnail / Preview Area */}
                        <div
                          onClick={() => {
                            if (onOpenFile) {
                              onOpenFile({
                                id: file.id,
                                name: file.name,
                                size: file.size,
                                mimeType: file.mimeType,
                                uploaderDevice: file.savedByDevice || 'User',
                                uploadedAt: file.savedAt,
                                rawUrl: file.rawUrl,
                                downloadUrl: file.downloadUrl,
                                forwardedToDiscord: file.forwardedToDiscord,
                                isSaved: true,
                              });
                            }
                          }}
                          className="aspect-video bg-slate-950/80 relative flex items-center justify-center overflow-hidden border-b border-slate-800 cursor-pointer"
                        >
                          {category === 'image' ? (
                            <img
                              src={file.rawUrl}
                              alt={file.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                              loading="lazy"
                            />
                          ) : category === 'pdf' ? (
                            <div className="flex flex-col items-center justify-center space-y-1 text-rose-400">
                              <FileText className="w-8 h-8" />
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 px-2 py-0.5 rounded">
                                PDF Document
                              </span>
                            </div>
                          ) : category === 'video' ? (
                            <div className="flex flex-col items-center justify-center space-y-1 text-sky-400">
                              <Film className="w-8 h-8" />
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 px-2 py-0.5 rounded">
                                Video
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center space-y-1 text-slate-400">
                              <FileQuestion className="w-8 h-8" />
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-800 px-2 py-0.5 rounded">
                                {category.toUpperCase()}
                              </span>
                            </div>
                          )}

                          {/* Hover Overlay */}
                          <div className="absolute inset-0 bg-indigo-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition backdrop-blur-[2px]">
                            <span className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold shadow-lg">
                              <Eye className="w-3.5 h-3.5" />
                              <span>View File</span>
                            </span>
                          </div>
                        </div>

                        {/* Meta & Actions */}
                        <div className="p-3.5 flex flex-col justify-between flex-1 space-y-2.5">
                          <div>
                            <h4
                              onClick={() => {
                                if (onOpenFile) {
                                  onOpenFile({
                                    id: file.id,
                                    name: file.name,
                                    size: file.size,
                                    mimeType: file.mimeType,
                                    uploaderDevice: file.savedByDevice || 'User',
                                    uploadedAt: file.savedAt,
                                    rawUrl: file.rawUrl,
                                    downloadUrl: file.downloadUrl,
                                    forwardedToDiscord: file.forwardedToDiscord,
                                    isSaved: true,
                                  });
                                }
                              }}
                              className="text-xs font-semibold text-white truncate cursor-pointer hover:text-indigo-400 transition"
                              title={file.name}
                            >
                              {file.name}
                            </h4>
                            <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-1">
                              <span>{formatFileSize(file.size)}</span>
                              <span>•</span>
                              <span>{new Date(file.savedAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                            {/* Discord Badge */}
                            {file.forwardedToDiscord ? (
                              <span
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                title="Saved to Discord Webhook"
                              >
                                <Bot className="w-3 h-3 text-indigo-400" />
                                <span>Discord ✓</span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400"
                                title="Saved to Vault"
                              >
                                <Bookmark className="w-3 h-3 text-amber-400" />
                                <span>Vault Only</span>
                              </span>
                            )}

                            <div className="flex items-center space-x-1.5">
                              <a
                                href={file.downloadUrl}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                                title="Download"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                              <button
                                onClick={() => handleDeleteSavedFile(file.id)}
                                disabled={deletingId === file.id}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/30 text-slate-400 hover:text-rose-300 transition disabled:opacity-50"
                                title="Remove from vault"
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
