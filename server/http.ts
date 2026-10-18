// Cross-cutting HTTP middleware: security headers and structured request logs.

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Content-Security-Policy, REPORT-ONLY for now: it cannot block anything, it only reports
// to /api/csp-report what an enforcing policy would have blocked. Origins come from the
// client code (OSM tiles, Nominatim, Supabase Storage uploads) plus Clerk's hosted
// frontend API and its Cloudflare Turnstile bot check. Enforce it once a week of
// production reports is clean (docs/OPERATIONS.md).
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://img.clerk.com",
  "font-src 'self'",
  "media-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co https://nominatim.openstreetmap.org https://*.clerk.accounts.dev https://*.clerk.com",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'report-uri /api/csp-report',
].join('; ');

// Conservative headers that cannot break the app.
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Content-Security-Policy-Report-Only', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Camera + location + microphone (video sweep) for this origin only; nothing else.
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), geolocation=(self), microphone=(self), payment=(), usb=(), interest-cohort=()'
  );
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

// One JSON line per API request: method, route, status, latency, request id. No bodies,
// headers, tokens or query strings — those can carry personal data.
export function requestLog(req: Request, res: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  const id = (req.header('x-request-id') || '').slice(0, 64) || randomUUID();
  res.setHeader('X-Request-Id', id);
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        id,
        method: req.method,
        path: req.baseUrl + (req.route?.path ?? req.path),
        status: res.statusCode,
        ms: Math.round(ms),
      })
    );
  });
  next();
}

// Receives CSP violation reports (browsers POST application/csp-report JSON). Logged as one
// JSON line each — only the directive and the blocked origin, never full URLs or bodies.
export function cspReport(req: Request, res: Response) {
  const r = (req.body && (req.body['csp-report'] || req.body)) || {};
  const origin = (() => {
    try {
      return new URL(String(r['blocked-uri'] || '')).origin;
    } catch {
      return String(r['blocked-uri'] || '').slice(0, 40);
    }
  })();
  console.log(JSON.stringify({ event: 'csp_violation', directive: r['violated-directive'] || r['effective-directive'], blocked: origin }));
  res.status(204).end();
}
