// The Express app without a listener or static serving — shared by the long-running dev /
// container server (server.ts) and the Vercel Function (server/vercel.ts).

import express, { type Express, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env, supabaseConfigured, geminiConfigured } from './env.ts';
import { mountApiRoutes } from './routes.ts';
import { currentIdentityMode } from './principal.ts';
import { securityHeaders, requestLog, cspReport } from './http.ts';
import { cspReportLimiter } from './rateLimit.ts';
import { runDaily } from './jobs.ts';

function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.header('authorization') || '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Behind a load balancer / platform proxy set TRUST_PROXY to its hop count (usually 1) so
  // req.ip and req.secure reflect the client. Off by default: trusting a header nobody
  // strips lets any caller spoof its IP.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.use(securityHeaders);
  app.use('/api', requestLog);

  // Evidence photos/videos are uploaded straight to Storage via a signed URL (audit B2);
  // the JSON body only carries object keys + small derived video keyframes, so a tight
  // limit is both safe and a DoS backstop on the unauthenticated surface.
  app.use(express.json({ limit: '2mb' }));
  app.post(
    '/api/csp-report',
    cspReportLimiter,
    express.json({ type: ['application/csp-report', 'application/reports+json'], limit: '16kb' }),
    cspReport
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      model: env.geminiModel,
      geminiConfigured: geminiConfigured(),
      supabaseConfigured: supabaseConfigured(),
      authEnabled: env.authEnabled,
      identityMode: currentIdentityMode(),
    });
  });

  // Scheduled jobs (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
  app.get('/api/cron/daily', async (req: Request, res: Response) => {
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
    const result = await runDaily();
    console.log(JSON.stringify({ event: 'cron_daily', result }));
    res.json(result);
  });

  // SafaiSeva API — all verification / credit logic is server-authoritative (audit C2).
  mountApiRoutes(app);

  return app;
}
