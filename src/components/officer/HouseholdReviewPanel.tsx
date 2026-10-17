import React, { useCallback, useEffect, useState } from 'react';
import { X, Undo2, PauseCircle, PlayCircle } from 'lucide-react';
import {
  getOfficerHousehold,
  reverseHandover,
  setHouseholdSuspension,
  OfficerHouseholdResponse,
} from '../../lib/api';

interface Props {
  householdCode: string;
  onClose: () => void;
}

// Officer moderation for one household (audit Phase 4): recent handovers with a reversal
// action per approved award, and suspend / lift. Every action needs a reason, which the
// household is shown and the audit log keeps.
export const HouseholdReviewPanel: React.FC<Props> = ({ householdCode, onClose }) => {
  const [data, setData] = useState<OfficerHouseholdResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<{ kind: 'reverse'; id: string } | { kind: 'suspend' } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getOfficerHousehold(householdCode));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load this household.');
    }
  }, [householdCode]);

  useEffect(() => {
    load();
  }, [load]);

  const confirm = async () => {
    if (!pending || !data) return;
    if (!reason.trim()) return setError('Give a reason first.');
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === 'reverse') await reverseHandover(pending.id, reason.trim());
      else await setHouseholdSuspension(householdCode, !data.household.suspended, reason.trim());
      setPending(null);
      setReason('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'That action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hh-review-title"
    >
      <div className="w-full max-w-md bg-ink-soft border border-muted/30 rounded-xl p-4 text-left space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="hh-review-title" className="text-sm font-semibold text-white">
              Review {householdCode}
            </h2>
            {data && <p className="text-[11px] text-muted-l">{data.household.address}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-muted-l cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {error && (
          <p role="alert" className="text-[11px] text-red">
            {error}
          </p>
        )}

        {data && (
          <>
            <div className="flex items-center justify-between gap-2 bg-ink border border-muted/20 rounded-md p-2.5">
              <span className="text-[11px] text-tint">
                {data.household.suspended
                  ? `Suspended: ${data.household.suspendedReason ?? ''}`
                  : 'Active — earning and redeeming allowed'}
              </span>
              <button
                type="button"
                onClick={() => setPending({ kind: 'suspend' })}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-white border border-muted/40 rounded-md px-2.5 min-h-[36px] cursor-pointer shrink-0"
              >
                {data.household.suspended ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                <span>{data.household.suspended ? 'Lift' : 'Suspend'}</span>
              </button>
            </div>

            <ul className="divide-y divide-muted/15 border border-muted/20 rounded-md">
              {data.handovers.length === 0 && <li className="p-2.5 text-[11px] text-muted-l">No handovers yet.</li>}
              {data.handovers.map((h) => (
                <li key={h.id} className="p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-white">
                      {h.collection_date} · {h.status}
                      {h.credits_awarded > 0 && ` · +${h.credits_awarded}`}
                    </div>
                    {h.decision_reason_text && (
                      <div className="text-[10px] text-muted-l truncate">{h.decision_reason_text}</div>
                    )}
                  </div>
                  {h.status === 'verified' && h.credits_awarded > 0 && (
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'reverse', id: h.id })}
                      aria-label={`Reverse the award of ${h.collection_date}`}
                      className="inline-flex items-center gap-1 text-[11px] text-white border border-muted/40 rounded-md px-2 min-h-[36px] cursor-pointer shrink-0"
                    >
                      <Undo2 size={13} aria-hidden="true" />
                      <span>Reverse</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {pending && data && (
          <div className="bg-ink border border-amber/40 rounded-md p-3 space-y-2">
            <label htmlFor="mod-reason" className="block text-[11px] text-tint">
              {pending.kind === 'reverse'
                ? 'Reason for reversing this award (shown to the household):'
                : data.household.suspended
                ? 'Reason for lifting the suspension:'
                : 'Reason for suspending (shown to the household):'}
            </label>
            <input
              id="mod-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              className="w-full bg-ink-soft border border-muted/40 rounded-md px-2.5 py-2 text-xs text-tint focus:outline-none focus:border-green"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setReason('');
                }}
                className="flex-1 text-xs text-muted-l border border-muted/30 rounded-md min-h-[40px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="flex-1 text-xs font-semibold text-white bg-amber/80 rounded-md min-h-[40px] cursor-pointer disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
