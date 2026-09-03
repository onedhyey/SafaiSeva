// API abuse protection (Tier 1, item 3). A per-identity request cap in front of the
// expensive and state-changing routes. The existing fraud.ts checks only bound *credit
// outcomes* per household, and only *after* the Gemini call + DB writes — so on their own
// a script can still run up the model bill and hammer the ledger. This is the missing
// front-door cap: reject the flood before any of that work starts.
//
// Keyed by caller identity, not IP: mobile PWA clients sit behind carrier NAT (one IP can
// be a whole city) and an abuser rotates cheap IPs for free. IP is only the last-resort
// fallback for header-less traffic (which 400/401s downstream anyway).
//
// Store is the library default (in-memory): counters are per-process and reset on server
// restart. Fine for a single-instance pilot; swap in a shared store (Redis) if this is
// ever run horizontally.

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from './env.ts';

// Decode — NOT verify — the `sub` from a Clerk bearer so the bucket key stays stable
// across the ~60s session-token rotation (keying by the raw token would hand every user a
// fresh bucket each minute). Safety: this value is only a bucket label. Every route still
// runs the real verifyToken() inside resolvePrincipal, so a forged `sub` merely picks
// which 429 bucket a request that is already doomed to 401 lands in.
function clerkSubUnverified(req: Request): string | null {
  const auth = req.header('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const parts = auth.slice(7).trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const sub = payload?.sub;
    return typeof sub === 'string' && sub.length ? sub : null;
  } catch {
    return null;
  }
}

function identityKey(req: Request): string {
  if (env.authEnabled) {
    const sub = clerkSubUnverified(req);
    if (sub) return `clerk:${sub}`;
  } else {
    const dev = (req.header('x-device-id') || '').trim();
    if (dev.length >= 6) return `dev:${dev}`;
  }
  // ipKeyGenerator normalizes IPv6 into a /56 block so one client can't walk its range.
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

function tooMany(_req: Request, res: Response) {
  // Matches the { error } shape of routes.ts `fail()` so the client's apiFetch surfaces it
  // as a normal error message.
  res.status(429).json({
    error: 'Too many requests — slow down and try again in a few minutes.',
  });
}

function limiter(windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: identityKey,
    handler: tooMany,
    standardHeaders: true,
    legacyHeaders: false,
    // We key by identity and never trust X-Forwarded-For, and deliberately don't set
    // `trust proxy` here — so silence the checks that assume an XFF header means broken
    // IP keying.
    validate: { xForwardedForHeader: false, trustProxy: false },
  });
}

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

// POST /api/handovers/verify — the only Gemini-billed route. A real resident does one
// handover/day, up to two attempts; 12/hour is generous headroom for retries.
export const verifyLimiter = limiter(HOUR, 12);

// POST /api/uploads/sign — one call per media object (photo + optional video + keyframe
// per attempt). No model cost but it mints direct-to-Storage upload URLs.
export const signLimiter = limiter(HOUR, 40);

// The other state-changing POSTs: tickets/redeem, household/bins, handovers/:id/dispute,
// household/create, household/join, worker/issue, review-queue/:id/decide. Cheap, but far
// above any human workflow rate (a karmachari clearing a queue makes ~10-20 decisions).
export const mutationLimiter = limiter(15 * MIN, 30);

// GET /api/wallet, GET /api/review-queue — polled by the UI on focus / after actions.
export const readLimiter = limiter(5 * MIN, 120);
