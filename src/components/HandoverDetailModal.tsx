import React from 'react';
import { X, MapPin, Clock, ShieldCheck, Check, AlertTriangle } from 'lucide-react';
import { HandoverRecord } from '../types';
import { LeafGlyph } from './LeafGlyph';

interface HandoverDetailModalProps {
  handover: HandoverRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export const HandoverDetailModal: React.FC<HandoverDetailModalProps> = ({
  handover,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !handover) return null;

  const isVerified = handover.status === 'verified';
  const isInReview = handover.status === 'in_review';
  const isRejected = handover.status === 'rejected';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none font-sans">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-xl p-5 text-left text-zinc-200 relative shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm border ${
                isVerified
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                  : isInReview
                  ? 'bg-amber-950/60 border-amber-500/40 text-amber-400'
                  : 'bg-red-950/60 border-red-500/40 text-red-400'
              }`}
            >
              {handover.status}
            </span>
            <span className="font-mono text-xs text-zinc-400">{handover.id}</span>
          </div>
          <h2 className="text-sm font-bold text-white mt-1">{handover.householdName}</h2>
          <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
            <MapPin size={12} className="text-emerald-400 shrink-0" />
            <span className="truncate">{handover.location.address}</span>
          </p>
        </div>

        {/* Captured Photo */}
        <div className="rounded-lg overflow-hidden bg-zinc-950 aspect-[4/3] border border-zinc-800 my-3">
          <img
            src={handover.photoUrl}
            alt="Handover photograph"
            className="w-full h-full object-contain"
          />
        </div>

        {/* Verification Summary */}
        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 font-mono">Decision Rationale</span>
            <div className="inline-flex items-center gap-1 font-mono font-bold text-white">
              <LeafGlyph size={13} color="#10b981" />
              <span>{handover.creditsAwarded} Credits</span>
            </div>
          </div>
          <p className="text-zinc-200 leading-relaxed">{handover.verification.decisionReason}</p>
        </div>

        {/* Itemised Breakdown */}
        <div className="space-y-1.5 pt-3">
          <div className="text-[11px] font-mono uppercase text-zinc-400 tracking-wider">
            Stream Analysis Readout
          </div>
          <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 divide-y divide-zinc-800/80 text-xs font-mono">
            <div className="py-1 flex justify-between">
              <span className="text-zinc-200">Wet Organic:</span>
              <span className={handover.verification.streams.wet.verdict === 'clean' ? 'text-emerald-400' : 'text-red-400'}>
                {handover.verification.streams.wet.note}
              </span>
            </div>
            <div className="py-1 flex justify-between">
              <span className="text-zinc-200">Dry Recyclable:</span>
              <span className={handover.verification.streams.dry.verdict === 'clean' ? 'text-emerald-400' : 'text-red-400'}>
                {handover.verification.streams.dry.note}
              </span>
            </div>
            <div className="py-1 flex justify-between">
              <span className="text-zinc-200">Sanitary:</span>
              <span className="text-zinc-400">{handover.verification.streams.sanitary.note}</span>
            </div>
            <div className="py-1 flex justify-between">
              <span className="text-zinc-200">Special Care:</span>
              <span className="text-zinc-400">{handover.verification.streams.special_care.note}</span>
            </div>
          </div>
        </div>

        {/* Full Audit Metadata */}
        <div className="space-y-1.5 pt-3 border-t border-zinc-800 text-[11px] font-mono text-zinc-400">
          <div className="flex justify-between">
            <span>Timestamp:</span>
            <span className="text-zinc-200">{new Date(handover.timestamp).toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between">
            <span>Image Hash:</span>
            <span className="text-zinc-200 truncate max-w-[180px]">{handover.imageHash}</span>
          </div>
          <div className="flex justify-between">
            <span>Source Engine:</span>
            <span className="text-zinc-200">{handover.source === 'manual_worker' ? 'Doorstep Worker' : 'AMC AI Vision'}</span>
          </div>
          {handover.reviewedBy && (
            <div className="flex justify-between text-amber-400">
              <span>Reviewed By:</span>
              <span className="truncate max-w-[180px]">{handover.reviewedBy}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
