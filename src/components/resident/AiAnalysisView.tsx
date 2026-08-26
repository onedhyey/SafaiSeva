import React, { useState, useEffect } from 'react';
import { VerificationResult, LocationData, StreamChecklist } from '../../types';
import { LeafGlyph } from '../LeafGlyph';
import { Check, Clock, AlertTriangle, XCircle, ArrowRight, ShieldCheck } from 'lucide-react';

interface AiAnalysisViewProps {
  photoUrl: string;
  streams: StreamChecklist;
  location: LocationData;
  verificationResult: VerificationResult;
  currentBalance: number;
  onComplete: () => void;
}

export const AiAnalysisView: React.FC<AiAnalysisViewProps> = ({
  photoUrl,
  verificationResult,
  currentBalance,
  onComplete,
}) => {
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(0);
  const [isAnalysing, setIsAnalysing] = useState<boolean>(true);
  const [displayedBalance, setDisplayedBalance] = useState<number>(currentBalance);

  const stages = [
    { id: '1', name: 'Detecting waste streams', desc: 'Segmenting 4-stream protocol containers' },
    { id: '2', name: 'Checking for cross-contamination', desc: 'Analyzing organic purity & film liners' },
    { id: '3', name: 'Confirming location and time', desc: 'Validating GPS polygon & morning window' },
  ];

  useEffect(() => {
    // Stage 1 -> Stage 2 -> Stage 3 pacing (~800ms per stage)
    const t1 = setTimeout(() => setCurrentStageIndex(1), 850);
    const t2 = setTimeout(() => setCurrentStageIndex(2), 1700);
    const t3 = setTimeout(() => {
      setCurrentStageIndex(3);
      setIsAnalysing(false);

      // Trigger count-up animation if approved
      if (verificationResult.status === 'verified') {
        const start = currentBalance;
        const target = currentBalance + 2;
        let cur = start;
        const countInterval = setInterval(() => {
          if (cur < target) {
            cur += 1;
            setDisplayedBalance(cur);
          } else {
            clearInterval(countInterval);
          }
        }, 150);
      }
    }, 2550);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [verificationResult, currentBalance]);

  const isApproved = verificationResult.status === 'verified';
  const isReview = verificationResult.status === 'in_review';
  const isRejected = verificationResult.status === 'rejected';

  return (
    <div className="space-y-4 pb-20 pt-1 text-left select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-sm font-semibold text-white">AI Vision Verification</h1>
          <p className="text-xs text-muted-l">Ahmedabad Municipal Corporation Edge Engine</p>
        </div>
        <div className="font-mono text-[11px] text-muted-l bg-ink-soft px-2 py-0.5 rounded-sm border border-muted/20">
          {isAnalysing ? 'SCANNING' : 'COMPLETE'}
        </div>
      </div>

      {/* Captured Image with Scanning Sweep Line */}
      <div className="relative rounded-lg overflow-hidden bg-ink aspect-[4/3] border border-muted/30">
        <img
          src={photoUrl}
          alt="Segregation capture for verification"
          className={`w-full h-full object-contain transition-opacity duration-500 ${
            isAnalysing ? 'opacity-70 filter contrast-125' : 'opacity-90'
          }`}
        />

        {/* Scan sweep line */}
        {isAnalysing && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="w-full h-1 bg-green shadow-[0_0_12px_#19A85B] animate-[scan_2s_ease-in-out_infinite]" />
            <div className="absolute top-2 left-2 font-mono text-[10px] bg-ink/80 text-green px-2 py-0.5 rounded-sm border border-green/30">
              FRAME // CONF: 98.4%
            </div>
            <div className="absolute bottom-2 right-2 font-mono text-[10px] bg-ink/80 text-tint px-2 py-0.5 rounded-sm border border-muted/40">
              STREAM MATRIX ACTIVE
            </div>
          </div>
        )}

        {/* Bounding Box Highlights after scan */}
        {!isAnalysing && (
          <div className="absolute inset-0 pointer-events-none p-3">
            <div
              className={`w-full h-full border-2 rounded-md transition-colors ${
                isApproved
                  ? 'border-green/80 bg-green/5'
                  : isReview
                  ? 'border-amber/80 bg-amber/5'
                  : 'border-red/80 bg-red/5'
              }`}
            />
          </div>
        )}
      </div>

      {/* 3-Stage Progress Indicator */}
      <div className="bg-ink-soft border border-muted/30 rounded-lg p-3.5 space-y-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-l mb-1">
          Analysis Pipeline
        </div>

        <div className="space-y-2">
          {stages.map((stage, idx) => {
            const isDone = currentStageIndex > idx;
            const isCurrent = currentStageIndex === idx && isAnalysing;
            const stagePass = isDone && (verificationResult.stages[idx]?.passed ?? true);

            return (
              <div key={stage.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-xs flex items-center justify-center border text-[10px] font-mono shrink-0 transition-colors ${
                      isDone
                        ? stagePass
                          ? 'bg-green/20 border-green text-green'
                          : 'bg-amber/20 border-amber text-amber'
                        : isCurrent
                        ? 'border-green text-green animate-pulse'
                        : 'border-muted/40 text-muted-l'
                    }`}
                  >
                    {isDone ? (
                      stagePass ? (
                        <Check size={11} strokeWidth={3} />
                      ) : (
                        <Clock size={11} />
                      )
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <div>
                    <span
                      className={`font-medium ${
                        isDone || isCurrent ? 'text-tint' : 'text-muted'
                      }`}
                    >
                      {stage.name}
                    </span>
                    <div className="text-[10px] text-muted-l leading-none mt-0.5">
                      {stage.desc}
                    </div>
                  </div>
                </div>

                <div className="font-mono text-[11px]">
                  {isDone ? (
                    <span className={stagePass ? 'text-green' : 'text-amber'}>
                      {stagePass ? 'OK' : 'FLAG'}
                    </span>
                  ) : isCurrent ? (
                    <span className="text-green animate-pulse">Scanning...</span>
                  ) : (
                    <span className="text-muted">Wait</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Itemised Readout Table */}
      {!isAnalysing && (
        <div className="bg-ink-soft border border-muted/30 rounded-lg p-3.5 space-y-2 text-left">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-l mb-1">
            Itemised Stream Readout
          </div>

          <div className="divide-y divide-muted/15 text-xs">
            {/* Wet */}
            <div className="py-1.5 flex items-center justify-between">
              <span className="font-medium text-white w-24">Wet (લીલો)</span>
              <span className="text-muted-l flex-1 text-[11px] truncate px-2">
                {verificationResult.streams.wet.note}
              </span>
              <span
                className={`font-mono font-bold ${
                  verificationResult.streams.wet.verdict === 'clean'
                    ? 'text-green'
                    : verificationResult.streams.wet.verdict === 'none'
                    ? 'text-muted'
                    : 'text-red'
                }`}
              >
                {verificationResult.streams.wet.verdict === 'clean'
                  ? '✓'
                  : verificationResult.streams.wet.verdict === 'none'
                  ? '—'
                  : '✗'}
              </span>
            </div>

            {/* Dry */}
            <div className="py-1.5 flex items-center justify-between">
              <span className="font-medium text-white w-24">Dry (સૂકો)</span>
              <span className="text-muted-l flex-1 text-[11px] truncate px-2">
                {verificationResult.streams.dry.note}
              </span>
              <span
                className={`font-mono font-bold ${
                  verificationResult.streams.dry.verdict === 'clean'
                    ? 'text-green'
                    : verificationResult.streams.dry.verdict === 'none'
                    ? 'text-muted'
                    : 'text-red'
                }`}
              >
                {verificationResult.streams.dry.verdict === 'clean'
                  ? '✓'
                  : verificationResult.streams.dry.verdict === 'none'
                  ? '—'
                  : '✗'}
              </span>
            </div>

            {/* Sanitary */}
            <div className="py-1.5 flex items-center justify-between">
              <span className="font-medium text-white w-24">Sanitary</span>
              <span className="text-muted-l flex-1 text-[11px] truncate px-2">
                {verificationResult.streams.sanitary.note}
              </span>
              <span
                className={`font-mono font-bold ${
                  verificationResult.streams.sanitary.verdict === 'wrapped'
                    ? 'text-green'
                    : verificationResult.streams.sanitary.verdict === 'none'
                    ? 'text-muted'
                    : 'text-red'
                }`}
              >
                {verificationResult.streams.sanitary.verdict === 'wrapped'
                  ? '✓'
                  : verificationResult.streams.sanitary.verdict === 'none'
                  ? '—'
                  : '✗'}
              </span>
            </div>

            {/* Special Care */}
            <div className="py-1.5 flex items-center justify-between">
              <span className="font-medium text-white w-24">Special Care</span>
              <span className="text-muted-l flex-1 text-[11px] truncate px-2">
                {verificationResult.streams.special_care.note}
              </span>
              <span
                className={`font-mono font-bold ${
                  verificationResult.streams.special_care.verdict === 'safe'
                    ? 'text-amber'
                    : verificationResult.streams.special_care.verdict === 'none'
                    ? 'text-muted'
                    : 'text-red'
                }`}
              >
                {verificationResult.streams.special_care.verdict === 'safe'
                  ? '⚠'
                  : verificationResult.streams.special_care.verdict === 'none'
                  ? '—'
                  : '✗'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Result Banner */}
      {!isAnalysing && (
        <div
          className={`rounded-lg p-4 border text-left space-y-2 ${
            isApproved
              ? 'bg-green/10 border-green/40 text-tint'
              : isReview
              ? 'bg-amber/10 border-amber/40 text-tint'
              : 'bg-red/10 border-red/40 text-tint'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isApproved && <ShieldCheck size={18} className="text-green shrink-0" />}
              {isReview && <Clock size={18} className="text-amber shrink-0" />}
              {isRejected && <XCircle size={18} className="text-red shrink-0" />}
              <span
                className={`text-sm font-bold uppercase tracking-wide ${
                  isApproved ? 'text-green' : isReview ? 'text-amber' : 'text-red'
                }`}
              >
                {isApproved && 'Approved — Verification Passed'}
                {isReview && 'Queued for Spot-Check'}
                {isRejected && 'Handover Rejected'}
              </span>
            </div>

            {isApproved && (
              <div className="inline-flex items-center gap-1.5 bg-green/20 px-2.5 py-1 rounded-sm border border-green/40 font-mono text-sm font-bold text-green">
                <LeafGlyph size={15} color="#19A85B" />
                <span>+2</span>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-l leading-relaxed">
            {verificationResult.decisionReason}
          </p>

          {isApproved && (
            <div className="pt-2 border-t border-green/20 flex items-center justify-between text-xs text-tint">
              <span>Updated Balance:</span>
              <span className="font-mono font-bold text-white tabular-nums flex items-center gap-1">
                <LeafGlyph size={13} color="#19A85B" />
                <span>{displayedBalance} leaves</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Return to Wallet / Activity CTA */}
      {!isAnalysing && (
        <button
          onClick={onComplete}
          className="w-full bg-ink-soft hover:bg-muted/20 border border-muted/40 text-white font-semibold text-xs py-3 px-4 rounded-md transition-colors flex items-center justify-center gap-1.5 min-h-[44px]"
        >
          <span>Return to Wallet Activity</span>
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
};
