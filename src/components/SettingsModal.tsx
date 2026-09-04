import React, { useState } from 'react';
import {
  X,
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sliders,
  Moon,
  Sun,
  Download,
  Smartphone,
  Check,
  CloudOff,
} from 'lucide-react';
import { DemoOutcomeOverride, HouseholdProfile, AppTheme } from '../types';
import { usePwaInstall } from '../lib/usePwaInstall';
import { InstallModal } from './InstallModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  household: HouseholdProfile;
  aiOverride: DemoOutcomeOverride;
  onUpdateOverride: (override: DemoOutcomeOverride) => void;
  theme: AppTheme;
  onUpdateTheme: (theme: AppTheme) => void;
  onResetDemo: () => Promise<void>;
  simulateOffline: boolean;
  onToggleOffline: (value: boolean) => void;
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
  simulateOffline,
  onToggleOffline,
}) => {
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const { isInstalled, isIos, hasNativePrompt, showInstallModal, setShowInstallModal, triggerInstall } = usePwaInstall();

  if (!isOpen) return null;

  const fmtHour = (h: number) => {
    const hr12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(hr12).padStart(2, '0')}:00 ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
  };
  const { startHour, endHour } = household.collectionWindow;
  const collectionWindowLabel = `${fmtHour(startHour)} – ${fmtHour(endHour)}`;

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
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div
          id="safai-settings-modal-card"
          className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-xl p-5 text-left text-zinc-200 shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div>
              <h3 className="text-sm font-semibold text-white">Demo Control Panel</h3>
              <p className="text-[11px] text-zinc-400 font-mono">Jury presentation & deterministic state toggles</p>
            </div>
            <button
              id="close-settings-modal-btn"
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Close settings"
            >
              <X size={16} />
            </button>
          </div>

          {/* Standalone PWA Download Section (website only, hidden once installed) */}
          {!isInstalled && (
            <div className="mt-3.5 bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0">
                  <Smartphone size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    Install Standalone App
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono truncate">
                    Add to Home Screen / Desktop
                  </div>
                </div>
              </div>

              <button
                id="settings-download-app-btn"
                onClick={triggerInstall}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-all shrink-0 cursor-pointer shadow-xs"
              >
                <Download size={12} />
                <span>Download App</span>
              </button>
            </div>
          )}

          {/* Theme Mode Selector */}
          <div className="mt-3.5">
            <label className="block text-xs font-semibold text-white mb-1.5">
              Color Theme Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                id="theme-dark-btn"
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
                id="theme-light-btn"
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
              <span className="font-mono text-emerald-400 font-medium">{collectionWindowLabel}</span>
            </div>
          </div>

          {/* Demo Role Access Codes Reference */}
          <div className="mt-3.5 bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-xs">
            <div className="text-xs font-semibold text-white mb-1.5 flex items-center justify-between">
              <span>Role Access Demo Codes</span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded">
                DEMO PASSWORDS
              </span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Ward Officer Section:</span>
                <span className="font-mono text-blue-400 bg-blue-950/70 border border-blue-800/60 px-2 py-0.5 rounded font-semibold">
                  AMC-OFFICER-2026
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Karmachari Terminal:</span>
                <span className="font-mono text-amber-400 bg-amber-950/70 border border-amber-800/60 px-2 py-0.5 rounded font-semibold">
                  7841
                </span>
              </div>
            </div>
          </div>

          {/* Verification is server-authoritative — no client-side outcome override */}
          <div className="mt-4">
            <label className="block text-xs font-semibold text-white mb-1.5">
              AI verification
            </label>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-[11px] text-zinc-400 leading-relaxed">
              Every submission is judged by the backend from real AI evidence, fraud checks,
              location and time — there is no demo override. To see a rejection, submit
              something that isn’t segregated waste.
            </div>
          </div>

          {/* Connectivity — simulate offline for the capture queue (T3.1) */}
          <div className="mt-4">
            <label className="block text-xs font-semibold text-white mb-1.5">Connectivity</label>
            <button
              id="settings-simulate-offline-toggle"
              onClick={() => onToggleOffline(!simulateOffline)}
              className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                simulateOffline
                  ? 'bg-amber-950/40 border-amber-700/60'
                  : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                    simulateOffline
                      ? 'bg-amber-900/50 border-amber-700/60 text-amber-400'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <CloudOff size={15} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Simulate offline</div>
                  <div className="text-[10px] text-zinc-400 leading-snug">
                    Documented handovers go to the Outbox and send when you switch this back off.
                  </div>
                </div>
              </div>
              <span
                className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${
                  simulateOffline ? 'bg-amber-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    simulateOffline ? 'translate-x-4' : ''
                  }`}
                />
              </span>
            </button>
          </div>

          {/* Reset local demo state */}
          <div className="mt-5 pt-3.5 border-t border-zinc-800 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-white">Reset local demo data</div>
              <div className="text-[11px] text-zinc-400">
                Clears this device’s cached seed data. Server handovers and credits are not affected.
              </div>
            </div>
            <button
              id="reset-demo-action-btn"
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

      {/* Standalone Install Guidance Modal */}
      <InstallModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        isIos={isIos}
        hasNativePrompt={hasNativePrompt}
        onNativeInstall={triggerInstall}
      />
    </>
  );
};
