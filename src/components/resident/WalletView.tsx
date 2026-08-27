import React from 'react';
import { HouseholdProfile, HandoverRecord } from '../../types';
import { LeafGlyph } from '../LeafGlyph';
import { Camera, Check, Clock, AlertCircle, ChevronRight, Flame } from 'lucide-react';

interface WalletViewProps {
  household: HouseholdProfile;
  handovers: HandoverRecord[];
  onNavigateToDocument: () => void;
  onSelectHandover: (handover: HandoverRecord) => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  household,
  handovers,
  onNavigateToDocument,
  onSelectHandover,
}) => {
  const nextRideTarget = 20;
  const currentBalance = household.balance;
  const progressRatio = Math.min(1, currentBalance / nextRideTarget);
  const creditsNeeded = Math.max(0, nextRideTarget - currentBalance);

  // Recent 5 user-relevant handovers
  const recentHandovers = handovers
    .filter((h) => h.householdId === household.id)
    .slice(0, 7);

  return (
    <div className="space-y-5 pb-20 pt-2 text-left">
      {/* Household Header Badge */}
      <div className="flex items-center justify-between text-xs text-muted-l px-1">
        <div>
          <span className="font-semibold text-tint">{household.name}</span>
          <span className="mx-1.5 text-muted">·</span>
          <span>{household.ward.split(',')[0]}</span>
        </div>
        <div className="inline-flex items-center gap-1 font-mono text-[11px] bg-ink-soft px-2 py-0.5 rounded-sm border border-muted/20 text-muted-l">
          <Flame size={12} className="text-amber" />
          <span>{household.streakDays}-day streak</span>
        </div>
      </div>

      {/* Hero Wallet Card */}
      <div className="bg-ink-soft border border-muted/30 rounded-lg p-6 text-tint">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-l mb-1">
          Segregation Balance
        </div>

        {/* Hero Number */}
        <div className="flex items-baseline gap-2.5 my-2">
          <LeafGlyph size={36} color="#19A85B" className="shrink-0 -mt-1" />
          <span className="font-mono text-5xl font-bold tracking-tight text-white tabular-nums">
            {currentBalance}
          </span>
          <span className="text-sm font-medium text-muted-l">leaves</span>
        </div>

        {/* Ride Progress Goal */}
        <div className="mt-4 pt-4 border-t border-muted/20">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-l">Next free transit ride</span>
            <span className="font-mono text-xs font-semibold text-tint tabular-nums">
              {currentBalance} / {nextRideTarget} credits
            </span>
          </div>

          {/* Clean Progress Bar (no gradients) */}
          <div className="w-full bg-ink h-2 rounded-sm overflow-hidden border border-muted/30">
            <div
              className="bg-green h-full transition-all duration-300 rounded-xs"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>

          <div className="text-[11px] text-muted-l mt-2">
            {creditsNeeded === 0
              ? 'Ready to redeem for a Janmarg BRTS or Metro single ride'
              : `${creditsNeeded} more credits needed (${Math.ceil(creditsNeeded / 2)} morning handovers)`}
          </div>
        </div>
      </div>

      {/* Primary Action Button */}
      <div>
        <button
          onClick={onNavigateToDocument}
          className="w-full bg-green hover:bg-[#16934f] text-ink font-semibold text-sm py-3.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer min-h-[48px]"
        >
          <Camera size={18} strokeWidth={2.2} />
          <span>Document today&apos;s handover</span>
        </button>
        <p className="text-[11px] text-center text-muted-l mt-1.5">
          Variable Leaf Credits per AI verified segregated collection
        </p>
      </div>

      {/* Recent Activity Feed */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-l">
            Recent Handover History
          </h2>
          <span className="text-[11px] font-mono text-muted-l">Last 7 days</span>
        </div>

        <div className="space-y-1.5">
          {recentHandovers.length === 0 ? (
            <div className="bg-ink-soft p-4 rounded-md text-center text-xs text-muted-l border border-muted/20">
              No handover recorded yet today.
            </div>
          ) : (
            recentHandovers.map((h) => {
              const isVerified = h.status === 'verified';
              const isInReview = h.status === 'in_review';
              const isRejected = h.status === 'rejected';

              return (
                <div
                  key={h.id}
                  onClick={() => onSelectHandover(h)}
                  className="bg-ink-soft hover:bg-ink-soft/80 border border-muted/20 rounded-md p-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {/* Status Pill */}
                    <div
                      className={`w-7 h-7 rounded-sm flex items-center justify-center shrink-0 border ${
                        isVerified
                          ? 'bg-green/10 border-green/30 text-green'
                          : isInReview
                          ? 'bg-amber/10 border-amber/30 text-amber'
                          : 'bg-red/10 border-red/30 text-red'
                      }`}
                    >
                      {isVerified && <Check size={14} strokeWidth={2.5} />}
                      {isInReview && <Clock size={14} />}
                      {isRejected && <AlertCircle size={14} />}
                    </div>

                    <div>
                      <div className="text-xs font-medium text-tint">
                        {h.dateString === new Date().toISOString().split('T')[0]
                          ? "Today's Handover"
                          : new Date(h.timestamp).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                      </div>
                      <div className="text-[11px] text-muted-l truncate max-w-[190px]">
                        {isVerified && '4 streams segregated'}
                        {isInReview && 'Queued for spot-check'}
                        {isRejected && 'Non-compliant separation'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="inline-flex items-center gap-1 font-mono text-xs font-semibold tabular-nums text-white">
                        <LeafGlyph
                          size={12}
                          color={isVerified ? '#19A85B' : isInReview ? '#F0A83C' : '#5B6B61'}
                        />
                        <span>{isVerified ? `+${h.creditsAwarded ?? 2}` : isInReview ? 'Held' : '0'}</span>
                      </div>
                      <div className="text-[10px] text-muted-l font-mono">
                        {new Date(h.timestamp).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-muted" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
