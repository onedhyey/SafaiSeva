import React, { useState } from 'react';
import { Home, Users, Copy, Check, ArrowRight, AlertTriangle } from 'lucide-react';
import { createHousehold, joinHousehold } from '../../lib/api';

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

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setError('Enter the household code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await joinHousehold(code);
      await onLinked();
    } catch (e: any) {
      setError(e?.message || 'Could not join that household.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
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
            Household join code
          </div>
          <div className="font-mono text-2xl font-bold text-white tracking-[0.15em] tabular-nums">
            {created.code}
          </div>
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-green bg-green/10 border border-green/30 px-3 py-1.5 rounded-md hover:bg-green/20 transition-colors cursor-pointer"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy code'}</span>
          </button>
          <p className="text-[11px] text-muted-l leading-relaxed max-w-[280px] mx-auto">
            Anyone who joins with this code documents the same bins. Credits and daily limits
            are shared across the household — extra accounts don't earn extra leaves.
          </p>
        </div>

        {created.nearby && (
          <div className="bg-amber/10 border border-amber/30 rounded-md p-3 text-[11px] text-tint flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber shrink-0 mt-0.5" />
            <span>
              A household is already registered near this location ({created.nearby}). If that's
              your home, ask them for their code and use <strong>Join</strong> instead next time.
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

  // ---- Create / Join chooser ----
  return (
    <div className="space-y-4 pb-20 pt-1 text-left select-none">
      <div className="px-1">
        <h1 className="text-sm font-semibold text-white">Set up your household</h1>
        <p className="text-xs text-muted-l">
          A household is one home's shared segregation record. Create one if you're the first
          from your home; otherwise join with the code a family member shared.
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
          <span>Join with code</span>
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
            You'll get a code to share with your family so everyone documents the same bins.
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
            Enter the code a family member (or an AMC officer) gave you.
          </p>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-muted-l">
              Household code
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="HH-U-XXXXXX"
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
            {busy ? 'Joining…' : 'Join household'}
          </button>
        </div>
      )}
    </div>
  );
};
