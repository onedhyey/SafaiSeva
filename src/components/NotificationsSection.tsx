import React, { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { getPushConfig, savePushSubscription, removePushSubscription, sendTestPush } from '../lib/api';
import { useI18n } from '../lib/i18n';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = 'loading' | 'unsupported' | 'ios-install' | 'unconfigured' | 'denied' | 'off' | 'on';

// Opt-in for Web Push. iPhones only allow push for apps installed to the home screen
// (iOS 16.4+), so there the section explains how to install instead.
export const NotificationsSection: React.FC<{ isInstalled: boolean; isIos: boolean }> = ({ isInstalled, isIos }) => {
  const { t } = useI18n();
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported) return setState(isIos && !isInstalled ? 'ios-install' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      try {
        const { publicKey } = await getPushConfig();
        if (!publicKey) return setState('unconfigured');
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setState(sub ? 'on' : 'off');
      } catch {
        setState('unconfigured');
      }
    })();
  }, [isInstalled, isIos]);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return setState(permission === 'denied' ? 'denied' : 'off');
      const { publicKey } = await getPushConfig();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey!),
      });
      await savePushSubscription(sub.toJSON());
      await sendTestPush().catch(() => undefined);
      setState('on');
    } catch (e: any) {
      setError(e?.message || 'Could not turn on notifications.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint).catch(() => undefined);
        await sub.unsubscribe();
      }
      setState('off');
    } catch (e: any) {
      setError(e?.message || 'Could not turn off notifications.');
    } finally {
      setBusy(false);
    }
  };

  const note: Record<State, string> = {
    loading: '',
    unsupported: t('notify.unsupported'),
    'ios-install': t('notify.ios'),
    unconfigured: t('notify.unconfigured'),
    denied: t('notify.denied'),
    off: t('notify.offText'),
    on: t('notify.onText'),
  };

  return (
    <div className="mt-3.5 bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {state === 'on' ? <Bell size={15} className="text-emerald-400" aria-hidden="true" /> : <BellOff size={15} className="text-zinc-400" aria-hidden="true" />}
          <span className="text-xs font-medium text-white">{t('notify.title')}</span>
        </div>
        {(state === 'off' || state === 'on') && (
          <button
            type="button"
            onClick={state === 'on' ? disable : enable}
            disabled={busy}
            className="text-xs font-semibold px-3 min-h-[40px] rounded-md border border-zinc-700 text-zinc-200 hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
          >
            {busy ? '…' : state === 'on' ? t('notify.off') : t('notify.on')}
          </button>
        )}
      </div>
      {note[state] && <p className="text-[11px] text-zinc-400">{note[state]}</p>}
      {error && <p className="text-[11px] text-red-300" role="alert">{error}</p>}
    </div>
  );
};
