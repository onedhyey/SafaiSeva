// How much to trust the client's claimed capture time (audit F7).
//
// The collection date, the collection window and the one-per-day rule all key off the
// capture time. A queued offline capture legitimately arrives late, so the client's time
// is honoured automatically within 6 h. Between 6 h and 48 h it is still used (so the right
// day and window are judged) but flagged stale_capture, which sends the submission to a
// human instead of auto-paying. Older, or meaningfully in the future: server time + signal.

export const MAX_OFFLINE_DELAY_MS = 6 * 3600_000;
export const MAX_CLOCK_SKEW_MS = 2 * 60_000;
// Older than this is not believable as an offline delay at all.
export const MAX_STALE_MS = 48 * 3600_000;

export interface CaptureTime {
  effectiveAt: string; // ISO
  signals: string[]; // 'stale_capture' | 'clock_skew'
}

export function resolveCaptureTime(clientIso: unknown, now: Date = new Date()): CaptureTime {
  const serverIso = now.toISOString();
  if (typeof clientIso !== 'string' || !clientIso) return { effectiveAt: serverIso, signals: [] };

  const t = Date.parse(clientIso);
  if (!Number.isFinite(t)) return { effectiveAt: serverIso, signals: [] };

  const ageMs = now.getTime() - t;
  if (ageMs < -MAX_CLOCK_SKEW_MS) return { effectiveAt: serverIso, signals: ['clock_skew'] };
  // Late, but plausibly an offline capture: keep its own time so the collection date and
  // window are judged for when it was taken (server time would hard-block a legitimate
  // morning capture synced in the afternoon), and send it to a human instead of auto-paying.
  if (ageMs > MAX_STALE_MS) return { effectiveAt: serverIso, signals: ['stale_capture'] };
  if (ageMs > MAX_OFFLINE_DELAY_MS) return { effectiveAt: new Date(t).toISOString(), signals: ['stale_capture'] };
  return { effectiveAt: new Date(t).toISOString(), signals: [] };
}
