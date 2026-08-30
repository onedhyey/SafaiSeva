import React, { useState } from 'react';
import { HouseholdProfile, TicketRecord, TransitType } from '../../types';
import { LeafGlyph } from '../LeafGlyph';
import { Bus, Train, Ticket, ChevronRight, AlertCircle } from 'lucide-react';
import { redeemTicket } from '../../lib/api';
import { serverTicketToRecord } from '../../lib/serverMap';

interface RewardsViewProps {
  household: HouseholdProfile;
  tickets: TicketRecord[];
  /** Server-authoritative leaf cost per transit type. */
  redeemCosts: Record<string, number>;
  onOpenTicketModal: (ticket: TicketRecord) => void;
  onRefreshData: () => Promise<void>;
}

const CATALOG: {
  type: TransitType;
  title: string;
  route: string;
  icon: React.ElementType;
  description: string;
}[] = [
  {
    type: 'janmarg_brts',
    title: 'Janmarg BRTS Single Ride',
    route: 'Any Janmarg BRTS corridor, Ahmedabad',
    icon: Bus,
    description: 'One journey on any Janmarg BRTS corridor.',
  },
  {
    type: 'ahmedabad_metro',
    title: 'Metro Single Ride',
    route: 'GMRC Ahmedabad Metro network',
    icon: Train,
    description: 'Single transit token for the Ahmedabad Metro.',
  },
  {
    type: 'janmarg_day_pass',
    title: 'Janmarg Day Pass',
    route: 'All Janmarg BRTS corridors (24h)',
    icon: Ticket,
    description: 'Unlimited 24-hour travel on all Janmarg BRTS buses.',
  },
];

export const RewardsView: React.FC<RewardsViewProps> = ({
  household,
  tickets,
  redeemCosts,
  onOpenTicketModal,
  onRefreshData,
}) => {
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rewardOptions = CATALOG.map((c) => ({ ...c, cost: redeemCosts[c.type] ?? 0 })).filter(
    (c) => c.cost > 0
  );

  const handleRedeem = async (opt: (typeof rewardOptions)[0]) => {
    setErrorMessage(null);
    if (household.balance < opt.cost) {
      setErrorMessage(
        `Not enough leaves. You have ${household.balance}; this ticket costs ${opt.cost}.`
      );
      return;
    }
    setRedeeming(opt.type);
    try {
      const res = await redeemTicket(opt.type);
      await onRefreshData();
      onOpenTicketModal(serverTicketToRecord(res.ticket));
    } catch (e: any) {
      setErrorMessage(e.message || 'Could not redeem. Try again.');
    } finally {
      setRedeeming(null);
    }
  };

  const activeTickets = tickets.filter((t) => t.status === 'active');
  const pastTickets = tickets.filter((t) => t.status !== 'active');

  return (
    <div className="space-y-5 pb-20 pt-1 text-left select-none">
      {/* Header & Balance Bar */}
      <div className="bg-ink-soft border border-muted/30 rounded-lg p-4 text-tint flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-l">
            Available Balance
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <LeafGlyph size={22} color="#19A85B" />
            <span className="font-mono text-2xl font-bold text-white tabular-nums">
              {household.balance}
            </span>
            <span className="text-xs text-muted-l">leaves</span>
          </div>
        </div>
        <div className="text-right text-xs text-muted-l font-mono">
          <div>AMC Civic Economy</div>
          <div className="text-tint font-semibold">
            {redeemCosts.janmarg_brts ?? 20} leaves = 1 free ride
          </div>
        </div>
      </div>

      {/* Error Message if insufficient balance */}
      {errorMessage && (
        <div className="bg-red/10 border border-red/30 rounded-md p-3 text-xs text-tint flex items-start gap-2">
          <AlertCircle size={15} className="text-red shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Reward Options */}
      <div className="space-y-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-l px-1">
          Redeem Public Transit Tokens
        </h2>

        <div className="space-y-2.5">
          {rewardOptions.map((opt) => {
            const canAfford = household.balance >= opt.cost;
            const Icon = opt.icon;
            const isRedeemingThis = redeeming === opt.type;

            return (
              <div
                key={opt.type}
                className="bg-ink-soft border border-muted/20 rounded-lg p-4 text-tint space-y-3 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-sm bg-ink border border-muted/30 flex items-center justify-center text-tint shrink-0 mt-0.5">
                      <Icon size={16} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white">{opt.title}</h3>
                      <p className="text-[11px] text-muted-l font-medium">{opt.route}</p>
                      <p className="text-[11px] text-muted-l leading-relaxed mt-1">
                        {opt.description}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="inline-flex items-center gap-1 font-mono text-sm font-bold text-white">
                      <LeafGlyph size={14} color="#19A85B" />
                      <span>{opt.cost}</span>
                    </div>
                    <div className="text-[10px] text-muted-l">credits</div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-muted/15 flex items-center justify-between">
                  <span className="text-[11px] text-muted-l">
                    {canAfford
                      ? 'Available to claim immediately'
                      : `${opt.cost - household.balance} more leaves required`}
                  </span>

                  <button
                    onClick={() => handleRedeem(opt)}
                    disabled={!canAfford || isRedeemingThis}
                    className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                      canAfford
                        ? 'bg-green hover:bg-[#16934f] text-ink cursor-pointer'
                        : 'bg-ink border border-muted/30 text-muted cursor-not-allowed'
                    }`}
                  >
                    {isRedeemingThis ? (
                      <span>Issuing Ticket...</span>
                    ) : (
                      <>
                        <span>Redeem Ticket</span>
                        <ChevronRight size={13} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* My Tickets Section */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-l px-1">
          My Transit Tickets
        </h2>

        {/* Active Tickets */}
        {activeTickets.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-mono text-green px-1">Active for Boarding</div>
            {activeTickets.map((t) => (
              <div
                key={t.id}
                onClick={() => onOpenTicketModal(t)}
                className="bg-ink-soft border border-green/40 hover:border-green rounded-md p-3 flex items-center justify-between text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-sm bg-green/10 border border-green/30 text-green flex items-center justify-center">
                    <Ticket size={15} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{t.title}</div>
                    <div className="text-[11px] text-muted-l font-mono">{t.id}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-green bg-green/10 px-2 py-0.5 rounded-xs border border-green/30">
                    Show QR
                  </span>
                  <ChevronRight size={14} className="text-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Past Tickets */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono text-muted-l px-1">Past Redemptions</div>
          {pastTickets.map((t) => (
            <div
              key={t.id}
              onClick={() => onOpenTicketModal(t)}
              className="bg-ink-soft/60 border border-muted/15 rounded-md p-2.5 flex items-center justify-between text-left cursor-pointer text-muted-l hover:text-white"
            >
              <div>
                <div className="text-xs font-medium text-tint">{t.title}</div>
                <div className="text-[10px] text-muted font-mono">{t.id} · Used</div>
              </div>
              <div className="text-right font-mono text-xs text-muted">
                {new Date(t.redeemedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
