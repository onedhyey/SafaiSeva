// HMAC-signed transit ticket tokens (audit I6). A real fare gate can't be integrated
// without an AJL / GMRC partnership (G2), but the token is at least verifiable and
// tamper-evident on our side, and carries an expiry.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.ts';

const PREFIX = 'SAFAISEVA1';
const DEV_SECRET = 'safaiseva-dev-qr-secret-change-me';

// Outside local development a missing secret is a configuration error, not something to
// paper over with a public default (anyone could then forge tickets) — audit F18.
function secret(): string {
  if (env.qrSigningSecret) return env.qrSigningSecret;
  if (env.nodeEnv === 'development') return DEV_SECRET;
  const e: any = new Error('Ticket signing is not configured on this server.');
  e.status = 503;
  throw e;
}

if (!env.qrSigningSecret && env.nodeEnv === 'development') {
  console.warn('[qr] QR_SIGNING_SECRET not set — using an insecure dev secret.');
}

export interface TicketClaims {
  tid: string; // ticket id
  hh: string; // household id
  type: string; // transit type
  exp: number; // unix seconds
}

/** Throws (503) when tickets cannot be signed — call before spending credits. */
export function assertTicketSigningReady(): void {
  secret();
}

export function signTicket(claims: TicketClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${PREFIX}.${body}.${sig}`;
}

export function verifyTicket(token: string): TicketClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const expected = createHmac('sha256', secret()).update(parts[1]).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as TicketClaims;
    if (claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
