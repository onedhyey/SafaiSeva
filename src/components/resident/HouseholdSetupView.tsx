import React, { useState } from 'react';
import { Home, Users, Copy, Check, ArrowRight, AlertTriangle } from 'lucide-react';
import { createHousehold, requestToJoinHousehold, createHouseholdInvite } from '../../lib/api';

interface HouseholdSetupViewProps {
  /** Called once the account is attached to a household (created or joined). */
  onLinked: () => Promise<void> | void;
}

type Mode = 'create' | 'join';

// Best-effort GPS for the "someone here already registered" check. Never blocks.
function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    );
  });
}

export const HouseholdSetupView: React.FC<HouseholdSetupViewProps> = ({ onLinked }) => {
  const [mode, setMode] = useState<Mode>('create');
  const [address, setAddress] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ code: string; nearby: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const pos = await getPosition();
      const res = await createHousehold({
        address: address.trim() || undefined,
        lat: pos?.lat,
        lng: pos?.lng,
      });
      setCreated({ code: res.code, nearby: res.nearbyExisting ?? null });
    } catch (e: any) {
      setError(e?.message || 'Could not create the household. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // Joining needs an invite code from the household owner, who then approves the request.
  const handleJoin = async () => {
    const token = joinCode.trim().toUpperCase();
    if (!token) {
      setError('Enter the invite code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestToJoinHousehold(token);
      setPending(true);
    } catch (e: any) {
      setError(e?.message || 'Could not send the join request.');
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await createHouseholdInvite();
      setInvite(res.token);
    } catch (e: any) {
      setError(e?.message || 'Could not create an invite.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is on screen anyway */
    }
  };

  // ---- Success: household created, show the shareable code ----
  if (created) {
    return (
      <div className="space-y-4 pb-20 pt-1 text-left select-none">
        <div className="px-1">
          <h1 className="text-sm font-semibold text-white">Household created</h1>
          <p className="text-xs text-muted-l">Share this code with everyone in your home.</p>
        </div>

        <div className="bg-ink-soft border border-muted/30 rounded-lg p-5 text-center space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-l">
            Household code
          </div>
          <div className="font-mono text-2xl font-bold text-white tracking-[0.15em] tabular-nums">
            {created.code}
          </div>
          <p className="text-[11px] text-muted-l leading-relaxed max-w-[280px] mx-auto">
            This identifies your home to karmacharis. To add family, send them an invite code —
            you approve each person. Credits and daily limits are shared across the household.
          </p>
          {invite ? (
            <div className="space-y-2">
              <div className="font-mono text-lg font-bold text-white tracking-widest">{invite}</div>
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-green bg-green/10 border border-green/30 px-3 py-1.5 rounded-md hover:bg-green/20 transition-colors cursor-pointer min-h-[36px]"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? 'Copied' : 'Copy invite code'}</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleInvite}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-green bg-green/10 border border-green/30 px-3 py-1.5 rounded-md hover:bg-green/20 transition-colors cursor-pointer min-h-[36px] disabled:opacity-50"
            >
              <Users size={13} />
              <span>Invite a family member</span>
            </button>
          )}
        </div>

        {created.nearby && (
          <div className="bg-amber/10 border border-amber/30 rounded-md p-3 text-[11px] text-tint flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber shrink-0 mt-0.5" />
            <span>
              A household is already registered near this location ({created.nearby}). If that's
              your home, ask them for an invite code and use <strong>Join</strong> instead next time.
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => onLinked()}
          className="w-full bg-green hover:bg-[#16934f] text-white font-bold text-xs py-3.5 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[46px]"
        >
          <span>Continue to my wallet</span>
          <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  // ---- Join requested: waiting for the owner ----
  if (pending) {
    return (
      <div className="space-y-4 pb-20 pt-1 text-left select-none">
        <div className="px-1">
          <h1 className="text-sm font-semibold text-white">Request sent</h1>
          <p className="text-xs text-muted-l">
            The household owner needs to approve you. Ask them to open Settings → Household members.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onLinked()}
          className="w-full bg-green hover:bg-[#16934f] text-white font-bold text-xs py-3.5 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[46px]"
        >
          <span>I've been approved — continue</span>
          <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  // ---- Create / Join chooser ----
  return (
    <div className="space-y-4 pb-20 pt-1 text-left select-none">
      <div className="px-1">
        <h1 className="text-sm font-semibold text-white">Set up your household</h1>
        <p className="text-xs text-muted-l">
          A household is one home's shared segregation record. Create one if you're the first
          from your home; otherwise join with an invite code from the household owner.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMode('create');
            setError(null);
          }}
          className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            mode === 'create'
              ? 'bg-ink-soft border-green text-white'
              : 'bg-ink border-muted/30 text-muted-l hover:border-muted/50'
          }`}
        >
          <Home size={14} className={mode === 'create' ? 'text-green' : ''} />
          <span>Create new</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('join');
            setError(null);
          }}
          className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            mode === 'join'
              ? 'bg-ink-soft border-green text-white'
              : 'bg-ink border-muted/30 text-muted-l hover:border-muted/50'
          }`}
        >
          <Users size={14} className={mode === 'join' ? 'text-green' : ''} />
          <span>Join with invite</span>
        </button>
      </div>

      {error && (
        <div className="bg-red/10 border border-red/30 rounded-md p-3 text-xs text-tint flex items-start gap-2">
          <AlertTriangle size={14} className="text-red shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {mode === 'create' ? (
        <div className="bg-ink-soft border border-muted/30 rounded-lg p-4 space-y-3">
          <p className="text-[11px] text-muted-l leading-relaxed">
            You'll be the owner and can invite your family so everyone documents the same bins.
            Credits and daily limits are per household.
          </p>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-muted-l">
              Home address <span className="normal-case font-sans">(optional)</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 402 Shivam Apts, CG Road, Navrangpura"
              className="w-full bg-ink border border-muted/40 rounded-md px-3 py-2 text-xs text-tint placeholder:text-muted-l focus:outline-none focus:border-green"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="w-full bg-green hover:bg-[#16934f] text-white font-bold text-xs py-3 rounded-md transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create household'}
          </button>
        </div>
      ) : (
        <div className="bg-ink-soft border border-muted/30 rounded-lg p-4 space-y-3">
          <p className="text-[11px] text-muted-l leading-relaxed">
            Enter the invite code the household owner shared. They'll approve your request.
          </p>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-muted-l">
              Invite code
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              className="w-full bg-ink border border-muted/40 rounded-md px-3 py-2 text-xs font-mono tracking-widest text-tint placeholder:text-muted-l focus:outline-none focus:border-green"
            />
          </div>
          <button
            type="button"
            onClick={handleJoin}
            disabled={busy}
            className="w-full bg-green hover:bg-[#16934f] text-white font-bold text-xs py-3 rounded-md transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Ask to join'}
          </button>
        </div>
      )}
    </div>
  );
};
