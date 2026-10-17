import React, { useCallback, useEffect, useState } from 'react';
import { Users, Copy, Check, UserPlus, X } from 'lucide-react';
import {
  createHouseholdInvite,
  getJoinRequests,
  decideJoinRequest,
  JoinRequest,
} from '../../lib/api';

// Owner tools for the household: mint a short-lived invite code for family members, and
// approve or decline who asked to join (audit F3). Non-owners simply see no requests.
export const HouseholdMembersPanel: React.FC = () => {
  const [invite, setInvite] = useState<{ token: string; expiresAt: string } | null>(null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { requests } = await getJoinRequests();
      setRequests(requests);
    } catch {
      /* offline or not signed in — the panel stays empty */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      setInvite(await createHouseholdInvite());
    } catch (e: any) {
      setError(e?.message || 'Could not create an invite.');
    } finally {
      setBusy(false);
    }
  };

  const handleDecide = async (id: string, approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await decideJoinRequest(id, approve);
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Could not update that request.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is on screen */
    }
  };

  return (
    <div className="bg-ink-soft border border-muted/30 rounded-lg p-4 space-y-3 text-left">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-green" />
        <h3 className="text-xs font-semibold text-white">Household members</h3>
      </div>

      {error && <p className="text-[11px] text-red" role="alert">{error}</p>}

      {invite ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-l">
            Share this invite code with family. It expires{' '}
            {new Date(invite.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.
            You'll approve each person before they join.
          </p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-bold tracking-widest text-white">{invite.token}</span>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy invite code"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-green bg-green/10 border border-green/30 px-2 py-1 rounded-md cursor-pointer min-h-[32px]"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleInvite}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-green hover:bg-[#16934f] rounded-md py-2.5 min-h-[44px] cursor-pointer disabled:opacity-50"
        >
          <UserPlus size={14} />
          <span>Invite a family member</span>
        </button>
      )}

      {requests.length > 0 && (
        <ul className="divide-y divide-muted/15 border-t border-muted/15">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 gap-2">
              <span className="text-xs text-tint truncate">{r.name} wants to join</span>
              <span className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDecide(r.id, true)}
                  className="text-[11px] font-semibold text-white bg-green rounded-md px-2.5 min-h-[36px] cursor-pointer disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDecide(r.id, false)}
                  aria-label={`Decline ${r.name}`}
                  className="text-[11px] text-muted-l border border-muted/30 rounded-md px-2 min-h-[36px] cursor-pointer disabled:opacity-50"
                >
                  <X size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
