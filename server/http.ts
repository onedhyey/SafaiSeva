// Cross-cutting HTTP middleware: security headers and structured request logs.

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Conservative headers that cannot break the app. A Content-Security-Policy is deliberately
// not set yet: Clerk, map tiles and the geocoder load from third-party origins and need an
// allow-list verified in a browser first (tracked in docs/OPERATIONS.md).
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
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
