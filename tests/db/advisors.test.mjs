// Advisor fixes (0024): client roles cannot read analytics / leaderboard views.
import { freshDb, test, done, eq } from './harness.mjs';

const db = await freshDb();
try {
  await test('anon and authenticated cannot select the analytics or leaderboard views', async () => {
    // Supabase grants SELECT on public objects to the client roles by default; emulate it.
    await db.query(`grant select on all tables in schema public to anon, authenticated`);
    await db.query(`select 1`); // re-run the revokes the migration makes, as on a fresh project
    const sql = (await import('node:fs')).readFileSync(
      new URL('../../supabase/migrations/0024_advisor_fixes.sql', import.meta.url), 'utf8');
    await db.query(sql);
    const { rows } = await db.query(`
      select c.relname, has_table_privilege('anon', c.oid, 'select') a, has_table_privilege('authenticated', c.oid, 'select') u,
             coalesce(array_to_string(c.reloptions, ','), '') opts
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in
        ('v_officer_dashboard','v_officer_subdistricts','v_officer_worker_audit','v_officer_anomalies','v_ward_leaderboard','v_ward_leaderboard_live','v_ledger_reconciliation')
      order by 1`);
    eq(rows.filter((r) => r.a || r.u).map((r) => r.relname), [], 'client roles have no SELECT');
    eq(rows.filter((r) => !/security_invoker=true/.test(r.opts)).map((r) => r.relname), [], 'all invoker-rights');
  });
} finally {
  await db.drop();
}
done();
