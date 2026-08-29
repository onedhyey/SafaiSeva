import React, { useState } from 'react';
import { X, Check, Trash2, Sparkles } from 'lucide-react';
import { LeafGlyph } from '../LeafGlyph';
import { setBinCount, SetBinsResponse, BinsInfo } from '../../lib/api';

interface BinSetupModalProps {
  isOpen: boolean;
  bins: BinsInfo;
  /** true when shown as first-run onboarding (can't dismiss without answering). */
  onboarding?: boolean;
  onClose: () => void;
  onSaved: (result: SetBinsResponse) => void;
}

const STREAM_HINT: Record<number, string> = {
  2: 'Wet + Dry',
  3: '+ Sanitary',
  4: '+ Special care',
  5: '+ one more sorted',
  6: 'Fully sorted',
};

export const BinSetupModal: React.FC<BinSetupModalProps> = ({
  isOpen,
  bins,
  onboarding = false,
  onClose,
  onSaved,
}) => {
  const [choice, setChoice] = useState<number>(bins.count || 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const options = [
    { value: 1, title: 'One bin', sub: 'Everything goes in together' },
    { value: 2, title: 'Two bins', sub: 'Wet and dry kept apart' },
    { value: 3, title: 'Three bins', sub: 'Wet, dry, sanitary' },
    { value: 4, title: 'Four bins', sub: 'All four streams separated' },
    { value: 5, title: 'Five bins', sub: 'Four streams plus one more sorted' },
    { value: 6, title: 'Six bins', sub: 'Fully sorted at source' },
  ];

  // What the resident would earn by moving from their recorded count to `choice`.
  const preview: string[] = [];
  if (bins.count < 2 && choice >= 2) preview.push(`+${bins.milestoneCredits.two_bins} for reaching 2 bins`);
  if (bins.count < 4 && choice >= 4) preview.push(`+${bins.milestoneCredits.four_bins} for reaching 4 bins`);
  if (bins.count < 6 && choice >= 6) preview.push(`+${bins.milestoneCredits.six_bins} for reaching 6 bins`);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await setBinCount(choice);
      onSaved(result);
    } catch (e: any) {
      setError(e.message || 'Could not save. Try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-2xl p-5 text-left text-zinc-200 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/70 border border-emerald-800/60 text-emerald-400 flex items-center justify-center">
              <Trash2 size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {onboarding ? 'Set up your bins' : 'Update your bins'}
              </h2>
              <p className="text-[11px] text-zinc-400">Separating waste starts at home</p>
            </div>
          </div>
          {!onboarding && (
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed mb-3">
          How many separate bins do you keep at home right now? Reaching two, then four,
          earns you leaf credits before you even do a handover.
        </p>

        <div className="space-y-2">
          {options.map((o) => {
            const active = choice === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setChoice(o.value)}
                className={`w-full text-left p-3 rounded-xl border transition-colors flex items-center justify-between ${
                  active
                    ? 'bg-zinc-800 border-emerald-500 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="text-xs font-bold flex items-center gap-2">
                    <span>{o.title}</span>
                    {STREAM_HINT[o.value] && (
                      <span className="text-[10px] font-normal text-zinc-400">
                        {STREAM_HINT[o.value]}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{o.sub}</div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    active ? 'bg-emerald-500 border-emerald-500 text-black' : 'border-zinc-600'
                  }`}
                >
                  {active && <Check size={11} strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>

        {preview.length > 0 && (
          <div className="mt-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg p-2.5 flex items-start gap-2">
            <Sparkles size={14} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-emerald-200 space-y-0.5">
              {preview.map((p, i) => (
                <div key={i} className="flex items-center gap-1 font-mono">
                  <LeafGlyph size={11} color="#34d399" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {choice < 2 && (
          <p className="mt-3 text-[11px] text-zinc-400 leading-relaxed">
            You can start with just two — a wet bin and a dry bin — and come back here when
            you add more.
          </p>
        )}

        {error && <div className="mt-2 text-[11px] text-red-400">{error}</div>}

        <div className="mt-4 flex gap-2">
          {!onboarding && (
            <button
              onClick={onClose}
              className="w-1/3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-300 py-2.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className={`${onboarding ? 'w-full' : 'w-2/3'} bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5`}
          >
            {saving ? 'Saving…' : onboarding ? 'Save and continue' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
