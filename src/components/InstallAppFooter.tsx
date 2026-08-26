import React, { useState, useEffect } from 'react';
import { Download, Check, X, Share } from 'lucide-react';
import { SafaiSevaLogo } from './SafaiSevaLogo';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallAppFooter: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    
    if (isStandalone) {
      setIsInstalled(true);
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIos(isIosDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isInstalled) return;

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosModal(true);
    } else {
      // Fallback modal for desktop or non-prompting browsers
      setShowIosModal(true);
    }
  };

  return (
    <>
      <div className="w-full bg-[#08080a] text-center py-2.5 px-4 border-t border-zinc-800/80 select-none">
        {isInstalled ? (
          <div className="inline-flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <Check size={14} className="text-emerald-400" />
            <span>Installed as Standalone App</span>
          </div>
        ) : (
          <button
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 rounded-md border border-zinc-700/60 transition-colors shadow-xs"
          >
            <Download size={13} className="text-emerald-400" />
            <span>Download as an App</span>
          </button>
        )}
      </div>

      {/* iOS / General Install Guidance Modal */}
      {showIosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700/80 rounded-xl p-5 text-left text-zinc-200 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-zinc-950 border border-emerald-500/30 flex items-center justify-center shadow-inner shrink-0 overflow-hidden">
                  <SafaiSevaLogo size={24} color="#10B981" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white leading-tight">SafaiSeva</h3>
                  <p className="text-[10px] font-mono text-emerald-400">Add to Home Screen</p>
                </div>
              </div>
              <button
                onClick={() => setShowIosModal(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-zinc-800 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Install SafaiSeva for full offline access during morning waste collection rounds in Ahmedabad.
            </p>

            <div className="space-y-3 bg-zinc-950 p-3.5 rounded-lg border border-zinc-800 text-xs">
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-zinc-900 flex items-center justify-center shrink-0 mt-0.5 border border-zinc-700">
                  <Share size={12} className="text-emerald-400" />
                </div>
                <div className="text-zinc-300">
                  <span className="text-white font-medium">1. Tap the Share button</span> in the Safari navigation bar at the bottom.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-zinc-900 flex items-center justify-center shrink-0 mt-0.5 border border-zinc-700">
                  <Download size={12} className="text-emerald-400" />
                </div>
                <div className="text-zinc-300">
                  <span className="text-white font-medium">2. Select &ldquo;Add to Home Screen&rdquo;</span> from the action sheet.
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIosModal(false)}
              className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs py-2.5 rounded-lg transition-colors shadow-sm"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
