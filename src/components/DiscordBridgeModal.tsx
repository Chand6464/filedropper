import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Bot,
  Copy,
  Check,
  Download,
  Terminal,
  Zap,
  RefreshCw,
  X,
  Lock,
  Radio,
  Send,
  CheckCircle2,
  AlertCircle,
  Webhook,
  Trash2,
  KeyRound,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { DiscordBridgeStatus } from '../types';

interface DiscordBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: DiscordBridgeStatus | null;
  onRefreshStatus: () => void;
}

export const DiscordBridgeModal: React.FC<DiscordBridgeModalProps> = ({
  isOpen,
  onClose,
  status,
  onRefreshStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'webhook' | 'status' | 'code'>('webhook');

  // Webhook form state
  const [webhookInput, setWebhookInput] = useState('');
  const [adminPinInput, setAdminPinInput] = useState('');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [isDeletingWebhook, setIsDeletingWebhook] = useState(false);
  const [webhookFeedback, setWebhookFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Python bot code & ping state
  const [pythonCode, setPythonCode] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);

  // Fetch Python bot script template
  useEffect(() => {
    if (isOpen) {
      fetch('/api/discord/python-bot-template')
        .then((res) => res.json())
        .then((data) => {
          if (data.code) {
            setPythonCode(data.code);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    if (!pythonCode) return;
    navigator.clipboard.writeText(pythonCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadCode = () => {
    if (!pythonCode) return;
    const blob = new Blob([pythonCode], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'discord_bot_bridge.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookInput.trim()) {
      setWebhookFeedback({ type: 'error', message: 'Please paste your Discord Webhook URL.' });
      return;
    }

    setIsSavingWebhook(true);
    setWebhookFeedback(null);
    try {
      const res = await fetch('/api/discord/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: webhookInput.trim(),
          adminPin: adminPinInput.trim() || undefined,
          currentPin: currentPinInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setWebhookFeedback({
          type: 'success',
          message: data.message || 'Discord Webhook connected successfully! Files will now relay automatically.',
        });
        setWebhookInput('');
        setAdminPinInput('');
        setCurrentPinInput('');
        onRefreshStatus();
      } else {
        setWebhookFeedback({
          type: 'error',
          message: data.error || 'Failed to connect Discord Webhook. Please verify the URL.',
        });
      }
    } catch (err: any) {
      setWebhookFeedback({
        type: 'error',
        message: err?.message || 'Network error while connecting to Discord.',
      });
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleDeleteWebhook = async () => {
    if (!confirm('Are you sure you want to disconnect this Discord Webhook?')) return;

    let enteredPin: string | undefined = undefined;
    if (status?.hasAdminPin) {
      enteredPin = prompt('Enter your Admin PIN to disconnect the webhook:') || '';
      if (!enteredPin) return;
    }

    setIsDeletingWebhook(true);
    setWebhookFeedback(null);
    try {
      const res = await fetch('/api/discord/webhook', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin: enteredPin }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setWebhookFeedback({ type: 'success', message: 'Discord Webhook disconnected.' });
        onRefreshStatus();
      } else {
        setWebhookFeedback({ type: 'error', message: data.error || 'Could not disconnect webhook.' });
      }
    } catch (err: any) {
      setWebhookFeedback({ type: 'error', message: err?.message || 'Network error.' });
    } finally {
      setIsDeletingWebhook(false);
    }
  };

  const handleTestPing = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const res = await fetch('/api/discord/test', { method: 'POST' });
      const data = await res.json();
      setPingResult(data);
      onRefreshStatus();
    } catch (err: any) {
      setPingResult({
        success: false,
        message: `Ping request failed: ${err?.message || 'Network error'}`,
      });
    } finally {
      setIsPinging(false);
    }
  };

  const isWebhookActive = status?.webhookConfigured;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Webhook className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-tight">Discord Bridge (Webhook Direct)</h2>
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Zero-Leak Shielded</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                No hosting or bot deployment needed — connect your Discord channel in seconds
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Highlight Box */}
        <div className="px-6 py-2.5 bg-indigo-950/40 border-b border-indigo-900/40 text-xs flex items-center space-x-2.5 text-indigo-200">
          <EyeOff className="w-4 h-4 text-indigo-400 shrink-0" />
          <div>
            <strong>100% Zero-Leak Source Code Protection:</strong> Your Discord Webhook URL is stored strictly on the server. Public visitors and browser DevTools <em>cannot</em> view or extract the webhook token.
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-6 pt-3 border-b border-slate-800 bg-slate-950/30 space-x-2">
          <button
            onClick={() => setActiveTab('webhook')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'webhook'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Discord Webhook</span>
            <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[10px] rounded font-medium">
              No Hosting
            </span>
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'status'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Test Connection</span>
            {status?.configured && (
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'code'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Python Bot (Optional)</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: Direct Webhook (No Hosting Required) */}
          {activeTab === 'webhook' && (
            <div className="space-y-4">
              {/* If already connected */}
              {isWebhookActive ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-3">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white flex items-center space-x-2">
                            <span>Discord Webhook Connected</span>
                            {status.webhookName && (
                              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                                #{status.webhookName}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-emerald-300/80">
                            Files dropped from your phone or PC will post automatically to this channel!
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handleTestPing}
                          disabled={isPinging}
                          className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-60"
                        >
                          <Send className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                          <span>{isPinging ? 'Testing...' : 'Test Message'}</span>
                        </button>
                        <button
                          onClick={handleDeleteWebhook}
                          disabled={isDeletingWebhook}
                          className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-500/30 transition disabled:opacity-60"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Disconnect</span>
                        </button>
                      </div>
                    </div>

                    {status.webhookMasked && (
                      <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-xs text-slate-400 font-mono">
                        <span className="text-slate-500">Relay Target:</span>
                        <span className="text-emerald-400/90">{status.webhookMasked}</span>
                      </div>
                    )}
                  </div>

                  {/* Test Ping Output Banner */}
                  {pingResult && (
                    <div className={`p-3 rounded-lg border text-xs flex items-start space-x-2 ${
                      pingResult.success
                        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                    }`}>
                      {pingResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-semibold">{pingResult.message}</div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Check your Discord channel to view the posted test embed!
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Connect Webhook Form */
                <div className="space-y-4">
                  {/* Step-by-step instructions */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
                    <div className="text-xs font-bold text-white flex items-center space-x-1.5 uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>How to get your Discord Webhook (Takes 15 seconds):</span>
                    </div>
                    <ol className="text-xs text-slate-300 space-y-1.5 list-decimal pl-5">
                      <li>
                        Open Discord and right-click (or tap gear icon / long press on mobile) your desired channel &rarr; <strong>Edit Channel</strong>.
                      </li>
                      <li>
                        Click <strong>Integrations</strong> &rarr; <strong>Webhooks</strong> &rarr; <strong>New Webhook</strong>.
                      </li>
                      <li>
                        Click <strong>Copy Webhook URL</strong> and paste it below. <em>Done! No bot hosting or Cloudflare captcha required!</em>
                      </li>
                    </ol>
                  </div>

                  <form onSubmit={handleSaveWebhook} className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/70 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-white mb-1.5">
                        Discord Webhook URL
                      </label>
                      <input
                        type="url"
                        value={webhookInput}
                        onChange={(e) => setWebhookInput(e.target.value)}
                        placeholder="https://discord.com/api/webhooks/123456789/abcdef..."
                        required
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-300 mb-1 flex items-center space-x-1">
                          <KeyRound className="w-3 h-3 text-slate-400" />
                          <span>Optional Admin PIN</span>
                        </label>
                        <input
                          type="password"
                          value={adminPinInput}
                          onChange={(e) => setAdminPinInput(e.target.value)}
                          placeholder="Leave blank or set a PIN"
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={isSavingWebhook}
                          className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition disabled:opacity-60"
                        >
                          <Webhook className={`w-4 h-4 ${isSavingWebhook ? 'animate-spin' : ''}`} />
                          <span>{isSavingWebhook ? 'Verifying with Discord...' : 'Connect Discord Webhook'}</span>
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Feedback Message */}
                  {webhookFeedback && (
                    <div className={`p-3 rounded-lg border text-xs flex items-start space-x-2 ${
                      webhookFeedback.type === 'success'
                        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                    }`}>
                      {webhookFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>{webhookFeedback.message}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Feature Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1">
                  <div className="font-semibold text-white flex items-center space-x-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Instant Image Previews</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Photos uploaded from your phone render with rich inline Discord previews and complete metadata (size, device name, room).
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-1">
                  <div className="font-semibold text-white flex items-center space-x-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Protected Server Relay</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Discord API calls are performed entirely by this app's Node.js backend. The webhook is never sent to phone browsers.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Connection Status & Test Ping */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Status</div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${status?.configured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    <span className="font-bold text-sm text-white">
                      {status?.configured ? 'Active & Ready' : 'Pending Webhook Setup'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {status?.targetDescription || 'Checking server configuration...'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Mode</div>
                  <div className="flex items-center space-x-2">
                    <Webhook className={`w-4 h-4 ${status?.configured ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span className="font-bold text-sm text-white capitalize">
                      {status?.mode || 'None'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {status?.webhookConfigured ? 'Using Direct Discord Webhook (Zero Hosting)' : 'Not configured'}
                  </p>
                </div>
              </div>

              {/* Ping Test Button */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Send Discord Test Message</h3>
                    <p className="text-xs text-slate-400">Posts a test ping embed to confirm your Discord channel receives messages.</p>
                  </div>
                  <button
                    id="ping-discord-test-btn"
                    onClick={handleTestPing}
                    disabled={isPinging || !status?.configured}
                    className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
                  >
                    <Send className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                    <span>{isPinging ? 'Testing...' : 'Send Test Ping'}</span>
                  </button>
                </div>

                {pingResult && (
                  <div className={`p-3 rounded-lg border text-xs flex items-start space-x-2 ${
                    pingResult.success
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                  }`}>
                    {pingResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="font-semibold">{pingResult.message}</div>
                      {pingResult.data && (
                        <pre className="text-[11px] font-mono text-slate-300 mt-1 bg-black/40 p-2 rounded overflow-x-auto">
                          {JSON.stringify(pingResult.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Optional Python Bot */}
          {activeTab === 'code' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-900/40 text-xs text-indigo-300">
                <strong>Note:</strong> If you use the <strong>Discord Webhook</strong> (Tab 1), you do <em>not</em> need this Python bot script or any external bot hosting. This script is provided only as an optional advanced fallback.
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="text-xs font-bold text-white">discord_bot_bridge.py</div>
                  <p className="text-[11px] text-slate-400">Standalone Python script running discord.py and aiohttp receiver.</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center space-x-1 px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Copied!' : 'Copy Script'}</span>
                  </button>
                  <button
                    onClick={handleDownloadCode}
                    className="flex items-center space-x-1 px-2.5 py-1 text-xs rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .py</span>
                  </button>
                </div>
              </div>

              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-[300px] leading-relaxed select-all">
                {pythonCode || '# Loading discord_bot_bridge.py template...'}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={onRefreshStatus}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Status</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
