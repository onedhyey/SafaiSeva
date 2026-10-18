import React from 'react';
import { X, Camera, Video, Leaf, ShieldCheck, MessageSquareWarning, HelpCircle, Ban } from 'lucide-react';
import { useI18n } from '../lib/i18n';

interface HelpCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

// In-app help: what SafaiSeva is and, mostly, how to document a handover — photo, the
// video fallback and its length rule, and why only the in-app camera is accepted.
export const HelpCenter: React.FC<HelpCenterProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n();
  if (!isOpen) return null;

  const Section: React.FC<{ icon: React.ElementType; q: string; open?: boolean; children: React.ReactNode }> = ({
    icon: Icon,
    q,
    open,
    children,
  }) => (
    <details open={open} className="group bg-zinc-950 border border-zinc-800 rounded-lg">
      <summary className="flex items-center gap-2 p-3 cursor-pointer list-none min-h-[44px]">
        <Icon size={15} className="text-emerald-400 shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold text-white flex-1">{q}</span>
        <span className="text-zinc-500 text-xs group-open:rotate-90 transition-transform" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="px-3 pb-3 text-[12px] leading-relaxed text-zinc-300 space-y-2">{children}</div>
    </details>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-xl p-4 text-left space-y-2.5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <h2 id="help-title" className="text-sm font-semibold text-white flex items-center gap-2">
            <HelpCircle size={16} className="text-emerald-400" aria-hidden="true" />
            {t('help.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('help.close')}
            className="p-2 text-zinc-400 hover:text-white rounded-md cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <Section icon={Leaf} q={t('help.what.q')}>
          <p>{t('help.what.a')}</p>
        </Section>

        <Section icon={Camera} q={t('help.how.q')} open>
          <ol className="list-decimal pl-4 space-y-1.5">
            <li>{t('help.how.1')}</li>
            <li>{t('help.how.2')}</li>
            <li>{t('help.how.3')}</li>
            <li>{t('help.how.4')}</li>
          </ol>
        </Section>

        <Section icon={Video} q={t('help.video.q')} open>
          <p>{t('help.video.a')}</p>
        </Section>

        <Section icon={Ban} q={t('help.camera.q')}>
          <p>{t('help.camera.a')}</p>
        </Section>

        <Section icon={Leaf} q={t('help.leaves.q')}>
          <p>{t('help.leaves.a')}</p>
        </Section>

        <Section icon={MessageSquareWarning} q={t('help.dispute.q')}>
          <p>{t('help.dispute.a')}</p>
        </Section>

        <Section icon={ShieldCheck} q={t('help.privacy.q')}>
          <p>{t('help.privacy.a')}</p>
        </Section>
      </div>
    </div>
  );
};
