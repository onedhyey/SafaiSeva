import React, { useState } from 'react';
import { ChevronLeft, RefreshCw, Trash2, CloudOff, Clock, AlertTriangle, UploadCloud } from 'lucide-react';
import { QueuedCapture } from '../../lib/offlineQueue';

interface OutboxViewProps {
  items: QueuedCapture[];
  online: boolean;
  onBack: () => void;
  onRetryAll: () => Promise<void>;
  onRetryOne: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const STREAM_LABEL: Record<string, string> = {
  wet: 'Wet',
  dry: 'Dry',
  sanitary: 'Sanitary',
  special_care: 'Special care',
};

function relTime(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export const OutboxView: React.FC<OutboxViewProps> = ({
  items,
  online,
  onBack,
  onRetryAll,
  onRetryOne,
  onDelete,
}) => {
  const [busy, setBusy] = useState<string | null>(null); // item id or '__all__'

  const wrap = (key: string, fn: () => Promise<void>) => async () => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const failedCount = items.filter((i) => i.status === 'failed').length;

  return (
    <div className="space-y-4 pb-24 pt-2 text-left">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <button
          onClick={onBack}
          className="p-1.5 -ml-1.5 rounded-md text-muted-l hover:text-tint hover:bg-ink-soft transition-colors"
          aria-label="Back to wallet"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-tint">Outbox</h1>
          <p className="text-[11px] text-muted-l">
            {items.length === 0
              ? 'Nothing waiting to send'
              : `${items.length} handover${items.length === 1 ? '' : 's'} waiting to upload`}
          </p>
        </div>
        {items.length > 0 && (
          <button
            onClick={wrap('__all__', onRetryAll)}
            disabled={!online || busy !== null}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-green/15 text-green border border-green/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={busy === '__all__' ? 'animate-spin' : ''} />
            <span>Retry all</span>
          </button>
        )}
      </div>

      {/* Connectivity strip */}
      <div
        className={`flex items-start gap-2 rounded-md px-3 py-2 text-[11px] border ${
          online
            ? 'bg-ink-soft border-muted/25 text-muted-l'
            : 'bg-amber/10 border-amber/30 text-amber'
        }`}
      >
        {online ? <UploadCloud size={13} className="mt-px shrink-0" /> : <CloudOff size={13} className="mt-px shrink-0" />}
        <span>
          {online
            ? 'You’re online. Queued handovers upload automatically; use Retry if one is stuck.'
            : 'You’re offline. Handovers you document are saved here and sent the moment you reconnect.'}
        </span>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-14 text-muted-l">
          <div className="mx-auto w-11 h-11 rounded-xl bg-ink-soft border border-muted/25 flex items-center justify-center mb-3">
            <UploadCloud size={18} />
          </div>
          <p className="text-xs">All caught up — no handovers pending upload.</p>
        </div>
      )}

      {/* Queue */}
      <div className="space-y-2.5">
        {items.map((item) => {
          const failed = item.status === 'failed';
          const rowBusy = busy === item.id;
          return (
            <div
              key={item.id}
              className={`bg-ink-soft border rounded-lg p-3.5 space-y-2.5 ${
                failed ? 'border-red/35' : 'border-muted/25'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-tint flex items-center gap-1.5">
                    {failed ? (
                      <AlertTriangle size={13} className="text-red shrink-0" />
                    ) : (
                      <Clock size={13} className="text-amber shrink-0" />
                    )}
                    <span>{item.attempt === 2 ? 'Video re-check' : 'Handover'}</span>
                  </div>
                  <div className="text-[10px] font-mono text-muted-l mt-0.5">
                    captured {relTime(item.clientCapturedAt)} ·{' '}
                    {new Date(item.clientCapturedAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <span
                  className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-xs ${
                    failed ? 'bg-red/15 text-red' : 'bg-amber/15 text-amber'
                  }`}
                >
                  {failed ? 'Failed' : 'Queued'}
                </span>
              </div>

              {/* Declared streams */}
              <div className="flex flex-wrap gap-1">
                {item.declaredStreams.map((s) => (
                  <span
                    key={s}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-xs bg-ink border border-muted/20 text-muted-l"
                  >
                    {STREAM_LABEL[s] ?? s}
                  </span>
                ))}
              </div>

              {failed && item.lastError && (
                <div className="text-[10px] text-red/90 bg-red/5 border border-red/20 rounded-xs px-2 py-1 leading-relaxed">
                  {item.lastError}
                </div>
              )}

              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[10px] font-mono text-muted">
                  {item.attempts === 0
                    ? 'not tried yet'
                    : `${item.attempts} attempt${item.attempts === 1 ? '' : 's'}`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={wrap(item.id, () => onRetryOne(item.id))}
                    disabled={!online || busy !== null}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-xs bg-ink border border-muted/30 text-tint disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={11} className={rowBusy ? 'animate-spin' : ''} />
                    <span>Retry</span>
                  </button>
                  <button
                    onClick={wrap(item.id, () => onDelete(item.id))}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-xs bg-ink border border-muted/30 text-muted-l hover:text-red disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={11} />
                    <span>Discard</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {failedCount > 0 && online && (
        <p className="text-[10px] text-muted-l px-1 leading-relaxed">
          A failed handover stays here until it sends or you discard it. Discarding does not
          affect any handover the server already accepted.
        </p>
      )}
    </div>
  );
};
