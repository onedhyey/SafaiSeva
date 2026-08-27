import React from 'react';
import { Download, Check, Sparkles, Smartphone } from 'lucide-react';
import { usePwaInstall } from '../lib/usePwaInstall';
import { InstallModal } from './InstallModal';

interface InstallAppFooterProps {
  className?: string;
}

export const InstallAppFooter: React.FC<InstallAppFooterProps> = ({ className = '' }) => {
  const {
    isInstalled,
    isIos,
    hasNativePrompt,
    showInstallModal,
    setShowInstallModal,
    triggerInstall,
  } = usePwaInstall();

  // If the app is already installed or running as standalone on homescreen, do not show the footer at all
  if (isInstalled) {
    return null;
  }

  return (
    <>
      <footer
        id="safai-install-app-footer"
        className={`w-full bg-[#08080a]/95 backdrop-blur-md text-center py-2.5 px-4 border-t border-zinc-800/80 select-none transition-all z-20 ${className}`}
      >
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-left min-w-0">
            <div className="w-6 h-6 rounded-md bg-zinc-950 border border-emerald-800/60 p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src="/apple-touch-icon.png"
                alt="Logo"
                className="w-full h-full object-cover rounded-[3px]"
              />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-zinc-200 truncate">
                SafaiSeva Standalone PWA
              </div>
              <div className="text-[9px] font-mono text-zinc-400 truncate">
                Offline waste verification & transit passes
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5">
            <button
              id="download-as-app-footer-btn"
              onClick={triggerInstall}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-950 hover:text-black bg-emerald-500 hover:bg-emerald-400 px-3.5 py-1.5 rounded-lg border border-emerald-400/80 transition-all shadow-sm shadow-emerald-950/30 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Download size={13} className="text-zinc-950" />
              <span>Download as an App</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Standalone Install Guidance Modal */}
      <InstallModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        isIos={isIos}
        hasNativePrompt={hasNativePrompt}
        onNativeInstall={triggerInstall}
      />
    </>
  );
};
