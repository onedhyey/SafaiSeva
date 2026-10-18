// Smoke test: every migration (plus the local seed) applies cleanly to a fresh database.
import { freshDb, test, done, eq } from './harness.mjs';

await test('all migrations + seed apply to an empty database', async () => {
  const db = await freshDb({ seed: true });
  try {
    const { rows } = await db.query(`select count(*)::int as n from public.households where code = 'HH-NV-0482'`);
    eq(rows[0].n, 1, 'seeded demo household');
  } finally {
    await db.drop();
  }
});

done();
