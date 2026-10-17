// End-to-end API tests: the real Express routes against real Postgres via PostgREST.
// Proves the audit fixes at the HTTP surface the client actually uses.
import { startStack, postgrestBin, noiseJpeg, CLEAN_EVIDENCE } from './harness.mjs';
import { test, done, assert, eq } from '../db/harness.mjs';

if (!postgrestBin()) {
  console.log('SKIP  API suite — no PostgREST binary (set POSTGREST_BIN or put postgrest on PATH)');
  process.exit(0);
}

const WORKER = 'AMC-WZ-109';

// --- fail-closed identity (F1 / F2) ------------------------------------------------------
{
  const s = await startStack({ env: { NODE_ENV: 'production' } });
  try {
    await test('F1: production without Clerk refuses anonymous device sessions (503)', async () => {
      const r = await s.call('GET', '/api/wallet', { device: 'attacker-device-0001' });
      eq(r.status, 503, 'status');
    });
    await test('F2: production without Clerk ignores the demo karmachari header (503)', async () => {
      const r = await s.call('POST', '/api/worker/issue', {
        worker: WORKER,
        body: { householdCode: 'HH-NV-0188', streams: ['wet', 'dry'] },
      });
      eq(r.status, 503, 'status');
      const n = await s.db.query(`select count(*)::int n from public.credit_ledger where reason like 'Doorstep%'`);
      eq(n.rows[0].n, 0, 'no credits issued');
    });
  } finally {
    await s.stop();
  }
}

