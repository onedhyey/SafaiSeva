// Guarded auth-ON smoke test. Boots a throwaway server instance with
// VITE_AUTH_ENABLED=true on its own port and asserts the enforcement layer is live:
//   - /api/health reports authEnabled:true
//   - authenticated routes reject a missing / bogus bearer token with 401
// The demo server on :3000 and .env are untouched. The happy path (a real Clerk
// session token -> user provisioned -> household create/join) needs a browser and is
// a manual step in docs/AUTH.md.
//
//   node scripts/auth-smoke.mjs

import { spawn } from 'node:child_process';

const PORT = 3011;
const BASE = `http://localhost:${PORT}`;
let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function waitForHealth(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return r.json();
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error('server did not come up');
}

// Run the built bundle in production mode: fast boot, no Vite dev middleware, and no
// clash with the HMR port of a demo server that may be running on :3000.
import { existsSync } from 'node:fs';
if (!existsSync('dist/server.cjs')) {
  console.error('dist/server.cjs not found — run `npm run build` first.');
  process.exit(1);
}
const child = spawn('node', ['dist/server.cjs'], {
  env: { ...process.env, PORT: String(PORT), VITE_AUTH_ENABLED: 'true', NODE_ENV: 'production' },
  stdio: ['ignore', 'ignore', 'inherit'],
});

let exitCode = 1;
try {
  const health = await waitForHealth();
  check('health reports authEnabled:true', health.authEnabled === true, JSON.stringify(health));

  const noAuth = await fetch(`${BASE}/api/wallet`);
  check('GET /api/wallet without a token -> 401', noAuth.status === 401, `got ${noAuth.status}`);

  const badAuth = await fetch(`${BASE}/api/wallet`, {
    headers: { Authorization: 'Bearer not.a.real.token' },
  });
  check('GET /api/wallet with a bogus token -> 401', badAuth.status === 401, `got ${badAuth.status}`);

  const create = await fetch(`${BASE}/api/household/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  check('POST /api/household/create without a token -> 401', create.status === 401, `got ${create.status}`);

  const worker = await fetch(`${BASE}/api/review-queue`);
  check(
    'GET /api/review-queue without a token -> 401/403',
    worker.status === 401 || worker.status === 403,
    `got ${worker.status}`
  );

  console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILED`}  (${pass} passed)`);
  exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.error('smoke error:', e.message);
  exitCode = 1;
} finally {
  child.kill('SIGKILL');
}
process.exit(exitCode);
