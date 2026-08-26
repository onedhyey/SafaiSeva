import React, { useState } from 'react';
import { Role } from '../../types';
import { useAuth } from '../../lib/authContext';
import {
  User,
  Shield,
  Building2,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  X,
  Sparkles,
  ChevronLeft,
  Info,
} from 'lucide-react';
import { LeafGlyph } from '../LeafGlyph';

interface RoleSelectionModalProps {
  isOpen: boolean;
  onClose?: () => void;
  canCancel?: boolean;
}

export const RoleSelectionModal: React.FC<RoleSelectionModalProps> = ({
  isOpen,
  onClose,
  canCancel = false,
}) => {
  const { user, setSelectedRole } = useAuth();

  // Sub-stages: 'select' | 'karmachari_code' | 'officer_blocked'
  const [stage, setStage] = useState<'select' | 'karmachari_code' | 'officer_blocked'>('select');
  const [karmachariCode, setKarmachariCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  if (!isOpen) return null;

  // Handles choosing Resident role: Let them in normally
  const handleSelectResident = () => {
    setSelectedRole('resident');
    if (onClose) onClose();
  };

  // Handles choosing Karmachari role: Ask for Ward Officer code
  const handleSelectKarmachari = () => {
    setStage('karmachari_code');
    setCodeError(null);
    setKarmachariCode('');
  };

  // Handles choosing Ward Officer role: Invite-only blocked message
  const handleSelectOfficer = () => {
    setStage('officer_blocked');
  };

  // Validate the Karmachari Ward Officer Code
  const handleValidateKarmachariCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = karmachariCode.trim().toUpperCase();

    if (!cleanCode) {
      setCodeError('Please enter the code provided by your Ward Officer.');
      return;
    }

    setIsValidating(true);
    setCodeError(null);

    setTimeout(() => {
      setIsValidating(false);
      // Valid codes accepted: AMC-KARMA-2026, WARD-07, 7841, 4892, 1234, or any code with 4+ alphanumeric chars
      const validMockCodes = ['AMC-KARMA-2026', 'WARD-07', '7841', '4892', '1234', 'AMC2026', 'SAF-07'];
      const isMatch = validMockCodes.includes(cleanCode) || /^[A-Z0-9-]{4,}$/i.test(cleanCode);

      if (isMatch) {
        setSelectedRole('karmachari');
        if (onClose) onClose();
      } else {
        setCodeError('Invalid code. Please check with your Ward Officer (e.g. 7841 or AMC-KARMA-2026).');
      }
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-2xl p-5 text-left text-zinc-200 shadow-2xl overflow-hidden relative max-h-[92vh] flex flex-col">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-semibold text-white">Select Account Role</h2>
          </div>
          {canCancel && onClose && (
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
              aria-label="Close role selector"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Authenticated User Status Banner */}
        <div className="mt-3 bg-zinc-950/80 px-3 py-2 rounded-lg border border-zinc-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-6 h-6 rounded-full bg-emerald-950 border border-emerald-700 flex items-center justify-center text-emerald-400 font-semibold text-[11px] shrink-0">
              {user?.firstName?.[0] || user?.fullName?.[0] || 'U'}
            </div>
            <div className="truncate">
              <div className="text-xs font-medium text-white truncate">{user?.fullName || 'Authenticated User'}</div>
              <div className="text-[10px] text-zinc-400 truncate">{user?.primaryEmail || 'user@amc.gov.in'}</div>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-1.5 py-0.5 rounded shrink-0">
            AUTHENTICATED
          </span>
        </div>

        {/* Dynamic Stages */}
        <div className="my-4 overflow-y-auto flex-1 pr-0.5 space-y-3">
          {/* STAGE 1: Primary Role Choices */}
          {stage === 'select' && (
            <>
              <p className="text-xs text-zinc-300">
                Please designate your active role in the SafaiSeva AMC Waste Segregation network:
              </p>

              <div className="space-y-2.5">
                {/* 1. Resident Option */}
                <button
                  type="button"
                  onClick={handleSelectResident}
                  className="w-full text-left p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-emerald-500/80 hover:bg-zinc-900/90 transition-all cursor-pointer group shadow-sm flex items-start gap-3"
                >
                  <div className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-800/60 text-emerald-400 group-hover:scale-105 transition-transform shrink-0 mt-0.5">
                    <LeafGlyph size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                        Normal Resident (નાગરિક)
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded">
                        Standard
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                      Log daily 4-stream waste handovers, earn Green Credits, and redeem free Ahmedabad BRTS / Metro transit passes.
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400 font-medium group-hover:translate-x-0.5 transition-transform">
                      <span>Enter as Resident</span>
                      <ArrowRight size={13} />
                    </div>
                  </div>
                </button>

                {/* 2. Karmachari Option */}
                <button
                  type="button"
                  onClick={handleSelectKarmachari}
                  className="w-full text-left p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-amber-500/80 hover:bg-zinc-900/90 transition-all cursor-pointer group shadow-sm flex items-start gap-3"
                >
                  <div className="p-2.5 rounded-xl bg-amber-950/70 border border-amber-800/60 text-amber-400 group-hover:scale-105 transition-transform shrink-0 mt-0.5">
                    <Shield size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                        Karmachari (કર્મચારી)
                      </span>
                      <span className="text-[10px] font-mono text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <KeyRound size={10} />
                        PIN Required
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                      Sanitation worker console for doorstep QR scanning, spot-check reviews, and offline manual credit issuance.
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-amber-400 font-medium group-hover:translate-x-0.5 transition-transform">
                      <span>Verify with Ward Code</span>
                      <ArrowRight size={13} />
                    </div>
                  </div>
                </button>

                {/* 3. Ward Officer Option */}
                <button
                  type="button"
                  onClick={handleSelectOfficer}
                  className="w-full text-left p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-red-500/60 hover:bg-zinc-900/90 transition-all cursor-pointer group shadow-sm flex items-start gap-3"
                >
                  <div className="p-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-zinc-300 group-hover:scale-105 transition-transform shrink-0 mt-0.5">
                    <Building2 size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200 group-hover:text-white transition-colors">
                        Ward Officer (અધિકારી)
                      </span>
                      <span className="text-[10px] font-mono text-red-400 bg-red-950/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Lock size={10} />
                        Invite Only
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                      Administrative portal for municipal ward waste metrics, route audits, and anomaly flags.
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-zinc-400 font-medium group-hover:text-zinc-200 transition-colors">
                      <span>Check clearance</span>
                      <ArrowRight size={13} />
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* STAGE 2: Karmachari Ward Officer Code Prompt */}
          {stage === 'karmachari_code' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setStage('select');
                  setCodeError(null);
                }}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <ChevronLeft size={14} />
                <span>Back to role options</span>
              </button>

              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/70 text-amber-200">
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound size={16} className="text-amber-400" />
                  <span className="text-xs font-bold text-white">Ward Officer Authorization</span>
                </div>
                <p className="text-[11px] text-amber-300/90 leading-relaxed">
                  To access the Karmachari collection terminal, please enter the authorization code provided by your Ward Officer.
                </p>
              </div>

              <form onSubmit={handleValidateKarmachariCode} className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Enter Ward Officer Authorization Code:
                  </label>
                  <input
                    type="text"
                    value={karmachariCode}
                    onChange={(e) => {
                      setKarmachariCode(e.target.value);
                      if (codeError) setCodeError(null);
                    }}
                    placeholder="e.g. 7841 or AMC-KARMA-2026"
                    className={`w-full bg-zinc-950 border rounded-lg px-3 py-2.5 text-xs text-white placeholder-zinc-500 font-mono tracking-wide focus:outline-none ${
                      codeError ? 'border-red-500 focus:border-red-500' : 'border-zinc-700 focus:border-amber-500'
                    }`}
                    autoFocus
                  />
                  {codeError ? (
                    <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-red-400">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <span>{codeError}</span>
                    </div>
                  ) : (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-400">
                      <Info size={11} className="text-amber-400" />
                      <span>Demo hint: Use code <strong className="text-zinc-200 font-mono">7841</strong> or <strong className="text-zinc-200 font-mono">AMC-KARMA-2026</strong></span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStage('select');
                      setCodeError(null);
                    }}
                    className="w-1/3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isValidating}
                    className="w-2/3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 cursor-pointer"
                  >
                    {isValidating ? (
                      <span className="animate-spin text-white">◷</span>
                    ) : (
                      <>
                        <Shield size={14} />
                        <span>Verify & Continue</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STAGE 3: Ward Officer Invite-Only Blocked Notice */}
          {stage === 'officer_blocked' && (
            <div className="space-y-3.5">
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-left">
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <Lock size={18} className="shrink-0" />
                  <span className="text-xs font-bold text-white">Invite-Only Access Restricted</span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  This role is <strong className="text-red-300">invite-only</strong> and hence you cannot access it with your current account.
                </p>
                <div className="mt-2.5 pt-2.5 border-t border-red-900/60 text-[11px] text-zinc-400 leading-relaxed">
                  Ward Officer administrative dashboards require municipal credentials provisioned directly by the Ahmedabad Municipal Corporation (AMC) Zonal Commissioner Office.
                </div>
              </div>

              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-left text-xs">
                <div className="text-zinc-400 text-[11px]">Next Steps:</div>
                <p className="text-zinc-300 text-[11px] mt-1">
                  Please select <strong>Normal Resident</strong> to use citizen features, or verify with your supervisor if you are a field <strong>Karmachari</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStage('select')}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ChevronLeft size={14} />
                <span>Choose Another Role</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
