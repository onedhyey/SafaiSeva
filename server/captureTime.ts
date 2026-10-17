// How much to trust the client's claimed capture time (audit F7).
//
// The collection date, the collection window and the one-per-day rule all key off the
// capture time. A queued offline capture legitimately arrives late, so the client's time
// is honoured — but only within a bounded delay. Anything older, or meaningfully in the
// future, falls back to server time and carries a signal that routes the submission to a
// human instead of paying automatically.

export const MAX_OFFLINE_DELAY_MS = 6 * 3600_000;
export const MAX_CLOCK_SKEW_MS = 2 * 60_000;

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
  if (ageMs > MAX_OFFLINE_DELAY_MS) return { effectiveAt: serverIso, signals: ['stale_capture'] };
  return { effectiveAt: new Date(t).toISOString(), signals: [] };
}
