import React, { useState } from 'react';
import { X, Check, Search, ShieldCheck, AlertCircle } from 'lucide-react';
import { LeafGlyph } from '../LeafGlyph';
import { HandoverRecord } from '../../types';
import { addHandover } from '../../lib/db';
import { createBinPhotoSvg } from '../../lib/seed';

interface IssueCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreditIssued: () => Promise<void>;
  workerId: string;
}

export const IssueCreditModal: React.FC<IssueCreditModalProps> = ({
  isOpen,
  onClose,
  onCreditIssued,
  workerId,
}) => {
  const [householdId, setHouseholdId] = useState<string>('');
  const [householdName, setHouseholdName] = useState<string>('');
  const [selectedStreamWet, setSelectedStreamWet] = useState<boolean>(true);
  const [selectedStreamDry, setSelectedStreamDry] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Preset known offline households for quick worker selection
  const quickHouseholds = [
    { id: 'HH-NV-0188', name: 'Gordhanbhai Rabari (No Smartphone)', address: 'Chawl No. 4, Mithakhali' },
    { id: 'HH-NV-0245', name: 'Kavita Ben Vankar (Elderly Citizen)', address: 'Block C-12, Navrangpura Gaam' },
    { id: 'HH-NV-0631', name: 'Munna Bhai Ansari (AMC Manual Record)', address: 'Gulbai Tekra Slum Pocket' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdId.trim()) return;

    setIsSubmitting(true);
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    const manualRecord: HandoverRecord = {
      id: `HND-MANUAL-${Date.now()}-${householdId.replace(/[^a-zA-Z0-9]/g, '')}`,
      householdId: householdId.trim(),
      householdName: householdName.trim() || `AMC Household ${householdId.trim()}`,
      ward: 'Ward 12 - Navrangpura',
      timestamp: now.toISOString(),
      dateString: dateStr,
      photoUrl: createBinPhotoSvg(`Manual Worker Verification / ${workerId}`, true, '#19A85B'),
      imageHash: `manual_worker_hash_${Date.now()}`,
      location: {
        lat: 23.0384,
        lng: 72.5592,
        address: 'Direct Doorstep Worker Handover (Navrangpura)',
        isFallback: false,
      },
      streamsConfirmed: {
        wet: selectedStreamWet,
        dry: selectedStreamDry,
        sanitary: false,
        special_care: false,
      },
      verification: {
        status: 'verified',
        decisionReason: `Direct physical verification by Karmachari ${workerId}. 4-stream compliance confirmed at doorstep.`,
        creditsAwarded: 2,
        confidence: 1.0,
        flags: ['offline_equity_manual_issue'],
        imageHash: `manual_worker_hash_${Date.now()}`,
        stages: [
          { id: '1', label: 'Doorstep physical inspection', detail: 'Worker confirmed 4 streams physically separated.', passed: true },
          { id: '2', label: 'Anti-gaming doorstep check', detail: 'Physical receipt logged on route.', passed: true },
          { id: '3', label: 'Offline equity guarantee', detail: 'Credits credited directly to household account.', passed: true },
        ],
        streams: {
          wet: { detected: true, status: 'clean', note: 'Physically inspected by worker', verdict: 'clean' },
          dry: { detected: true, status: 'clean', note: 'Physically inspected by worker', verdict: 'clean' },
          sanitary: { detected: false, status: 'none', note: 'None', verdict: 'none' },
          special_care: { detected: false, status: 'none', note: 'None', verdict: 'none' },
        },
      },
      status: 'verified',
      creditsAwarded: 2,
      source: 'manual_worker',
      reviewedBy: `Karmachari ${workerId}`,
      reviewedAt: now.toISOString(),
    };

    await addHandover(manualRecord);
    await onCreditIssued();
    setIsSubmitting(false);
    setSuccessMessage(`2 Credits issued to ${householdId}!`);

    setTimeout(() => {
      setSuccessMessage(null);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-xl p-5 text-left text-zinc-200 relative shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-4">
          <div className="inline-flex items-center gap-1 bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-sm text-[11px] font-mono font-bold uppercase tracking-wider mb-1">
            AMC Equity Protocol
          </div>
          <h2 className="text-sm font-bold text-white">Issue Credit Without Smartphone</h2>
          <p className="text-xs text-zinc-400 leading-relaxed mt-0.5">
            Direct doorstep validation for households with feature phones or no device.
          </p>
        </div>

        {successMessage ? (
          <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-lg p-4 text-center my-4">
            <ShieldCheck size={28} className="mx-auto text-emerald-400 mb-1" />
            <div className="text-sm font-bold text-white">{successMessage}</div>
            <div className="text-xs text-zinc-400 mt-1 font-mono">Transaction logged under Worker {workerId}</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Quick Pick Offline Households */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                Quick Select Offline Registered Household
              </label>
              <div className="space-y-1">
                {quickHouseholds.map((hh) => (
                  <button
                    key={hh.id}
                    type="button"
                    onClick={() => {
                      setHouseholdId(hh.id);
                      setHouseholdName(hh.name);
                    }}
                    className={`w-full text-left p-2 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                      householdId === hh.id
                        ? 'bg-zinc-800 border-emerald-500 text-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-zinc-200">{hh.name}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">{hh.id} · {hh.address}</div>
                    </div>
                    <span className="font-mono text-xs text-emerald-400 font-bold">Select</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Household ID input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-white">
                Household ID / AMC QR Code Number
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={householdId}
                  onChange={(e) => setHouseholdId(e.target.value)}
                  placeholder="e.g. HH-NV-0188"
                  className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Physical Check Toggles */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                Physical Inspection Checklist
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStreamWet(!selectedStreamWet)}
                  className={`p-2.5 rounded-lg border text-xs text-left flex items-center justify-between ${
                    selectedStreamWet
                      ? 'bg-zinc-800 border-emerald-500 text-white shadow-xs'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <span>Wet Stream Clean</span>
                  <Check size={14} className={selectedStreamWet ? 'text-emerald-400' : 'text-transparent'} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStreamDry(!selectedStreamDry)}
                  className={`p-2.5 rounded-lg border text-xs text-left flex items-center justify-between ${
                    selectedStreamDry
                      ? 'bg-zinc-800 border-emerald-500 text-white shadow-xs'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <span>Dry Stream Clean</span>
                  <Check size={14} className={selectedStreamDry ? 'text-emerald-400' : 'text-transparent'} />
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-zinc-800 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-300 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !householdId.trim()}
                className="w-2/3 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <LeafGlyph size={14} color="#000000" />
                <span>{isSubmitting ? 'Recording...' : 'Grant 2 Credits'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