// --- demo mode (development) end to end -------------------------------------------------
const s = await startStack();
try {
  const dev = 'demo-device-' + Math.random().toString(36).slice(2, 10);
  const one = (sql, p) => s.db.query(sql, p).then((x) => x.rows[0]);
  const demoHh = (await one(`select id from public.households where code = 'HH-NV-0482'`)).id;

  await test('wallet works for a demo device (auto-linked to the demo household)', async () => {
    const r = await s.call('GET', '/api/wallet', { device: dev });
    eq([r.status, r.body.householdCode], [200, 'HH-NV-0482'], 'wallet');
  });

  await test('F6: reporting 6 bins pays nothing without verified evidence', async () => {
    const r = await s.call('POST', '/api/household/bins', { device: dev, body: { binCount: 6 } });
    eq(r.status, 200, 'status');
    eq(r.body.milestonesAwarded, [], 'no milestones');
    const n = await one(`select count(*)::int n from public.credit_ledger where entry_type = 'milestone' and household_id = $1`, [demoHh]);
    eq(n.n, 0, 'no milestone ledger rows');
  });

  await test('F3: leaderboard carries no household codes or addresses', async () => {
    const r = await s.call('GET', '/api/ward/leaderboard', { device: dev });
    eq(r.status, 200, 'status');
    assert(!/HH-[A-Z]/.test(r.text), `household code leaked: ${r.text}`);
    assert(!/Navrangpura|Shivam|Apts/i.test(r.text), `address leaked: ${r.text}`);
  });

  await test('F4: verify refuses a handoverId from another household (403, victim untouched)', async () => {
    const w = (await one(`select id from public.wards where code = 'W12-NAVRANGPURA'`)).id;
    const victimUser = (await one(`insert into public.users (device_id) values ('victim-dev-01') returning id`)).id;
    const victimHh = (await one(
      `insert into public.households (code, address, ward_id) values ('HH-VICTIM-1', 'x', $1) returning id`, [w]
    )).id;
    const victimH = (await one(
      `insert into public.handovers (household_id, submitted_by, status, declared_streams)
       values ($1, $2, 'needs_video', '{wet,dry}') returning id`, [victimHh, victimUser]
    )).id;
    const r = await s.submitPhoto(dev, await noiseJpeg(), { attempt: 2, handoverId: victimH });
    eq(r.status, 403, `status (${r.text})`);
    const v = await one(`select status from public.handovers where id = $1`, [victimH]);
    eq(v.status, 'needs_video', 'victim handover unchanged');
  });

  await test('verify happy path: signed upload → evidence → verified, held earn row', async () => {
    const r = await s.submitPhoto(dev, await noiseJpeg());
    eq([r.status, r.body?.status], [200, 'verified'], `verify (${r.text})`);
    eq(r.body.creditsAwarded, 2, 'credits');
    const l = await s.db.query(
      `select amount, effective_at > now() as held from public.credit_ledger where handover_id = $1`,
      [r.body.handoverId]
    );
    eq(l.rows.map((x) => [x.amount, x.held]), [[2, true]], 'one held earn row');
  });

  await test('F5: further same-day verifies are rejected and never paid', async () => {
    const results = await Promise.all([1, 2, 3].map(async () => s.submitPhoto(dev, await noiseJpeg())));
    for (const r of results) eq([r.status, r.body?.status], [200, 'rejected'], `verify (${r.text})`);
    const n = await one(
      `select count(*)::int n from public.credit_ledger where household_id = $1 and entry_type = 'earn'`, [demoHh]
    );
    eq(n.n, 1, 'still exactly one earn row');
  });

  await test('F12: the same photo from another household is flagged as duplicate evidence', async () => {
    // a second household with its own device, sending bytes already seen
    const jpeg = await noiseJpeg();
    const first = await s.submitPhoto('dup-device-aaaa', jpeg);
    assert(first.status === 200, first.text);
    const w = (await one(`select id from public.wards where code = 'W12-NAVRANGPURA'`)).id;
    const u = (await one(`insert into public.users (device_id) values ('dup-device-bbbb') returning id`)).id;
    const hh = (await one(
      `insert into public.households (code, address, ward_id, collection_start_hour, collection_end_hour)
       values ('HH-DUP-2', 'y', $1, 0, 24) returning id`, [w]
    )).id;
    await s.db.query(`insert into public.household_members (household_id, user_id, member_role) values ($1, $2, 'owner')`, [hh, u]);
    const r = await s.submitPhoto('dup-device-bbbb', jpeg);
    eq(r.body?.status, 'rejected', `status (${r.text})`);
    assert((r.body.fraudSignals ?? []).includes('duplicate_phash'), `signals ${JSON.stringify(r.body.fraudSignals)}`);
  });

  await test('F7: a capture claimed 8 hours ago goes to a human, not auto-paid', async () => {
    const w = (await one(`select id from public.wards where code = 'W12-NAVRANGPURA'`)).id;
    const u = (await one(`insert into public.users (device_id) values ('stale-device-1') returning id`)).id;
    const hh = (await one(
      `insert into public.households (code, address, ward_id, collection_start_hour, collection_end_hour)
       values ('HH-STALE-1', 'z', $1, 0, 24) returning id`, [w]
    )).id;
    await s.db.query(`insert into public.household_members (household_id, user_id, member_role) values ($1, $2, 'owner')`, [hh, u]);
    const r = await s.submitPhoto('stale-device-1', await noiseJpeg(), {
      clientCapturedAt: new Date(Date.now() - 8 * 3600_000).toISOString(),
    });
    eq(r.body?.status, 'in_review', `status (${r.text})`);
    eq(r.body.creditsAwarded, 0, 'no credits yet');
  });

  await test('F11: karmachari review queue only lists their ward', async () => {
    const other = (await one(
      `insert into public.wards (code, name, min_lat, max_lat, min_lng, max_lng)
       values ('W-OTHER', 'Other ward', 22, 23, 72, 73) returning id`
    )).id;
    const u = (await one(`insert into public.users (device_id) values ('other-ward-dev') returning id`)).id;
    const hh = (await one(
      `insert into public.households (code, address, ward_id) values ('HH-OTHER-1', 'o', $1) returning id`, [other]
    )).id;
    const h = (await one(
      `insert into public.handovers (household_id, submitted_by, status) values ($1, $2, 'in_review') returning id`, [hh, u]
    )).id;
    const r = await s.call('GET', '/api/review-queue', { worker: WORKER });
    eq(r.status, 200, 'status');
    assert(r.body.items.length > 0, 'own-ward items visible');
    assert(!r.body.items.some((i) => i.handover_id === h), 'other-ward item hidden');
    const d = await s.call('POST', `/api/review-queue/${h}/decide`, { worker: WORKER, body: { decision: 'approve' } });
    eq(d.status, 403, `cross-ward decide (${d.text})`);
  });

  await test('F5/F11: review approval respects the household daily limit', async () => {
    // two in_review handovers for the demo household, dated today (it already has a verified one)
    const mk = async () =>
      (await one(
        `insert into public.handovers (household_id, submitted_by, status, declared_streams)
         values ($1, (select user_id from public.household_members where household_id = $1 limit 1),
                 'in_review', '{wet,dry}') returning id`,
        [demoHh]
      )).id;
    const [h1, h2] = [await mk(), await mk()];
    const r = await s.call('POST', `/api/review-queue/${h1}/decide`, {
      worker: WORKER,
      body: { decision: 'approve' },
    });
    eq(r.status, 409, `approve when already verified today (${r.text})`);
    const rej = await s.call('POST', `/api/review-queue/${h2}/decide`, {
      worker: WORKER,
      body: { decision: 'reject', reason: 'mixed' },
    });
    eq([rej.status, rej.body?.status], [200, 'rejected'], 'reject');
  });

  await test('doorstep issuance: pays once per day, ward-scoped', async () => {
    const a = await s.call('POST', '/api/worker/issue', {
      worker: WORKER,
      body: { householdCode: 'HH-NV-0188', streams: ['wet', 'dry'] },
    });
    eq([a.status, a.body?.creditsAwarded], [200, 2], `first issuance (${a.text})`);
    const b = await s.call('POST', '/api/worker/issue', {
      worker: WORKER,
      body: { householdCode: 'HH-NV-0188', streams: ['wet', 'dry'] },
    });
    eq(b.status, 409, 'second issuance same day');
    const c = await s.call('POST', '/api/worker/issue', {
      worker: WORKER,
      body: { householdCode: 'HH-OTHER-1', streams: ['wet', 'dry'] },
    });
    eq(c.status, 403, 'other ward');
  });

  await test('errors never leak database internals', async () => {
    const r = await s.call('POST', '/api/review-queue/not-a-uuid/decide', { worker: WORKER, body: { decision: 'approve' } });
    assert(r.status >= 400, 'error status');
    assert(!/invalid input syntax|uuid|violates|relation|column/i.test(r.text), `leak: ${r.text}`);
  });

  await test('F8: no evidence is accepted before the resident has consented', async () => {
    const d = 'consent-dev-' + Math.random().toString(36).slice(2, 8);
    const me = await s.call('GET', '/api/me', { device: d });
    eq([me.status, me.body?.consentRequired], [200, true], `me (${me.text})`);
    const r = await s.submitPhoto(d, await noiseJpeg(), {}, { consent: false });
    eq(r.status, 428, `verify before consent (${r.text})`);
    const c = await s.call('POST', '/api/me/consent', { device: d, body: { version: me.body.consentVersion } });
    eq(c.status, 200, 'consent recorded');
    const me2 = await s.call('GET', '/api/me', { device: d });
    eq(me2.body?.consentRequired, false, 'consent no longer required');
  });

  await test('F8: DELETE /api/me anonymises the user and deletes their evidence objects', async () => {
    const w = (await one(`select id from public.wards where code = 'W12-NAVRANGPURA'`)).id;
    const d = 'forget-dev-' + Math.random().toString(36).slice(2, 8);
    const u = (await one(`insert into public.users (device_id) values ($1) returning id`, [d])).id;
    const hh = (await one(
      `insert into public.households (code, address, ward_id, collection_start_hour, collection_end_hour)
       values ('HH-FORGET-1', 'f', $1, 0, 24) returning id`, [w]
    )).id;
    await s.db.query(`insert into public.household_members (household_id, user_id, member_role) values ($1, $2, 'owner')`, [hh, u]);
    const r = await s.submitPhoto(d, await noiseJpeg());
    eq(r.status, 200, `verify (${r.text})`);
    const key = (await one(`select storage_path from public.handover_media m join public.handovers h on h.id = m.handover_id where h.household_id = $1`, [hh])).storage_path;
    assert(s.objects.has(key), 'object stored');
    const del = await s.call('DELETE', '/api/me', { device: d });
    eq(del.status, 200, `delete (${del.text})`);
    assert(!s.objects.has(key), 'object removed from storage');
    const row = await one(`select display_name, deleted_at is not null as deleted from public.users where id = $1`, [u]);
    eq([row.display_name, row.deleted], ['Deleted user', true], 'anonymised');
  });

  await test('security headers on API and page responses', async () => {
    for (const p of ['/api/health', '/']) {
      const r = await fetch(s.base + p);
      const h = (k) => r.headers.get(k) || '';
      assert(h('x-content-type-options') === 'nosniff', `${p} nosniff`);
      assert(h('x-frame-options') === 'DENY', `${p} frame`);
      assert(/strict-origin/.test(h('referrer-policy')), `${p} referrer`);
      assert(/camera=\(self\)/.test(h('permissions-policy')), `${p} permissions`);
      assert(!h('x-powered-by'), `${p} x-powered-by hidden`);
    }
  });

  await test('push: config exposes the VAPID public key; subscribe stores the subscription', async () => {
    const cfg = await s.call('GET', '/api/push/config', { device: dev });
    eq(cfg.status, 200, `config (${cfg.text})`);
    assert(typeof cfg.body.publicKey === 'string' && cfg.body.publicKey.length > 40, 'public key');
    const sub = s.fakeSubscription('demo-sub');
    const r = await s.call('POST', '/api/push/subscribe', { device: dev, body: sub });
    eq(r.status, 200, `subscribe (${r.text})`);
    const n = await one(`select count(*)::int n from public.push_subscriptions where endpoint = $1`, [sub.endpoint]);
    eq(n.n, 1, 'stored once');
    await s.call('POST', '/api/push/subscribe', { device: dev, body: sub });
    const n2 = await one(`select count(*)::int n from public.push_subscriptions where endpoint = $1`, [sub.endpoint]);
    eq(n2.n, 1, 'idempotent');
  });

  await test('push: a karmachari review decision notifies the household', async () => {
    const w = (await one(`select id from public.wards where code = 'W12-NAVRANGPURA'`)).id;
    const d = 'push-dev-' + Math.random().toString(36).slice(2, 8);
    const u = (await one(`insert into public.users (device_id) values ($1) returning id`, [d])).id;
    const hh = (await one(
      `insert into public.households (code, address, ward_id) values ('HH-PUSH-1', 'p', $1) returning id`, [w]
    )).id;
    await s.db.query(`insert into public.household_members (household_id, user_id, member_role) values ($1, $2, 'owner')`, [hh, u]);
    const h = (await one(
      `insert into public.handovers (household_id, submitted_by, status, declared_streams) values ($1, $2, 'in_review', '{wet,dry}') returning id`,
      [hh, u]
    )).id;
    const sub = s.fakeSubscription('review-sub');
    eq((await s.call('POST', '/api/push/subscribe', { device: d, body: sub })).status, 200, 'subscribe');
    const r = await s.call('POST', `/api/review-queue/${h}/decide`, { worker: WORKER, body: { decision: 'approve' } });
    eq(r.status, 200, `approve (${r.text})`);
    const until = Date.now() + 5000;
    while (!s.pushes.some((p) => p.id === 'review-sub') && Date.now() < until) await new Promise((x) => setTimeout(x, 100));
    assert(s.pushes.some((p) => p.id === 'review-sub'), 'push delivered to the household');
  });

  await test('push: a gone subscription (410) is removed', async () => {
    const d = 'gone-dev-' + Math.random().toString(36).slice(2, 8);
    const sub = s.fakeSubscription('gone-sub');
    s.pushStatus.set('gone-sub', 410);
    eq((await s.call('POST', '/api/push/subscribe', { device: d, body: sub })).status, 200, 'subscribe');
    const t = await s.call('POST', '/api/push/test', { device: d });
    eq(t.status, 200, `test push (${t.text})`);
    const n = await one(`select count(*)::int n from public.push_subscriptions where endpoint = $1`, [sub.endpoint]);
    eq(n.n, 0, 'removed after 410');
  });

  await test('moderation: officer sees a household in their ward and reverses an award', async () => {
    const OFFICER = 'AMC-WO-12';
    const r = await s.call('GET', '/api/officer/households/HH-NV-0188', { officer: OFFICER });
    eq(r.status, 200, `household (${r.text})`);
    const paid = r.body.handovers.find((h) => h.status === 'verified');
    assert(paid, 'doorstep-paid handover listed');
    const before = (await one(`select settled_balance::int b from public.v_household_balance where household_code = 'HH-NV-0188'`)).b;
    const rev = await s.call('POST', `/api/officer/handovers/${paid.id}/reverse`, {
      officer: OFFICER,
      body: { reason: 'Spot check: bins were mixed' },
    });
    eq([rev.status, rev.body?.reversed], [200, 2], `reverse (${rev.text})`);
    const after = (await one(`select settled_balance::int b from public.v_household_balance where household_code = 'HH-NV-0188'`)).b;
    eq(after, before - 2, 'balance reduced');
    const again = await s.call('POST', `/api/officer/handovers/${paid.id}/reverse`, { officer: OFFICER, body: { reason: 'x' } });
    eq(again.status, 409, 'second reversal');
    const other = await s.call('GET', '/api/officer/households/HH-OTHER-1', { officer: OFFICER });
    eq(other.status, 403, 'other ward hidden');
  });

  await test('moderation: a suspended household cannot submit; lifting restores it', async () => {
    const OFFICER = 'AMC-WO-12';
    const sus = await s.call('POST', '/api/officer/households/HH-NV-0482/suspension', {
      officer: OFFICER,
      body: { suspended: true, reason: 'Investigating duplicate photos' },
    });
    eq(sus.status, 200, `suspend (${sus.text})`);
    const v = await s.submitPhoto(dev, await noiseJpeg());
    eq(v.status, 403, `verify while suspended (${v.text})`);
    const lift = await s.call('POST', '/api/officer/households/HH-NV-0482/suspension', {
      officer: OFFICER,
      body: { suspended: false, reason: 'Cleared after spot check' },
    });
    eq(lift.status, 200, 'lift');
    const n = (await one(`select count(*)::int n from public.moderation_actions`)).n;
    assert(n >= 3, `audit rows: ${n}`);
  });

  await test('ledger reconciliation is empty after the whole run', async () => {
    const rows = (await s.db.query(`select * from public.v_ledger_reconciliation`)).rows;
    eq(rows, [], 'reconciliation');
  });
} catch (e) {
  console.log(s.log());
  throw e;
} finally {
  await s.stop();
}

done();
