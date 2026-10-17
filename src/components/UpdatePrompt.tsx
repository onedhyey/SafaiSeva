import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '../lib/i18n';

// Registers the service worker (production builds only) and offers a reload when a new
// version has been downloaded. The new worker waits for this tap instead of swapping code
// under a resident mid-capture (audit F9).
export const UpdatePrompt: React.FC = () => {
  const { t } = useI18n();
  const [update, setUpdate] = useState<null | ((reload?: boolean) => Promise<void>)>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const updateSW = registerSW({
          onNeedRefresh() {
            if (!cancelled) setUpdate(() => updateSW);
          },
          onRegisteredSW(_url, reg) {
            // Installed apps can stay open for days; check for a new version hourly.
            if (reg) setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
          },
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;
  return (
    <div
      role="status"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm bg-ink-soft border border-green/40 rounded-lg shadow-lg p-3 flex items-center justify-between gap-3"
    >
      <span className="text-xs text-tint">{t('update.ready')}</span>
      <button
        type="button"
        onClick={() => update(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green rounded-md px-3 min-h-[40px] cursor-pointer"
      >
        <RefreshCw size={13} aria-hidden="true" />
        <span>{t('update.button')}</span>
      </button>
    </div>
  );
};
