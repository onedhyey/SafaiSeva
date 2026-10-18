// Shared rate-limit counters (0025): one atomic fixed-window counter per key, closed to the
// client roles, safe under concurrent hits from the same caller.
import { freshDb, test, done, eq, assert } from './harness.mjs';

const db = await freshDb();
const hit = async (key, windowMs = 60_000) =>
  (await db.query(`select hits, reset_at from public.rate_limit_hit($1, $2)`, [key, windowMs])).rows[0];

try {
  await test('hits count up within a window and keep the same reset time', async () => {
    const a = await hit('verify:dev:abc');
    const b = await hit('verify:dev:abc');
    const c = await hit('verify:dev:abc');
    eq([a.hits, b.hits, c.hits], [1, 2, 3], 'running total');
    eq(String(c.reset_at), String(a.reset_at), 'window end does not slide');
    assert(a.reset_at > new Date(), 'reset is in the future');
  });

  await test('keys are independent', async () => {
    eq((await hit('verify:dev:other')).hits, 1, 'new key starts at 1');
    eq((await hit('read:dev:abc')).hits, 1, 'same identity, different limiter prefix');
  });

  await test('an expired window restarts at 1', async () => {
    await hit('sign:dev:exp');
    await hit('sign:dev:exp');
    await db.query(`update public.rate_limit_hits set reset_at = now() - interval '1 second' where key = 'sign:dev:exp'`);
    const r = await hit('sign:dev:exp');
    eq(r.hits, 1, 'restarted');
    assert(r.reset_at > new Date(), 'fresh window end');
  });

  await test('concurrent hits on one key are all counted', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => hit('mutation:dev:burst')));
    eq(results.map((r) => r.hits).sort((x, y) => x - y), Array.from({ length: 20 }, (_, i) => i + 1), 'no lost updates');
  });

  await test('decrement undoes one hit and never goes below zero', async () => {
    await hit('read:dev:dec');
    await hit('read:dev:dec');
    await db.query(`select public.rate_limit_decrement('read:dev:dec')`);
    eq((await db.query(`select hits from public.rate_limit_hits where key = 'read:dev:dec'`)).rows[0].hits, 1, 'decremented');
    for (let i = 0; i < 3; i++) await db.query(`select public.rate_limit_decrement('read:dev:dec')`);
    eq((await db.query(`select hits from public.rate_limit_hits where key = 'read:dev:dec'`)).rows[0].hits, 0, 'floored at 0');
  });

  await test('anon and authenticated can neither read the table nor call the functions', async () => {
    const { rows } = await db.query(`
      select r.rolname,
             has_table_privilege(r.rolname, 'public.rate_limit_hits', 'select') sel,
             has_function_privilege(r.rolname, 'public.rate_limit_hit(text, integer)', 'execute') hit,
             has_function_privilege(r.rolname, 'public.rate_limit_decrement(text)', 'execute') dec
      from pg_roles r where r.rolname in ('anon', 'authenticated') order by 1`);
    eq(rows.filter((r) => r.sel || r.hit || r.dec).map((r) => r.rolname), [], 'client roles locked out');
    const svc = await db.query(`select has_function_privilege('service_role', 'public.rate_limit_hit(text, integer)', 'execute') ok`);
    eq(svc.rows[0].ok, true, 'service_role can count hits');
  });
} finally {
  await db.drop();
}
done();
