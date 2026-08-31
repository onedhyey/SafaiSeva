// Bind a Clerk user to a seeded `workers` row so they get the Karmachari role when
// auth is ON. Workers are provisioned by an operator, never self-serve.
//
//   node scripts/link-worker.mjs <clerk-email> <worker-code>
//   e.g. node scripts/link-worker.mjs ramesh.vaghela@amc.gov.in AMC-WZ-109
//
// Needs CLERK_SECRET_KEY and SUPABASE_ACCESS_TOKEN in .env.

import { readFileSync } from 'node:fs';
import { createClerkClient } from '@clerk/backend';

const [, , email, workerCode] = process.argv;
if (!email || !workerCode) {
  console.error('usage: node scripts/link-worker.mjs <clerk-email> <worker-code>');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const SECRET = env.CLERK_SECRET_KEY;
const MGMT_TOKEN = env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = env.SUPABASE_PROJECT_REF || 'vtqzyldosmpkxuqqlica';
if (!SECRET) throw new Error('CLERK_SECRET_KEY missing in .env');
if (!MGMT_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN missing in .env');

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t}`);
  return JSON.parse(t);
};
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const clerk = createClerkClient({ secretKey: SECRET });

// 1. Find the Clerk user by email.
const list = await clerk.users.getUserList({ emailAddress: [email] });
const cu = list.data?.[0];
if (!cu) {
  console.error(`No Clerk user found for ${email}. They must sign in once first.`);
  process.exit(1);
}
console.log(`Clerk user: ${cu.id} (${cu.firstName ?? ''} ${cu.lastName ?? ''})`.trim());

// 2. Get-or-create the internal users row keyed by clerk_user_id.
const name = [cu.firstName, cu.lastName].filter(Boolean).join(' ') || email;
const upsert = await sql(`
  insert into public.users (clerk_user_id, display_name)
  values (${lit(cu.id)}, ${lit(name)})
  on conflict (clerk_user_id) do update set display_name = excluded.display_name
  returning id;
`);
const userId = upsert[0].id;
console.log(`Internal users.id: ${userId}`);

// 3. Point the worker row at that user.
const upd = await sql(`
  update public.workers set user_id = ${lit(userId)}
  where worker_code = ${lit(workerCode)}
  returning worker_code, name, active;
`);
if (!upd.length) {
  console.error(`No workers row with worker_code ${workerCode}.`);
  process.exit(1);
}
console.log(`Linked: ${email}  ->  worker ${upd[0].worker_code} (${upd[0].name}), active=${upd[0].active}`);
console.log('Done. With auth ON this user now resolves to the Karmachari role.');
