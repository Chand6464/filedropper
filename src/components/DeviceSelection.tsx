import React from 'react';
import { Projector, Smartphone, Laptop, ShieldCheck, EyeOff, Sparkles } from 'lucide-react';
import { DeviceType } from '../types';

interface DeviceSelectionProps {
  onSelect: (type: DeviceType) => void;
}

export const DeviceSelection: React.FC<DeviceSelectionProps> = ({ onSelect }) => {
  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between py-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-600/30">
            <Projector className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
                <span>Chand's File Dropper</span>
              </h1>
              <a
                href="https://chand6464.github.io/r/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 font-semibold tracking-wide transition inline-flex items-center space-x-1"
                title="Visit Chand's Profile"
              >
                <span>By Chand</span>
              </a>
            </div>
            <p className="text-xs text-slate-400">Zero-leak file transfer between phone & projector</p>
          </div>
        </div>
      </header>

      {/* Main Choice Section */}
      <main className="max-w-3xl mx-auto w-full my-auto py-8">
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Private & Ephemeral • No WhatsApp Leaks</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Which device is this?
          </h2>
          <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
            Select this device's role. If you are projecting to a wall or TV, choose <strong>Projector / Screen</strong> to display the 6-digit code.
          </p>
        </div>

        {/* Primary Role Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          {/* Option 1: Projector / Receiver */}
          <button
            id="choose-projector-btn"
            onClick={() => onSelect('projector')}
            className="group relative flex flex-col text-left p-6 sm:p-8 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border-2 border-slate-800 hover:border-indigo-500/80 transition-all duration-200 shadow-xl hover:shadow-2xl hover:shadow-indigo-500/10"
          >
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mb-5 group-hover:scale-105 group-hover:bg-indigo-600 group-hover:text-white transition duration-200">
              <Projector className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white group-hover:text-indigo-300 transition">
                  Projector / Big Screen
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  Display
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Choose this on the classroom projector, meeting TV, or main monitor. It generates an <strong>extra-large 6-digit code</strong> designed for blurry lenses.
              </p>
            </div>
            <div className="mt-6 flex items-center text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition duration-200">
              <span>Display 6-Digit Pairing Screen →</span>
            </div>
          </button>

          {/* Option 2: Phone / Sender */}
          <button
            id="choose-phone-btn"
            onClick={() => onSelect('phone')}
            className="group relative flex flex-col text-left p-6 sm:p-8 rounded-2xl bg-slate-900/90 hover:bg-slate-850 border-2 border-slate-800 hover:border-emerald-500/80 transition-all duration-200 shadow-xl hover:shadow-2xl hover:shadow-emerald-500/10"
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mb-5 group-hover:scale-105 group-hover:bg-emerald-600 group-hover:text-white transition duration-200">
              <Smartphone className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white group-hover:text-emerald-300 transition">
                  Phone / Mobile
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  Sender
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Choose this on your phone or tablet. Type in the 6-digit code from the projector screen to pair and instantly drop photos, PDFs, or files.
              </p>
            </div>
            <div className="mt-6 flex items-center text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition duration-200">
              <span>Enter 6-Digit Code to Pair →</span>
            </div>
          </button>
        </div>

        {/* Alternative: PC / Laptop */}
        <div className="flex items-center justify-center">
          <button
            id="choose-pc-btn"
            onClick={() => onSelect('pc')}
            className="flex items-center space-x-2 text-xs text-slate-400 hover:text-slate-200 p-2 rounded-lg hover:bg-slate-800/60 transition"
          >
            <Laptop className="w-4 h-4 text-slate-400" />
            <span>Using a Laptop / PC? Click here to join or host</span>
          </button>
        </div>

        {/* Feature Comparison / Privacy Safeguard */}
        <div className="mt-12 p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                <EyeOff className="w-4 h-4" />
              </div>
              <div>
                <strong className="block text-slate-200 mb-0.5">Privacy First</strong>
                <span className="text-slate-400">Zero personal account login. No WhatsApp chats, status, or notifications shown to the audience.</span>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <strong className="block text-slate-200 mb-0.5">Blurry Screen Proof</strong>
                <span className="text-slate-400">Can't scan a camera QR on an out-of-focus projector? The high-contrast 6-digit alphanumeric code pairs manually.</span>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <strong className="block text-slate-200 mb-0.5">Instant Inline Preview</strong>
                <span className="text-slate-400">Opens PNGs, PDFs, and media right in the projector browser without downloading clutter.</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center py-4 border-t border-slate-850 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>
          Chand's File Dropper • Created with care{' '}
          <a
            href="https://chand6464.github.io/r/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-2 transition"
          >
            By Chand
          </a>{' '}
          • Zero-leak file beam
        </span>
        <span className="text-slate-500">Private & Ephemeral Sharing</span>
      </footer>
    </div>
  );
};
