import React, { useState } from 'react';
import { X, Check, ShieldCheck, MapPin, Edit3 } from 'lucide-react';
import { LeafGlyph } from '../LeafGlyph';
import { LocationData } from '../../types';
import { workerIssue } from '../../lib/api';
import { LocationPickerModal } from '../LocationPickerModal';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState<boolean>(false);
  const [workerLocation, setWorkerLocation] = useState<LocationData>({
    lat: 23.03842,
    lng: 72.55918,
    address: 'Navrangpura Ward 12 Doorstep Route (23.03842°N, 72.55918°E)',
    isFallback: false,
    ward: 'Ward 12 - Navrangpura',
    accuracyMeters: 4,
    source: 'gps',
  });

  if (!isOpen) return null;

  // Preset known offline households for quick worker selection
  // Registered "no smartphone" households (seeded in 0013).
  const quickHouseholds = [
    { id: 'HH-NV-0188', name: 'Chawl No. 4, Mithakhali (no smartphone)', address: 'Navrangpura' },
    { id: 'HH-NV-0245', name: 'Block C-12, Navrangpura Gaam (elderly)', address: 'Navrangpura' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = householdId.trim();
    if (!code) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const streams = [selectedStreamWet && 'wet', selectedStreamDry && 'dry'].filter(
        Boolean
      ) as string[];
      const res = await workerIssue({
        householdCode: code,
        streams,
        workerLat: workerLocation.lat,
        workerLng: workerLocation.lng,
      });
      setSuccessMessage(`${res.creditsAwarded} leaves issued to ${res.householdCode}`);
      await onCreditIssued();
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1400);
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not issue credit.');
    } finally {
      setIsSubmitting(false);
    }
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
            {errorMessage && (
              <div className="bg-red-950/50 border border-red-500/40 rounded-lg p-2.5 text-[11px] text-red-300">
                {errorMessage}
              </div>
            )}
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

            {/* Doorstep Location with Pen Icon */}
            <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <MapPin size={13} className="text-emerald-400 shrink-0" />
                  <span className="text-[11px] uppercase tracking-wider font-mono text-zinc-400">Doorstep Location:</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLocationPickerOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/60 hover:bg-emerald-950 border border-emerald-500/30 px-2 py-0.5 rounded-xs transition-colors cursor-pointer"
                >
                  <Edit3 size={11} />
                  <span>Edit Map</span>
                </button>
              </div>
              <div className="text-[11px] font-mono text-zinc-300 truncate">
                {workerLocation.address}
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
                <span>{isSubmitting ? 'Issuing…' : 'Issue leaves'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Location Picker Modal */}
        <LocationPickerModal
          isOpen={isLocationPickerOpen}
          onClose={() => setIsLocationPickerOpen(false)}
          currentLocation={workerLocation}
          onLocationSelected={(newLoc) => setWorkerLocation(newLoc)}
        />
      </div>
    </div>
  );
};
