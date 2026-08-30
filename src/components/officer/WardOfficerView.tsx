import React, { useState } from 'react';
import { WardStats, HandoverRecord } from '../../types';
import { LeafGlyph } from '../LeafGlyph';
import {
  ShieldAlert,
  Building2,
  TrendingUp,
  AlertOctagon,
  Users,
  CheckSquare,
  Search,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface WardOfficerViewProps {
  wardStats: WardStats;
  handovers: HandoverRecord[];
}

export const WardOfficerView: React.FC<WardOfficerViewProps> = ({
  wardStats,
  handovers,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'anomalies' | 'audit' | 'districts'>('overview');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredAnomalies = wardStats.anomalies.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.householdId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4 pb-20 pt-1 text-left select-none font-sans">
      {/* Admin Header Console */}
      <div className="bg-ink-soft border border-muted/40 rounded-md p-3.5 text-tint">
        <div className="flex items-center justify-between pb-2 border-b border-muted/20">
          <div>
            <div className="font-mono text-xs font-bold text-white uppercase tracking-wider">
              AMC Solid Waste Directorate — {wardStats.wardName}
            </div>
            <div className="font-mono text-[10px] text-muted-l mt-0.5">
              Supervisory Control & Verification Audit Dashboard
            </div>
          </div>
          <div className="font-mono text-[11px] bg-ink px-2 py-0.5 rounded-xs border border-muted/30 text-tint">
            Live Stream
          </div>
        </div>

        {/* 4 Sober Administrative KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5">
          <div className="bg-ink p-2.5 rounded-xs border border-muted/20">
            <div className="text-[10px] font-mono text-muted-l uppercase">Participation</div>
            <div className="font-mono text-lg font-bold text-white tabular-nums">
              {wardStats.participationRateThisWeek}%
            </div>
            <div className="text-[10px] font-mono text-green flex items-center gap-0.5">
              <TrendingUp size={10} />
              <span>+{(wardStats.participationRateThisWeek - wardStats.participationRateLastWeek).toFixed(1)}% vs prev</span>
            </div>
          </div>

          <div className="bg-ink p-2.5 rounded-xs border border-muted/20">
            <div className="text-[10px] font-mono text-muted-l uppercase">Credits Issued</div>
            <div className="font-mono text-lg font-bold text-white tabular-nums flex items-center gap-1">
              <LeafGlyph size={14} color="#19A85B" />
              <span>{wardStats.creditsIssued.toLocaleString()}</span>
            </div>
            <div className="text-[10px] font-mono text-muted-l">
              ₹{wardStats.rupeeValue.toLocaleString()} AMC Subsidy
            </div>
          </div>

          <div className="bg-ink p-2.5 rounded-xs border border-muted/20">
            <div className="text-[10px] font-mono text-muted-l uppercase">AI Direct Pass</div>
            <div className="font-mono text-lg font-bold text-green tabular-nums">
              {wardStats.aiSplit.approved}%
            </div>
            <div className="text-[10px] font-mono text-muted-l">Zero worker latency</div>
          </div>

          <div className="bg-ink p-2.5 rounded-xs border border-muted/20">
            <div className="text-[10px] font-mono text-muted-l uppercase">Active Anomalies</div>
            <div className="font-mono text-lg font-bold text-amber tabular-nums">
              {wardStats.anomalies.length}
            </div>
            <div className="text-[10px] font-mono text-amber">Spot-checks flagged</div>
          </div>
        </div>
      </div>

      {/* Admin Tab Selector */}
      <div className="flex bg-ink-soft border border-muted/30 rounded-md p-0.5 text-xs font-mono">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-1.5 px-2 text-center rounded-xs transition-colors ${
            activeTab === 'overview'
              ? 'bg-ink text-white font-bold border border-muted/40'
              : 'text-muted-l hover:text-white'
          }`}
        >
          Overview & Split
        </button>
        <button
          onClick={() => setActiveTab('anomalies')}
          className={`flex-1 py-1.5 px-2 text-center rounded-xs transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'anomalies'
              ? 'bg-ink text-white font-bold border border-muted/40'
              : 'text-muted-l hover:text-white'
          }`}
        >
          <span>Anomalies</span>
          <span className="w-1.5 h-1.5 rounded-full bg-amber" />
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex-1 py-1.5 px-2 text-center rounded-xs transition-colors ${
            activeTab === 'audit'
              ? 'bg-ink text-white font-bold border border-muted/40'
              : 'text-muted-l hover:text-white'
          }`}
        >
          Worker Audit
        </button>
        <button
          onClick={() => setActiveTab('districts')}
          className={`flex-1 py-1.5 px-2 text-center rounded-xs transition-colors ${
            activeTab === 'districts'
              ? 'bg-ink text-white font-bold border border-muted/40'
              : 'text-muted-l hover:text-white'
          }`}
        >
          Sub-Districts
        </button>
      </div>

      {/* Tab Content 1: Overview & AI Decision Split */}
      {activeTab === 'overview' && (
        <div className="space-y-3.5">
          {/* AI Decision Split Table */}
          <div className="bg-ink-soft border border-muted/30 rounded-md p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white uppercase font-mono tracking-wide">
                Weekly AI Verification Pipeline Split
              </span>
              <span className="text-[11px] font-mono text-muted-l">3,680 Handover Records</span>
            </div>

            {/* Split Distribution Bar */}
            <div className="w-full h-3 rounded-xs bg-ink flex overflow-hidden border border-muted/30">
              <div
                style={{ width: `${wardStats.aiSplit.approved}%` }}
                className="bg-green h-full"
                title={`Approved ${wardStats.aiSplit.approved}%`}
              />
              <div
                style={{ width: `${wardStats.aiSplit.inReview}%` }}
                className="bg-amber h-full"
                title={`In Review ${wardStats.aiSplit.inReview}%`}
              />
              <div
                style={{ width: `${wardStats.aiSplit.rejected}%` }}
                className="bg-red h-full"
                title={`Rejected ${wardStats.aiSplit.rejected}%`}
              />
            </div>

            {/* Split Detail Row */}
            <div className="grid grid-cols-3 gap-2 pt-1 text-xs font-mono">
              <div className="bg-ink p-2 rounded-xs border border-muted/20">
                <div className="flex items-center gap-1 text-green text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-green" />
                  <span>Approved</span>
                </div>
                <div className="text-sm font-bold text-white mt-0.5 tabular-nums">
                  {wardStats.aiSplit.approved}%
                </div>
                <div className="text-[10px] text-muted-l">Direct auto-credit</div>
              </div>

              <div className="bg-ink p-2 rounded-xs border border-muted/20">
                <div className="flex items-center gap-1 text-amber text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-amber" />
                  <span>In Review</span>
                </div>
                <div className="text-sm font-bold text-white mt-0.5 tabular-nums">
                  {wardStats.aiSplit.inReview}%
                </div>
                <div className="text-[10px] text-muted-l">Worker spot-check</div>
              </div>

              <div className="bg-ink p-2 rounded-xs border border-muted/20">
                <div className="flex items-center gap-1 text-red text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-red" />
                  <span>Rejected</span>
                </div>
                <div className="text-sm font-bold text-white mt-0.5 tabular-nums">
                  {wardStats.aiSplit.rejected}%
                </div>
                <div className="text-[10px] text-muted-l">Contamination flag</div>
              </div>
            </div>
          </div>

          {/* Audit Trail Log Summary */}
          <div className="bg-ink-soft border border-muted/30 rounded-md p-3.5 space-y-2">
            <div className="text-xs font-bold text-white uppercase font-mono tracking-wide">
              Recent Verification Audit Trail
            </div>

            <div className="divide-y divide-muted/15 text-xs font-mono">
              {handovers.slice(0, 5).map((h) => (
                <div key={h.id} className="py-2 flex items-start justify-between gap-3 text-muted-l">
                  <div className="min-w-0">
                    <div className="text-tint font-medium">
                      {h.householdId}
                      <span className="text-muted ml-1.5 text-[10px] font-normal">
                        {new Date(h.timestamp).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted">
                      {h.source === 'manual_worker' ? 'Worker Direct' : 'Edge AI'} · #
                      {String(h.id).replace(/-/g, '').slice(0, 8)}
                    </div>
                  </div>

                  <div className="text-right shrink-0 max-w-[46%]">
                    <div
                      className={`font-semibold uppercase text-[10px] ${
                        h.status === 'verified'
                          ? 'text-green'
                          : h.status === 'in_review'
                          ? 'text-amber'
                          : 'text-red'
                      }`}
                    >
                      {h.status}
                    </div>
                    <div className="text-[9px] text-muted leading-tight">
                      {h.verification.decisionReason}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 2: Anomaly List (Anti-Gaming Spot-Checks) */}
      {activeTab === 'anomalies' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-xs font-bold uppercase tracking-wider text-white font-mono">
              Algorithmic Anomaly Flags
            </div>
            <span className="text-[10px] font-mono text-amber">
              {wardStats.anomalies.length} Flagged Households
            </span>
          </div>

          <div className="space-y-2.5">
            {wardStats.anomalies.map((anom) => (
              <div
                key={anom.householdId}
                className="bg-ink-soft border border-amber/40 rounded-md p-3.5 space-y-2 text-tint"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <AlertOctagon size={14} className="text-amber shrink-0" />
                      <span>{anom.name}</span>
                    </div>
                    <div className="text-[10px] font-mono text-muted-l mt-0.5">
                      {anom.householdId} · {anom.address}
                    </div>
                  </div>

                  <div className="font-mono text-right text-[10px]">
                    <span className="bg-amber/20 text-amber px-1.5 py-0.5 rounded-xs font-bold uppercase">
                      {anom.severity} Priority
                    </span>
                    <div className="text-tint mt-0.5">{anom.approvalRate}% Approval Rate</div>
                  </div>
                </div>

                <div className="bg-ink p-2 rounded-xs border border-muted/20 text-xs text-tint leading-relaxed">
                  <span className="font-mono text-[10px] text-amber uppercase font-semibold block mb-0.5">
                    Flag Rationale:
                  </span>
                  {anom.flagReason}
                </div>

                <div className="pt-1 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-muted-l">30-day History: {anom.totalSubmissions} submissions</span>
                  <button className="bg-ink hover:bg-muted/20 border border-muted/40 text-tint px-2.5 py-1 rounded-xs text-[10px] font-bold">
                    Schedule Physical Spot-Check
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content 3: Karmachari Anti-Fraud Audit Table */}
      {activeTab === 'audit' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-xs font-bold uppercase tracking-wider text-white font-mono">
              Worker Exception Override Audit
            </div>
            <span className="text-[10px] font-mono text-muted-l">Threshold: 40% – 95%</span>
          </div>

          <div className="bg-ink-soft border border-muted/30 rounded-md overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-ink text-muted-l border-b border-muted/30 text-[10px] uppercase">
                <tr>
                  <th className="p-2.5">Karmachari</th>
                  <th className="p-2.5">Route</th>
                  <th className="p-2.5 text-right">Reviews</th>
                  <th className="p-2.5 text-right">Override %</th>
                  <th className="p-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted/20 text-tint">
                {wardStats.karmacharis.map((k) => (
                  <tr
                    key={k.id}
                    className={k.flagged ? 'bg-amber/10' : 'hover:bg-ink/30'}
                  >
                    <td className="p-2.5 font-medium text-white">
                      <div>{k.name}</div>
                      <div className="text-[9px] text-muted">{k.id}</div>
                    </td>
                    <td className="p-2.5 text-muted-l text-[11px]">{k.route}</td>
                    <td className="p-2.5 text-right tabular-nums">{k.reviewsDone}</td>
                    <td className="p-2.5 text-right font-bold tabular-nums">
                      <span className={k.flagged ? 'text-amber' : 'text-tint'}>
                        {k.overrideRate}%
                      </span>
                    </td>
                    <td className="p-2.5 text-right">
                      {k.flagged ? (
                        <span className="inline-block px-1.5 py-0.5 bg-amber/20 text-amber text-[9px] font-bold rounded-xs">
                          FLAGGED
                        </span>
                      ) : (
                        <span className="text-green text-[9px] font-semibold">NORMAL</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-muted-l leading-relaxed px-1">
            Workers with override rates &gt;95% or &lt;40% are automatically flagged to detect rubber-stamping or arbitrary rejection patterns.
          </p>
        </div>
      )}

      {/* Tab Content 4: Sub-Districts Area Breakdown */}
      {activeTab === 'districts' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-xs font-bold uppercase tracking-wider text-white font-mono">
              Navrangpura Sub-District Segregation
            </div>
            <span className="text-[10px] font-mono text-muted-l">5 Micro-Pockets</span>
          </div>

          <div className="space-y-2">
            {wardStats.subDistricts.map((dist) => (
              <div
                key={dist.name}
                className="bg-ink-soft border border-muted/30 rounded-md p-3 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-white">{dist.name}</span>
                    <span className="text-muted-l text-[10px] font-mono ml-2">
                      {dist.households} households
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-tint tabular-nums">
                    {dist.participation}%
                  </span>
                </div>

                <div className="w-full bg-ink h-2 rounded-xs overflow-hidden border border-muted/20">
                  <div
                    className={`h-full rounded-xs ${
                      dist.status === 'optimal'
                        ? 'bg-green'
                        : dist.status === 'attention'
                        ? 'bg-amber'
                        : 'bg-red'
                    }`}
                    style={{ width: `${dist.participation}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-muted-l">
                  <span>Target: 75%</span>
                  <span
                    className={`uppercase font-semibold ${
                      dist.status === 'optimal'
                        ? 'text-green'
                        : dist.status === 'attention'
                        ? 'text-amber'
                        : 'text-red'
                    }`}
                  >
                    {dist.status === 'optimal'
                      ? 'Optimal Coverage'
                      : dist.status === 'attention'
                      ? 'Action Required'
                      : 'Low Segregation'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
