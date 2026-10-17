// API-level test harness: the real Express server (server.ts, spawned with tsx) against a
// real Postgres through PostgREST — the same HTTP surface supabase-js talks to in
// production. Supabase Storage and the Gemini endpoint are replaced by small in-memory
// fakes behind one local proxy:
//
//   supabase-js ──► proxy /rest/v1/*      ──► PostgREST ──► fresh test database
//                   proxy /storage/v1/*   ──► in-memory object store
//   gemini SDK  ──► proxy /gemini/*       ──► canned evidence (setVision)
//
// Needs a PostgREST binary: POSTGREST_BIN, or `postgrest` on PATH. Without one the API
// suite reports SKIP and exits 0 (the SQL suites still cover the decision logic).

import { spawn, execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb } from '../db/harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
export function jwt(payload) {
  const head = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url({ iss: 'supabase', iat: Math.floor(Date.now() / 1000), ...payload });
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function postgrestBin() {
  if (process.env.POSTGREST_BIN) return process.env.POSTGREST_BIN;
  try {
    execFileSync('postgrest', ['--version'], { stdio: 'ignore' });
    return 'postgrest';
  } catch {
    return null;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

async function waitFor(url, ms = 60_000) {
  const until = Date.now() + ms;
  let last;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = e.message;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${url}: ${last}`);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// --- the fake vision model ---------------------------------------------------------
export const CLEAN_EVIDENCE = {
  wastePresent: true,
  scene: 'waste_bins',
  streams: {
    wet: { visible: true, contamination: 'none', note: 'peels in green bin' },
    dry: { visible: true, contamination: 'none', note: 'paper and bottles' },
    sanitary: { visible: false, contamination: 'unknown', note: 'Not visible / not present' },
    special_care: { visible: false, contamination: 'unknown', note: 'Not visible / not present' },
  },
  recaptureLikelihood: 0.02,
  recaptureReasons: [],
  imageQuality: 'good',
  tamperSignals: [],
  overallConfidence: 0.95,
  observation: 'Two bins, wet and dry, clearly separated.',
};

/**
 * Boot database + PostgREST + proxy + API server. Returns helpers and a stop().
 * `env` overrides the API server's environment (e.g. NODE_ENV, ALLOW_DEMO_IDENTITY).
 */
export async function startStack({ env = {} } = {}) {
  const bin = postgrestBin();
  if (!bin) return null;

  const db = await freshDb({ seed: true });
  // Supabase grants these to service_role on every project; the shim does not.
  await db.query(`
    grant usage on schema public, app to service_role, anon, authenticated;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant execute on all functions in schema public to service_role;
    grant execute on all functions in schema app to service_role;
  `);
  // Tests run at any hour; open the collection window so time of day doesn't decide them.
  await db.query(`update public.households set collection_start_hour = 0, collection_end_hour = 24`);

  const children = [];
  const stopAll = async () => {
    for (const c of children) c.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
    await db.drop();
  };

  try {
    // PostgREST
    const pgrstPort = await freePort();
    const cfg = db.config;
    const dbUri = cfg.connectionString
      ? cfg.connectionString
      : `postgres://${cfg.user}@/${cfg.database}?host=${encodeURIComponent(cfg.host)}&port=${cfg.port}`;
    const pgrst = spawn(bin, [], {
      env: {
        ...process.env,
        PGRST_DB_URI: dbUri,
        PGRST_DB_SCHEMAS: 'public',
        PGRST_DB_ANON_ROLE: 'anon',
        PGRST_JWT_SECRET: JWT_SECRET,
        PGRST_SERVER_PORT: String(pgrstPort),
        PGRST_SERVER_HOST: '127.0.0.1',
        PGRST_DB_POOL: '20',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    children.push(pgrst);
    let pgrstErr = '';
    pgrst.stderr.on('data', (d) => (pgrstErr += d));
    await waitFor(`http://127.0.0.1:${pgrstPort}/`).catch((e) => {
      throw new Error(`${e.message}\n${pgrstErr}`);
    });

    // proxy + fakes
    const objects = new Map(); // key -> { buf, type }
    let vision = CLEAN_EVIDENCE;
    const proxyPort = await freePort();
    const proxy = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      const body = await readBody(req);
      try {
        if (url.pathname.startsWith('/rest/v1/')) {
          const target = `http://127.0.0.1:${pgrstPort}${url.pathname.slice('/rest/v1'.length)}${url.search}`;
          const headers = { ...req.headers };
          delete headers.host;
          delete headers['content-length'];
          const r = await fetch(target, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
          });
          const out = Buffer.from(await r.arrayBuffer());
          const h = {};
          r.headers.forEach((v, k) => {
            if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k)) h[k] = v;
          });
          res.writeHead(r.status, h);
          return res.end(out);
        }
        const sign = url.pathname.match(/^\/storage\/v1\/object\/upload\/sign\/evidence\/(.+)$/);
        if (sign && req.method === 'POST') {
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ url: `/object/upload/sign/evidence/${sign[1]}?token=t-${Date.now()}` }));
        }
        if (sign && req.method === 'PUT') {
          objects.set(decodeURIComponent(sign[1]), { buf: body, type: req.headers['content-type'] || 'image/jpeg' });
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ Key: `evidence/${sign[1]}` }));
        }
        if (url.pathname === '/storage/v1/object/evidence' && req.method === 'DELETE') {
          const { prefixes = [] } = JSON.parse(body.toString() || '{}');
          const removed = prefixes.filter((k) => objects.delete(k)).map((name) => ({ name }));
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify(removed));
        }
        const obj = url.pathname.match(/^\/storage\/v1\/object\/evidence\/(.+)$/);
        if (obj && req.method === 'GET') {
          const o = objects.get(decodeURIComponent(obj[1]));
          if (!o) {
            res.writeHead(404, { 'content-type': 'application/json' });
            return res.end(JSON.stringify({ error: 'not found' }));
          }
          res.writeHead(200, { 'content-type': o.type });
          return res.end(o.buf);
        }
        if (obj && (req.method === 'POST' || req.method === 'PUT')) {
          objects.set(decodeURIComponent(obj[1]), { buf: body, type: req.headers['content-type'] || 'image/jpeg' });
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ Key: `evidence/${obj[1]}` }));
        }
        if (url.pathname.startsWith('/gemini/') && url.pathname.includes(':generateContent')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(
            JSON.stringify({
              candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(vision) }] }, finishReason: 'STOP' }],
            })
          );
        }
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: `fake: no route for ${req.method} ${url.pathname}` }));
      } catch (e) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(e?.message ?? e) }));
      }
    });
    await new Promise((r) => proxy.listen(proxyPort, '127.0.0.1', r));
    children.push({ kill: () => proxy.close() });
    const proxyUrl = `http://127.0.0.1:${proxyPort}`;

    // API server
    const apiPort = await freePort();
    const api = spawn(path.join(root, 'node_modules', '.bin', 'tsx'), ['server.ts'], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        PORT: String(apiPort),
        NODE_ENV: 'development',
        DISABLE_HMR: 'true',
        SUPABASE_URL: proxyUrl,
        SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role' }),
        SUPABASE_ANON_KEY: jwt({ role: 'anon' }),
        GEMINI_API_KEY: 'fake-key',
        GEMINI_BASE_URL: `${proxyUrl}/gemini`,
        GEMINI_MODEL: 'fake-model',
        QR_SIGNING_SECRET: 'test-qr-secret',
        VITE_AUTH_ENABLED: 'false',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.unshift(api);
    let apiLog = '';
    api.stdout.on('data', (d) => (apiLog += d));
    api.stderr.on('data', (d) => (apiLog += d));
    const base = `http://127.0.0.1:${apiPort}`;
    await waitFor(`${base}/api/health`).catch((e) => {
      throw new Error(`${e.message}\n${apiLog}`);
    });

    async function call(method, p, { device, worker, officer, body } = {}) {
      const headers = { 'content-type': 'application/json' };
      if (device) headers['x-device-id'] = device;
      if (worker) headers['x-demo-worker'] = worker;
      if (officer) headers['x-demo-officer'] = officer;
      const r = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const text = await r.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* not json */
      }
      return { status: r.status, body: json, text };
    }

    // Capture + upload + verify, as the client does it.
    async function submitPhoto(device, jpeg, extra = {}, { consent = true } = {}) {
      if (consent) {
        const me = await call('GET', '/api/me', { device });
        if (me.body?.consentRequired) {
          await call('POST', '/api/me/consent', { device, body: { version: me.body.consentVersion } });
        }
      }
      const signed = await call('POST', '/api/uploads/sign', {
        device,
        body: { kind: 'photo', contentType: 'image/jpeg' },
      });
      if (signed.status !== 200) return signed;
      const put = await fetch(signed.body.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: jpeg,
      });
      if (!put.ok) throw new Error(`fake upload failed: ${put.status}`);
      return call('POST', '/api/handovers/verify', {
        device,
        body: {
          declaredStreams: ['wet', 'dry'],
          attempt: 1,
          photoKey: signed.body.key,
          clientCapturedAt: new Date().toISOString(),
          idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
          ...extra,
        },
      });
    }

    return {
      db,
      base,
      objects,
      call,
      submitPhoto,
      setVision: (v) => (vision = v),
      log: () => apiLog,
      stop: stopAll,
    };
  } catch (e) {
    await stopAll();
    throw e;
  }
}

/** A small random-noise JPEG: distinct bytes and a distinct perceptual hash per call. */
export async function noiseJpeg() {
  const sharp = (await import('sharp')).default;
  const w = 64;
  const h = 64;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
}
