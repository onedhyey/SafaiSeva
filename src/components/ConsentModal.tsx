import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { acceptConsent } from '../lib/api';

interface ConsentModalProps {
  isOpen: boolean;
  version: string;
  onAccepted: () => void;
  onDismiss: () => void;
}

// The privacy notice a resident accepts before any photo of their home is processed
// (audit F8; DPDP Act 2023). Server-enforced: uploads and verification answer 428 until the
// current version is accepted. Bump CONSENT_VERSION in server/privacy.ts when this changes.
export const ConsentModal: React.FC<ConsentModalProps> = ({ isOpen, version, onAccepted, onDismiss }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isOpen) return null;

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptConsent(version);
      onAccepted();
    } catch (e: any) {
      setError(e?.message || 'Could not save your choice. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
    >
      <div className="w-full max-w-md bg-ink-soft border border-muted/30 rounded-xl p-5 text-left space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-green" aria-hidden="true" />
          <h2 id="consent-title" className="text-sm font-semibold text-white">
            Before you submit: how your data is used
          </h2>
        </div>
        <ul className="text-xs text-tint space-y-2 list-disc pl-4 leading-relaxed">
          <li>
            <strong>What we collect:</strong> the photo or short video of your waste bins you take in the app,
            where and when you took it, and your account.
          </li>
          <li>
            <strong>Why:</strong> to check that waste is separated, award Leaf Credits, and stop fake or
            repeated submissions.
          </li>
          <li>
            <strong>Who sees it:</strong> an AI service (Google Gemini) describes the photo for our rules
            engine; if you dispute a result, a karmachari for your ward reviews it.
          </li>
          <li>
            <strong>How long:</strong> photos and videos are deleted after 90 days. Your household's credit
            history is kept while the household is active.
          </li>
          <li>
            <strong>Your choice:</strong> you can delete your data at any time in Settings → Delete my data.
          </li>
        </ul>
        {error && (
          <p className="text-[11px] text-red" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 text-xs font-semibold text-muted-l border border-muted/30 rounded-md min-h-[44px] cursor-pointer"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            className="flex-1 text-xs font-bold text-white bg-green hover:bg-[#16934f] rounded-md min-h-[44px] cursor-pointer disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'I agree'}
          </button>
        </div>
      </div>
    </div>
  );
};
