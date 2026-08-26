import React from 'react';
import { HouseholdProfile, WardStats, HandoverRecord } from '../../types';
import { LeafGlyph } from '../LeafGlyph';
import { Bus, Recycle, Award, CheckCircle, TrendingUp } from 'lucide-react';

interface ImpactViewProps {
  household: HouseholdProfile;
  wardStats: WardStats;
  handovers: HandoverRecord[];
}

export const ImpactView: React.FC<ImpactViewProps> = ({
  household,
  wardStats,
  handovers,
}) => {
  const verifiedCount = handovers.filter(
    (h) => h.householdId === household.id && h.status === 'verified'
  ).length;

  const totalCreditsEarned = verifiedCount * 2;

  return (
    <div className="space-y-5 pb-20 pt-1 text-left select-none">
      {/* Header */}
      <div className="px-1">
        <h1 className="text-sm font-semibold text-white">Civic & Environmental Impact</h1>
        <p className="text-xs text-muted-l">Real-time diversion analytics for {household.ward}</p>
      </div>

      {/* 4 Personal Impact Stat Blocks */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Waste Kept Out of Pirana */}
        <div className="bg-ink-soft border border-muted/20 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-green">
            <Recycle size={15} />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-l">
              Diverted
            </span>
          </div>
          <div className="font-mono text-2xl font-bold text-white tabular-nums">
            {household.totalKgDiverted} <span className="text-xs font-normal text-muted-l">kg</span>
          </div>
          <p className="text-[10px] text-muted-l leading-tight">
            Kept out of Pirana dumpsite through clean segregation
          </p>
        </div>

        {/* Verified Handovers */}
        <div className="bg-ink-soft border border-muted/20 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-tint">
            <CheckCircle size={15} />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-l">
              Handovers
            </span>
          </div>
          <div className="font-mono text-2xl font-bold text-white tabular-nums">
            {verifiedCount}
          </div>
          <p className="text-[10px] text-muted-l leading-tight">
            AMC compliant morning door-to-door handovers
          </p>
        </div>

        {/* Credits Earned */}
        <div className="bg-ink-soft border border-muted/20 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-green">
            <LeafGlyph size={14} color="#19A85B" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-l">
              Earned
            </span>
          </div>
          <div className="font-mono text-2xl font-bold text-white tabular-nums">
            {totalCreditsEarned} <span className="text-xs font-normal text-muted-l">leaves</span>
          </div>
          <p className="text-[10px] text-muted-l leading-tight">
            Accumulated for Janmarg and Metro transit fares
          </p>
        </div>

        {/* Transit Rides Taken */}
        <div className="bg-ink-soft border border-muted/20 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-amber">
            <Bus size={15} />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-l">
              Rides
            </span>
          </div>
          <div className="font-mono text-2xl font-bold text-white tabular-nums">
            {household.ridesTaken}
          </div>
          <p className="text-[10px] text-muted-l leading-tight">
            Free Janmarg & Metro rides redeemed to date
          </p>
        </div>
      </div>

      {/* Ward Participation Gauge Card */}
      <div className="bg-ink-soft border border-muted/20 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-white">Ward 12 Participation Rate</div>
          <span className="font-mono text-xs font-bold text-green tabular-nums">
            {wardStats.participationRateThisWeek}%
          </span>
        </div>

        {/* CSS Bar Row */}
        <div className="w-full bg-ink h-2.5 rounded-sm overflow-hidden border border-muted/30">
          <div
            className="bg-green h-full rounded-xs transition-all duration-500"
            style={{ width: `${wardStats.participationRateThisWeek}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-l font-mono">
          <span>Target: 75% for Ward Clean Bonus</span>
          <span className="text-green flex items-center gap-1">
            <TrendingUp size={12} />
            <span>+6.3% vs last week</span>
          </span>
        </div>
      </div>

      {/* Ward Leaderboard of 8 Anonymised Households */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Award size={14} className="text-amber" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-l">
              Ward Segregation Leaderboard
            </h2>
          </div>
          <span className="text-[11px] text-muted-l font-mono">Top 8 Active</span>
        </div>

        <div className="bg-ink-soft border border-muted/20 rounded-lg divide-y divide-muted/15 overflow-hidden">
          {wardStats.leaderboard.map((item) => {
            const isUser = item.householdCode === household.id;

            return (
              <div
                key={item.rank}
                className={`p-3 flex items-center justify-between text-xs transition-colors ${
                  isUser ? 'bg-green/10 text-white font-medium' : 'text-tint hover:bg-ink/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-xs flex items-center justify-center font-mono text-xs font-bold ${
                      item.rank === 1
                        ? 'bg-amber text-ink'
                        : item.rank === 2
                        ? 'bg-muted-l text-ink'
                        : item.rank === 3
                        ? 'bg-[#A86F3C] text-ink'
                        : 'text-muted-l'
                    }`}
                  >
                    {item.rank}
                  </div>
                  <div>
                    <div className="text-xs text-white">
                      {item.society}
                      {isUser && <span className="text-green ml-1 font-bold">(You)</span>}
                    </div>
                    <div className="text-[10px] text-muted-l font-mono">
                      {item.householdCode} · {item.streak}-day streak
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono font-semibold text-xs tabular-nums text-white flex items-center gap-1">
                  <LeafGlyph size={12} color="#19A85B" />
                  <span>{item.credits}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
