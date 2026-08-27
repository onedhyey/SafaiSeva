import React, { useState } from 'react';
import {
  Download,
  X,
  Share,
  PlusSquare,
  Smartphone,
  Monitor,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { SafaiSevaLogo } from './SafaiSevaLogo';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isIos: boolean;
  hasNativePrompt: boolean;
  onNativeInstall?: () => void;
}

export const InstallModal: React.FC<InstallModalProps> = ({
  isOpen,
  onClose,
  isIos,
  hasNativePrompt,
  onNativeInstall,
}) => {
  const [activeTab, setActiveTab] = useState<'ios' | 'android' | 'desktop'>(
    isIos ? 'ios' : 'android'
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        id="safai-pwa-install-modal"
        className="w-full max-w-sm bg-zinc-900 border border-zinc-700/80 rounded-2xl p-5 text-left text-zinc-200 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-emerald-500/30 flex items-center justify-center shadow-inner shrink-0">
              <SafaiSevaLogo size={26} color="#10B981" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-white leading-tight">SafaiSeva AMC</h3>
                <span className="text-[9px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-1.5 py-0.2 rounded-full">
                  PWA
                </span>
              </div>
              <p className="text-[11px] font-mono text-zinc-400">Install as Standalone App</p>
            </div>
          </div>
          <button
            id="close-install-modal-btn"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close install modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Quick Native Install Button if browser supports it */}
        {hasNativePrompt && onNativeInstall && (
          <div className="mb-4">
            <button
              id="modal-direct-install-btn"
              onClick={() => {
                onNativeInstall();
                onClose();
              }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer group"
            >
              <Download size={15} className="group-hover:-translate-y-0.5 transition-transform" />
              <span>Tap to Install Now</span>
            </button>
          </div>
        )}

        {/* Platform Tabs */}
        <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-800 mb-4 text-xs font-medium">
          <button
            id="tab-ios-instructions"
            onClick={() => setActiveTab('ios')}
            className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'ios'
                ? 'bg-zinc-800 text-emerald-400 font-semibold shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Smartphone size={13} />
            <span>iOS (iPhone)</span>
          </button>
          <button
            id="tab-android-instructions"
            onClick={() => setActiveTab('android')}
            className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'android'
                ? 'bg-zinc-800 text-emerald-400 font-semibold shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Smartphone size={13} />
            <span>Android</span>
          </button>
          <button
            id="tab-desktop-instructions"
            onClick={() => setActiveTab('desktop')}
            className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'desktop'
                ? 'bg-zinc-800 text-emerald-400 font-semibold shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Monitor size={13} />
            <span>Desktop</span>
          </button>
        </div>

        {/* Tab Specific Content */}
        {activeTab === 'ios' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Install SafaiSeva directly to your iPhone Home Screen via Safari:
            </p>

            <div className="space-y-2.5 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5 text-emerald-400 font-mono font-bold text-[11px]">
                  1
                </div>
                <div className="text-zinc-300">
                  <span className="text-white font-semibold">Tap the Share button</span>{' '}
                  <span className="inline-flex items-center text-emerald-400 font-mono text-[11px]">
                    <Share size={12} className="inline mx-1" />
                  </span>{' '}
                  in the Safari navigation toolbar at the bottom.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5 text-emerald-400 font-mono font-bold text-[11px]">
                  2
                </div>
                <div className="text-zinc-300">
                  <span className="text-white font-semibold">Select &ldquo;Add to Home Screen&rdquo;</span>{' '}
                  <span className="inline-flex items-center text-emerald-400 font-mono text-[11px]">
                    <PlusSquare size={12} className="inline mx-1" />
                  </span>{' '}
                  from the iOS action menu.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5 text-emerald-400 font-mono font-bold text-[11px]">
                  3
                </div>
                <div className="text-zinc-300">
                  Tap <span className="text-white font-semibold">&ldquo;Add&rdquo;</span> in the top right corner. The SafaiSeva app icon will now appear on your home screen!
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'android' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Install on Android via Chrome or Samsung Internet:
            </p>

            <div className="space-y-2.5 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5 text-emerald-400 font-mono font-bold text-[11px]">
                  1
                </div>
                <div className="text-zinc-300">
                  Tap the <span className="text-white font-semibold">browser menu (⋮)</span> in the top right corner of Chrome.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5 text-emerald-400 font-mono font-bold text-[11px]">
                  2
                </div>
                <div className="text-zinc-300">
                  Select <span className="text-white font-semibold">&ldquo;Install App&rdquo;</span> or{' '}
                  <span className="text-white font-semibold">&ldquo;Add to Home screen&rdquo;</span>.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5 text-emerald-400 font-mono font-bold text-[11px]">
                  3
                </div>
                <div className="text-zinc-300">
                  Confirm <span className="text-white font-semibold">&ldquo;Install&rdquo;</span> to enable full offline support and instant launch.
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'desktop' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Install as a standalone desktop app on Chrome, Edge, or Safari:
            </p>

            <div className="space-y-2.5 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5 text-emerald-400 font-mono font-bold text-[11px]">
                  1
                </div>
                <div className="text-zinc-300">
                  Click the <span className="text-white font-semibold">Install icon (⬇️)</span> inside your browser address bar on the right.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5 text-emerald-400 font-mono font-bold text-[11px]">
                  2
                </div>
                <div className="text-zinc-300">
                  Click <span className="text-white font-semibold">&ldquo;Install SafaiSeva&rdquo;</span> to pin to your Taskbar or Dock.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Benefits summary */}
        <div className="mt-4 pt-3 border-t border-zinc-800/80 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span>Full offline mode</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span>Fast camera access</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span>Instant transit QR</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span>No app store needed</span>
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          id="got-it-install-btn"
          onClick={onClose}
          className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs py-2.5 rounded-xl transition-colors cursor-pointer"
        >
          Got It
        </button>
      </div>
    </div>
  );
};
