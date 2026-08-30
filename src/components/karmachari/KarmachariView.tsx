import React, { useCallback, useEffect, useState } from 'react';
import { KarmachariProfile } from '../../types';
import {
  Check,
  X,
  UserPlus,
  AlertTriangle,
  MapPin,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { getReviewQueue, decideReview, ReviewItem } from '../../lib/api';
import { IssueCreditModal } from './IssueCreditModal';

interface KarmachariViewProps {
  karmachari: KarmachariProfile;
  onRefreshData: () => Promise<void>;
}

const REJECT_REASONS = [
  'Not separated at source',
  'Wrong stream placement',
  'Photo does not match location',
];

export const KarmachariView: React.FC<KarmachariViewProps> = ({ karmachari, onRefreshData }) => {
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { items } = await getReviewQueue();
      setItems(items);
    } catch (e: any) {
      setLoadError(e.message || 'Could not load the review queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setProcessing(id);
    try {
      await decideReview(id, decision, { reason: rejectReason[id] });
      await load();
      await onRefreshData();
    } catch (e: any) {
      setLoadError(e.message || 'Action failed.');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-4 pb-20 pt-1 text-left select-none font-sans">
      {/* Worker header */}
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
            <span className="font-mono text-[11px] text-green font-semibold uppercase">Shift Active</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
          <div className="bg-ink p-2 rounded-xs border border-muted/20">
            <div className="text-[10px] text-muted-l uppercase">In queue</div>
            <div className="text-base font-bold text-white tabular-nums">{items.length}</div>
          </div>
          <div className="bg-ink p-2 rounded-xs border border-muted/20">
            <div className="text-[10px] text-muted-l uppercase">No-app issued</div>
            <div className="text-base font-bold text-green tabular-nums">
              {karmachari.manualCreditsIssued}
            </div>
          </div>
          <div className="bg-ink p-2 rounded-xs border border-muted/20">
            <div className="text-[10px] text-muted-l uppercase">Zone</div>
            <div className="text-base font-bold text-tint tabular-nums">W-12</div>
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowIssueModal(true)}
        className="w-full bg-tint hover:bg-white text-ink border border-muted/40 font-bold text-xs py-3.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer min-h-[46px]"
      >
        <UserPlus size={16} strokeWidth={2.5} className="text-green" />
        <span className="uppercase tracking-wider">Issue Credit (Without App / Feature Phone)</span>
      </button>

      {/* Review queue */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">Review Queue</h2>
            <span className="font-mono text-xs bg-amber/20 text-amber px-2 py-0.5 rounded-xs border border-amber/40 font-semibold tabular-nums">
              {items.length} pending
            </span>
          </div>
          <button
            onClick={load}
            className="text-[10px] font-mono text-muted-l hover:text-white flex items-center gap-1"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {loadError && (
          <div className="bg-red/10 border border-red/30 rounded-md p-3 text-xs text-tint">{loadError}</div>
        )}

        {!loadError && loading && items.length === 0 && (
          <div className="bg-ink-soft border border-muted/20 rounded-md p-6 text-center text-xs text-muted-l">
            Loading…
          </div>
        )}

        {!loading && items.length === 0 && !loadError && (
          <div className="bg-ink-soft border border-muted/20 rounded-md p-6 text-center text-xs text-muted-l space-y-1">
            <CheckCircle2 size={24} className="mx-auto text-green mb-1" />
            <div className="font-semibold text-tint">Queue clear</div>
            <p className="text-[11px]">No handovers are waiting for a human check.</p>
          </div>
        )}

        <div className="space-y-3">
          {items.map((it) => {
            const reason = rejectReason[it.handover_id] || REJECT_REASONS[0];
            const busy = processing === it.handover_id;
            return (
              <div
                key={it.handover_id}
                className="bg-ink-soft border border-muted/30 rounded-md p-3.5 space-y-3 text-tint"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{it.household_code}</span>
                      <span className="font-mono text-[10px] bg-ink px-1.5 py-0.5 rounded-xs text-muted-l border border-muted/30">
                        {it.ward_name}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-l flex items-center gap-1 mt-0.5">
                      <MapPin size={11} className="text-amber shrink-0" />
                      <span className="truncate max-w-[240px]">{it.address}</span>
                    </div>
                  </div>
                  <div className="text-right font-mono text-[10px] text-muted-l shrink-0">
                    <div>{new Date(it.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                    <div className="text-amber font-semibold">HELD</div>
                  </div>
                </div>

                <div className="bg-ink p-2 rounded-sm border border-muted/20 text-[11px] space-y-1">
                  <div className="font-bold text-amber text-[10px] uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle size={11} />
                    <span>Why it's here</span>
                  </div>
                  <p className="text-tint leading-tight font-medium">
                    {it.decision_reason_text || it.decision_reason_code || 'Flagged for review.'}
                  </p>
                  <div className="text-[10px] font-mono text-muted-l pt-0.5">
                    Declared: {it.declared_streams.join(', ') || '—'}
                    {it.overall_confidence != null && ` · confidence ${Math.round(it.overall_confidence * 100)}%`}
                    {it.fraud_signals.length > 0 && ` · signals: ${it.fraud_signals.join(', ')}`}
                  </div>
                </div>

                <div className="space-y-1 pt-1 border-t border-muted/20">
                  <div className="text-[10px] font-mono text-muted-l uppercase">Reject reason (if denying):</div>
                  <div className="flex flex-wrap gap-1">
                    {REJECT_REASONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setRejectReason((p) => ({ ...p, [it.handover_id]: r }))}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded-xs border transition-colors ${
                          reason === r
                            ? 'bg-red/20 border-red text-white'
                            : 'bg-ink border-muted/30 text-muted-l hover:text-tint'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => decide(it.handover_id, 'reject')}
                    disabled={busy}
                    className="bg-ink hover:bg-red/20 text-red border border-red/40 font-bold text-xs py-2.5 rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[42px] disabled:opacity-50"
                  >
                    <X size={15} strokeWidth={2.5} />
                    <span>Reject</span>
                  </button>
                  <button
                    onClick={() => decide(it.handover_id, 'approve')}
                    disabled={busy}
                    className="bg-green hover:bg-[#16934f] text-ink font-bold text-xs py-2.5 rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[42px] disabled:opacity-50"
                  >
                    <Check size={15} strokeWidth={3} />
                    <span>Approve &amp; release</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <IssueCreditModal
        isOpen={showIssueModal}
        onClose={() => setShowIssueModal(false)}
        onCreditIssued={async () => {
          await load();
          await onRefreshData();
        }}
        workerId={karmachari.workerCode}
      />
    </div>
  );
};
