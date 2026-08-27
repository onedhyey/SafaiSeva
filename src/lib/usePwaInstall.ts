import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Global cached prompt to avoid losing beforeinstallprompt across component mounts
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((cb) => cb());
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    listeners.forEach((cb) => cb());
  });
}

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const isStandaloneMQ = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const isFullscreenMQ = window.matchMedia?.('(display-mode: fullscreen)')?.matches;
    const isMinimalUiMQ = window.matchMedia?.('(display-mode: minimal-ui)')?.matches;
    const isWindowControlsMQ = window.matchMedia?.('(display-mode: window-controls-overlay)')?.matches;
    const isIosStandalone = (window.navigator as unknown as { standalone?: boolean })?.standalone === true;
    const isAndroidApp = typeof document !== 'undefined' && document.referrer?.includes('android-app://');
    const urlParams = new URLSearchParams(window.location.search);
    const isSourcePwa = urlParams.get('source') === 'pwa' || urlParams.get('mode') === 'standalone' || window.location.hash.includes('pwa');
    const storedInstalled = localStorage.getItem('safai_pwa_installed') === 'true';

    return Boolean(
      isStandaloneMQ ||
      isFullscreenMQ ||
      isMinimalUiMQ ||
      isWindowControlsMQ ||
      isIosStandalone ||
      isAndroidApp ||
      isSourcePwa ||
      storedInstalled
    );
  } catch {
    return false;
  }
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkIsStandalone());
  const [isIos, setIsIos] = useState<boolean>(false);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

  useEffect(() => {
    const updatePrompt = () => {
      setDeferredPrompt(globalDeferredPrompt);
    };
    listeners.add(updatePrompt);

    // Initial check and persistence
    const standalone = checkIsStandalone();
    if (standalone) {
      setIsInstalled(true);
      try {
        localStorage.setItem('safai_pwa_installed', 'true');
      } catch {
        // ignore
      }
    }

    // Media query listeners for real-time display-mode transitions
    const mqlStandalone = window.matchMedia?.('(display-mode: standalone)');
    const handleMQChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        try {
          localStorage.setItem('safai_pwa_installed', 'true');
        } catch {
          // ignore
        }
      }
    };

    if (mqlStandalone?.addEventListener) {
      mqlStandalone.addEventListener('change', handleMQChange);
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIos(isIosDevice);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      try {
        localStorage.setItem('safai_pwa_installed', 'true');
      } catch {
        // ignore
      }
      setDeferredPrompt(null);
      globalDeferredPrompt = null;
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      listeners.delete(updatePrompt);
      if (mqlStandalone?.removeEventListener) {
        mqlStandalone.removeEventListener('change', handleMQChange);
      }
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (globalDeferredPrompt) {
      try {
        await globalDeferredPrompt.prompt();
        const choice = await globalDeferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          try {
            localStorage.setItem('safai_pwa_installed', 'true');
          } catch {
            // ignore
          }
        }
        globalDeferredPrompt = null;
        setDeferredPrompt(null);
      } catch (err) {
        console.warn('Install prompt failed:', err);
        setShowInstallModal(true);
      }
    } else {
      setShowInstallModal(true);
    }
  }, []);

  return {
    isInstalled,
    isIos,
    hasNativePrompt: Boolean(deferredPrompt),
    showInstallModal,
    setShowInstallModal,
    triggerInstall,
  };
}
