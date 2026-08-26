import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Clock } from 'lucide-react';
import { TicketRecord } from '../types';
import { QRCodeSvg } from './QRCodeSvg';
import { LeafGlyph } from './LeafGlyph';

interface TicketModalProps {
  ticket: TicketRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkUsed?: (ticketId: string) => void;
}

export const TicketModal: React.FC<TicketModalProps> = ({
  ticket,
  isOpen,
  onClose,
  onMarkUsed,
}) => {
  const [timeLeft, setTimeLeft] = useState<string>('04:18:22');

  useEffect(() => {
    if (!ticket) return;
    const calculateTime = () => {
      const now = new Date().getTime();
      const exp = new Date(ticket.expiresAt).getTime();
      const diff = Math.max(0, exp - now);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(
        `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [ticket]);

  if (!isOpen || !ticket) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700/80 rounded-xl p-5 text-left text-zinc-200 relative shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors"
          aria-label="Close ticket"
        >
          <X size={18} />
        </button>

        {/* Transit Header */}
        <div className="text-left mb-3">
          <div className="inline-flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-500/30 px-2.5 py-1 rounded-md text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
            {ticket.transitType === 'janmarg_brts' && 'Janmarg BRTS'}
            {ticket.transitType === 'ahmedabad_metro' && 'Ahmedabad Metro'}
            {ticket.transitType === 'janmarg_day_pass' && 'BRTS Day Pass'}
          </div>
          <h3 className="text-base font-bold text-white mt-2">{ticket.title}</h3>
          <p className="text-xs text-zinc-400 font-medium">{ticket.route}</p>
        </div>

        {/* QR Code Container - Illuminated Optical Surface */}
        <div className="flex flex-col items-center justify-center bg-white p-4 rounded-lg border border-zinc-300 my-3 shadow-inner">
          <QRCodeSvg value={ticket.qrPayload} size={170} />
          <div className="mt-3 font-mono text-xs text-black font-bold tracking-wider">
            {ticket.id}
          </div>
          <div className="text-[11px] text-zinc-600 mt-0.5 font-medium">
            Scan at Janmarg BRTS automated turnstile
          </div>
        </div>

        {/* Details & Validity Timer */}
        <div className="space-y-2 text-xs border-t border-zinc-800 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 flex items-center gap-1">
              <Clock size={13} className="text-emerald-400" />
              Validity remaining
            </span>
            <span className="font-mono font-bold text-emerald-400 text-sm tracking-wide">
              {timeLeft}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Redemption Cost</span>
            <span className="inline-flex items-center gap-1 font-mono font-semibold text-white">
              <LeafGlyph size={13} color="#10b981" />
              <span>{ticket.creditsSpent} credits</span>
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Status</span>
            <span
              className={`font-semibold uppercase tracking-wider text-[10px] font-mono px-2 py-0.5 rounded-sm border ${
                ticket.status === 'active'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400'
              }`}
            >
              {ticket.status}
            </span>
          </div>
        </div>

        {/* Action button */}
        {ticket.status === 'active' && onMarkUsed && (
          <button
            onClick={() => {
              onMarkUsed(ticket.id);
              onClose();
            }}
            className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <CheckCircle size={14} />
            <span>Mark as Scanned / Boarded</span>
          </button>
        )}
      </div>
    </div>
  );
};
