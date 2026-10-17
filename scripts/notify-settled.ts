// Tell households when held credits become spendable. Run hourly from a scheduler:
// `npm run ops:notify-settled` (SETTLED_WINDOW_MINUTES, default 60 — match the schedule).
import 'dotenv/config';
import { admin } from '../server/supabaseAdmin.ts';
import { notifyHousehold } from '../server/push.ts';

const windowMin = Number(process.env.SETTLED_WINDOW_MINUTES) || 60;
const now = new Date();
const since = new Date(now.getTime() - windowMin * 60_000);

const { data, error } = await admin()
  .from('credit_ledger')
  .select('household_id, amount')
  .in('entry_type', ['earn', 'milestone'])
  .gt('effective_at', since.toISOString())
  .lte('effective_at', now.toISOString())
  // Rows created already-settled (doorstep issuance) were announced when issued.
  .lt('created_at', since.toISOString());

if (error) {
  console.error(JSON.stringify({ event: 'notify_settled_failed', error: error.message }));
  process.exit(1);
}

const totals = new Map<string, number>();
for (const r of data ?? []) totals.set(r.household_id, (totals.get(r.household_id) ?? 0) + r.amount);

for (const [householdId, amount] of totals) {
  await notifyHousehold(householdId, {
    title: 'Your leaves are ready',
    body: `${amount} leaves are now spendable on transit rewards.`,
    url: '/?tab=rewards',
    tag: 'settled',
  });
}
console.log(JSON.stringify({ event: 'notify_settled', households: totals.size, windowMin }));
