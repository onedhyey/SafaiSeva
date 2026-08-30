// HMAC-signed transit ticket tokens (audit I6). A real fare gate can't be integrated
// without an AJL / GMRC partnership (G2), but the token is at least verifiable and
// tamper-evident on our side, and carries an expiry.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.ts';

const PREFIX = 'SAFAISEVA1';
const SECRET = env.qrSigningSecret || 'safaiseva-dev-qr-secret-change-me';

if (!env.qrSigningSecret) {
  console.warn('[qr] QR_SIGNING_SECRET not set — using an insecure dev secret.');
}

export interface TicketClaims {
  tid: string; // ticket id
  hh: string; // household id
  type: string; // transit type
  exp: number; // unix seconds
}

export function signTicket(claims: TicketClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${PREFIX}.${body}.${sig}`;
}

export function verifyTicket(token: string): TicketClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const expected = createHmac('sha256', SECRET).update(parts[1]).digest('base64url');
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
