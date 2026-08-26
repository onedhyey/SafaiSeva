import React, { useState } from 'react';
import { X, RotateCcw, ShieldAlert, CheckCircle2, AlertTriangle, XCircle, Sliders, Moon, Sun } from 'lucide-react';
import { DemoOutcomeOverride, HouseholdProfile, AppTheme } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  household: HouseholdProfile;
  aiOverride: DemoOutcomeOverride;
  onUpdateOverride: (override: DemoOutcomeOverride) => void;
  theme: AppTheme;
  onUpdateTheme: (theme: AppTheme) => void;
  onResetDemo: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  household,
  aiOverride,
  onUpdateOverride,
  theme,
  onUpdateTheme,
  onResetDemo,
}) => {
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  if (!isOpen) return null;

  const handleReset = async () => {
    setResetting(true);
    await onResetDemo();
    setResetting(false);
    setResetDone(true);
    setTimeout(() => {
      setResetDone(false);
      onClose();
    }, 1000);
  };

  const overrideOptions: { id: DemoOutcomeOverride; label: string; desc: string; icon: React.ElementType; color: string }[] = [
    {
      id: 'auto',
      label: 'Auto (Live Heuristics)',
      desc: 'Evaluates streams, hash duplicates, and GPS timestamp rules.',
      icon: Sliders,
      color: 'text-tint',
    },
    {
      id: 'force_approve',
      label: 'Force Approve (+2 Leaves)',
      desc: 'Guarantees clean 4-stream approval with balance count-up.',
      icon: CheckCircle2,
      color: 'text-green',
    },
    {
      id: 'force_review',
      label: 'Force Needs Review',
      desc: 'Routes submission to Karmachari exception queue for spot-check.',
      icon: AlertTriangle,
      color: 'text-amber',
    },
    {
      id: 'force_reject',
      label: 'Force Reject (Plastic Contamination)',
      desc: 'Simulates synthetic film detected in organic wet bin.',
      icon: XCircle,
      color: 'text-red',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-xl p-5 text-left text-zinc-200 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold text-white">Demo Control Panel</h3>
            <p className="text-[11px] text-zinc-400 font-mono">Jury presentation & deterministic state toggles</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-zinc-800 transition-colors"
            aria-label="Close settings"
          >
            <X size={16} />
          </button>
        </div>

        {/* Theme Mode Selector */}
        <div className="mt-3.5">
          <label className="block text-xs font-semibold text-white mb-1.5">
            Color Theme Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onUpdateTheme('dark')}
              className={`p-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'bg-zinc-800 border-emerald-500 text-white shadow-xs font-semibold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              <Moon size={15} className={theme === 'dark' ? 'text-emerald-400' : 'text-zinc-400'} />
              <span>Dark (Immersive)</span>
            </button>
            <button
              onClick={() => onUpdateTheme('light')}
              className={`p-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-zinc-800 border-emerald-500 text-white shadow-xs font-semibold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              <Sun size={15} className={theme === 'light' ? 'text-amber-400' : 'text-zinc-400'} />
              <span>Light (Civic Clean)</span>
            </button>
          </div>
        </div>

        {/* Household Info */}
        <div className="mt-3.5 bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-xs">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span>Household ID</span>
            <span className="font-mono text-white font-medium">{household.id}</span>
          </div>
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span>Registered Ward</span>
            <span className="text-zinc-200">{household.ward}</span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Collection Route Window</span>
            <span className="font-mono text-emerald-400 font-medium">06:00 AM – 11:00 AM</span>
          </div>
        </div>

        {/* AI Outcome Selector */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-white mb-2">
            Simulate AI Analysis Outcome
          </label>
          <div className="space-y-1.5">
            {overrideOptions.map((opt) => {
              const active = aiOverride === opt.id;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  onClick={() => onUpdateOverride(opt.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors flex items-start gap-2.5 cursor-pointer ${
                    active
                      ? 'bg-zinc-800 border-emerald-500 text-white shadow-xs'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <Icon size={16} className={`shrink-0 mt-0.5 ${opt.color}`} />
                  <div>
                    <div className="text-xs font-medium text-white">{opt.label}</div>
                    <div className="text-[11px] text-zinc-400">{opt.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Reset Demo Button */}
        <div className="mt-5 pt-3.5 border-t border-zinc-800 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-white">Reset Demo State</div>
            <div className="text-[11px] text-zinc-400">Wipes IndexedDB & re-seeds 3 weeks of data</div>
          </div>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 text-xs font-medium px-3 py-2 rounded-lg transition-colors shrink-0 cursor-pointer shadow-xs"
          >
            {resetDone ? (
              <>
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>Reset Done</span>
              </>
            ) : (
              <>
                <RotateCcw size={13} className={resetting ? 'animate-spin' : ''} />
                <span>{resetting ? 'Resetting...' : 'Reset Demo'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
