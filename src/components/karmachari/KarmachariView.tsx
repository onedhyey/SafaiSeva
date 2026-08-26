import React, { useState } from 'react';
import { KarmachariProfile, HandoverRecord } from '../../types';
import { LeafGlyph } from '../LeafGlyph';
import {
  Check,
  X,
  UserPlus,
  Clock,
  AlertTriangle,
  MapPin,
  FileCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { updateHandover } from '../../lib/db';
import { IssueCreditModal } from './IssueCreditModal';

interface KarmachariViewProps {
  karmachari: KarmachariProfile;
  handovers: HandoverRecord[];
  onRefreshData: () => Promise<void>;
}

export const KarmachariView: React.FC<KarmachariViewProps> = ({
  karmachari,
  handovers,
  onRefreshData,
}) => {
  const [showIssueModal, setShowIssueModal] = useState<boolean>(false);
  const [selectedRejectReason, setSelectedRejectReason] = useState<Record<string, string>>({});
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Review Queue: Only handovers the AI marked `in_review`
  const pendingReviews = handovers.filter((h) => h.status === 'in_review');

  const handleApprove = async (handover: HandoverRecord) => {
    setProcessingId(handover.id);
    await updateHandover(handover.id, {
      status: 'verified',
      creditsAwarded: 2,
      reviewedBy: `Karmachari ${karmachari.name} (${karmachari.id})`,
      reviewedAt: new Date().toISOString(),
      reviewNotes: 'Approved after on-ground worker visual inspection.',
    });
    await onRefreshData();
    setProcessingId(null);
  };

  const handleReject = async (handover: HandoverRecord, reason: string) => {
    setProcessingId(handover.id);
    await updateHandover(handover.id, {
      status: 'rejected',
      creditsAwarded: 0,
      reviewedBy: `Karmachari ${karmachari.name} (${karmachari.id})`,
      reviewedAt: new Date().toISOString(),
      reviewNotes: `Rejected on ground: ${reason}`,
      verification: {
        ...handover.verification,
        status: 'rejected',
        decisionReason: reason,
      },
    });
    await onRefreshData();
    setProcessingId(null);
  };

  const toggleExpand = (id: string) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const rejectReasons = [
    'Not separated at source',
    'Wrong stream placement',
    'Photo does not match location',
  ];

  return (
    <div className="space-y-4 pb-20 pt-1 text-left select-none font-sans">
      {/* Worker Utilitarian Header */}
      <div className="bg-ink-soft border border-muted/40 rounded-md p-3 text-tint">
        <div className="flex items-center justify-between text-xs pb-2 border-b border-muted/20">
          <div>
            <div className="font-mono text-xs font-bold text-white uppercase tracking-wide">
              {karmachari.name}
            </div>
            <div className="font-mono text-[11px] text-muted-l">
              {karmachari.workerCode} · {karmachari.zone} · {karmachari.ward}
            </div>
          </div>
          <div className="text-right">
            <span className="inline-block w-2 h-2 rounded-full bg-green mr-1.5" />
            <span className="font-mono text-[11px] text-green font-semibold uppercase">
              Shift Active
            </span>
          </div>
        </div>

        {/* 3 Work Stats in Dense High-Contrast Grid */}
        <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
          <div className="bg-ink p-2 rounded-xs border border-muted/20">
            <div className="text-[10px] text-muted-l uppercase">Cleared Today</div>
            <div className="text-base font-bold text-white tabular-nums">
              {karmachari.reviewsClearedToday}
            </div>
          </div>

          <div className="bg-ink p-2 rounded-xs border border-muted/20">
            <div className="text-[10px] text-muted-l uppercase">No-App Issued</div>
            <div className="text-base font-bold text-green tabular-nums">
              {karmachari.manualCreditsIssued}
            </div>
          </div>

          <div className="bg-ink p-2 rounded-xs border border-muted/20">
            <div className="text-[10px] text-muted-l uppercase">Override Rate</div>
            <div className="text-base font-bold text-tint tabular-nums">
              {karmachari.overrideRate}%
            </div>
          </div>
        </div>
      </div>

      {/* Prominent Primary Action: Issue Credit Without App (Equity Guarantee) */}
      <button
        onClick={() => setShowIssueModal(true)}
        className="w-full bg-tint hover:bg-white text-ink border border-muted/40 font-bold text-xs py-3.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer min-h-[46px]"
      >
        <UserPlus size={16} strokeWidth={2.5} className="text-green" />
        <span className="uppercase tracking-wider">Issue Credit (Without App / Feature Phone)</span>
      </button>

      {/* Exception Review Queue */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">
              AI Exception Review Queue
            </h2>
            <span className="font-mono text-xs bg-amber/20 text-amber px-2 py-0.5 rounded-xs border border-amber/40 font-semibold tabular-nums">
              {pendingReviews.length} pending
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-l">Human Clearance Path</span>
        </div>

        {pendingReviews.length === 0 ? (
          <div className="bg-ink-soft border border-muted/20 rounded-md p-6 text-center text-xs text-muted-l space-y-1">
            <CheckCircle2 size={24} className="mx-auto text-green mb-1" />
            <div className="font-semibold text-tint">Queue Clear</div>
            <p className="text-[11px]">All AI flagged exceptions have been resolved for this route.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingReviews.map((h) => {
              const activeRejectReason =
                selectedRejectReason[h.id] || 'Not separated at source';
              const isExpanded = expandedDetails[h.id] ?? false;
              const isProcessing = processingId === h.id;

              return (
                <div
                  key={h.id}
                  className="bg-ink-soft border border-muted/30 rounded-md p-3.5 space-y-3 text-tint"
                >
                  {/* Row Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{h.householdName}</span>
                        <span className="font-mono text-[10px] bg-ink px-1.5 py-0.5 rounded-xs text-muted-l border border-muted/30">
                          {h.householdId}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-l flex items-center gap-1 mt-0.5">
                        <MapPin size={11} className="text-amber shrink-0" />
                        <span className="truncate max-w-[220px]">{h.location.address}</span>
                      </div>
                    </div>

                    <div className="text-right font-mono text-[10px] text-muted-l shrink-0">
                      <div>
                        {new Date(h.timestamp).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="text-amber font-semibold">HELD (2 Lvs)</div>
                    </div>
                  </div>

                  {/* Split Layout: Photo Thumbnail + AI Readout */}
                  <div className="grid grid-cols-5 gap-2.5 bg-ink p-2 rounded-sm border border-muted/20">
                    {/* Photo */}
                    <div className="col-span-2 aspect-[4/3] rounded-xs overflow-hidden bg-ink-soft border border-muted/30 relative">
                      <img
                        src={h.photoUrl}
                        alt="Handover inspection"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-1 left-1 font-mono text-[9px] bg-ink/90 text-amber px-1 py-0.2 rounded-xs">
                        CONF: {Math.round(h.verification.confidence * 100)}%
                      </div>
                    </div>

                    {/* AI Readout summary */}
                    <div className="col-span-3 text-[11px] space-y-1 flex flex-col justify-center">
                      <div className="font-bold text-amber text-[10px] uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle size={11} />
                        <span>AI Flag Trigger</span>
                      </div>
                      <p className="text-tint text-[11px] leading-tight font-medium">
                        {h.verification.decisionReason}
                      </p>
                      <div className="text-[10px] font-mono text-muted-l pt-0.5">
                        Wet: {h.verification.streams.wet.status} · Dry: {h.verification.streams.dry.status}
                      </div>
                    </div>
                  </div>

                  {/* Expandable Technical Stage Audit */}
                  <div>
                    <button
                      onClick={() => toggleExpand(h.id)}
                      className="text-[10px] font-mono text-muted-l hover:text-white flex items-center gap-1 py-0.5"
                    >
                      <span>{isExpanded ? 'Hide stage audit' : 'Show full stage audit'}</span>
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>

                    {isExpanded && (
                      <div className="mt-1.5 space-y-1 bg-ink/70 p-2 rounded-xs text-[10px] font-mono border border-muted/20">
                        {h.verification.stages.map((st) => (
                          <div key={st.id} className="flex items-center justify-between text-muted-l">
                            <span>{st.label}</span>
                            <span className={st.passed ? 'text-green' : 'text-amber'}>
                              {st.passed ? 'PASSED' : 'FLAGGED'}
                            </span>
                          </div>
                        ))}
                        <div className="pt-1 text-muted text-[9px]">
                          Hash: {h.imageHash}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rejection Reason Selector Chips */}
                  <div className="space-y-1 pt-1 border-t border-muted/20">
                    <div className="text-[10px] font-mono text-muted-l uppercase">
                      Reject Reason (if denying):
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {rejectReasons.map((reason) => {
                        const active = activeRejectReason === reason;
                        return (
                          <button
                            key={reason}
                            onClick={() =>
                              setSelectedRejectReason((prev) => ({
                                ...prev,
                                [h.id]: reason,
                              }))
                            }
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-xs border transition-colors ${
                              active
                                ? 'bg-red/20 border-red text-white'
                                : 'bg-ink border-muted/30 text-muted-l hover:text-tint'
                            }`}
                          >
                            {reason}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Big Unambiguous Action Buttons (Approve / Reject) */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleReject(h, activeRejectReason)}
                      disabled={isProcessing}
                      className="bg-ink hover:bg-red/20 text-red border border-red/40 font-bold text-xs py-2.5 rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[42px]"
                    >
                      <X size={15} strokeWidth={2.5} />
                      <span>Reject</span>
                    </button>

                    <button
                      onClick={() => handleApprove(h)}
                      disabled={isProcessing}
                      className="bg-green hover:bg-[#16934f] text-ink font-bold text-xs py-2.5 rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[42px]"
                    >
                      <Check size={15} strokeWidth={3} />
                      <span>Approve & Release +2</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Issue Modal */}
      <IssueCreditModal
        isOpen={showIssueModal}
        onClose={() => setShowIssueModal(false)}
        onCreditIssued={onRefreshData}
        workerId={karmachari.workerCode}
      />
    </div>
  );
};
