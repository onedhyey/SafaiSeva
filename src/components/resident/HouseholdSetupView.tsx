import React, { useState } from 'react';
import { Home, Users, Copy, Check, ArrowRight, AlertTriangle } from 'lucide-react';
import { createHousehold, requestToJoinHousehold, createHouseholdInvite } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

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
  const { t: tr } = useI18n();
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
          <h1 className="text-sm font-semibold text-white">{tr('hh.created')}</h1>
          <p className="text-xs text-muted-l">{tr('hh.createdSub')}</p>
        </div>

        <div className="bg-ink-soft border border-muted/30 rounded-lg p-5 text-center space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-l">
            {tr('hh.code')}
          </div>
          <div className="font-mono text-2xl font-bold text-white tracking-[0.15em] tabular-nums">
            {created.code}
          </div>
          <p className="text-[11px] text-muted-l leading-relaxed max-w-[280px] mx-auto">
            {tr('hh.codeNote')}
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
                <span>{copied ? tr('members.copied') : tr('hh.copyInvite')}</span>
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
              <span>{tr('members.invite')}</span>
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
          <span>{tr('hh.continue')}</span>
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
          <h1 className="text-sm font-semibold text-white">{tr('hh.sent')}</h1>
          <p className="text-xs text-muted-l">
            {tr('hh.sentSub')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onLinked()}
          className="w-full bg-green hover:bg-[#16934f] text-white font-bold text-xs py-3.5 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[46px]"
        >
          <span>{tr('hh.approved')}</span>
          <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  // ---- Create / Join chooser ----
  return (
    <div className="space-y-4 pb-20 pt-1 text-left select-none">
      <div className="px-1">
        <h1 className="text-sm font-semibold text-white">{tr('hh.setup')}</h1>
        <p className="text-xs text-muted-l">
          {tr('hh.setupSub')}
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
          <span>{tr('hh.createNew')}</span>
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
          <span>{tr('hh.joinInvite')}</span>
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
            {tr('hh.ownerNote')}
          </p>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-muted-l">
              {tr('hh.address')} <span className="normal-case font-sans">(optional)</span>
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
            {busy ? tr('hh.creating') : tr('hh.create')}
          </button>
        </div>
      ) : (
        <div className="bg-ink-soft border border-muted/30 rounded-lg p-4 space-y-3">
          <p className="text-[11px] text-muted-l leading-relaxed">
            {tr('hh.joinNote')}
          </p>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-muted-l">
              {tr('hh.inviteCode')}
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
            {busy ? tr('hd.sending') : tr('hh.ask')}
          </button>
        </div>
      )}
    </div>
  );
};
