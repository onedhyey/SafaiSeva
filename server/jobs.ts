// Scheduled jobs, callable from the npm ops:* scripts and from the Vercel cron endpoint.

import { admin } from './supabaseAdmin.ts';
import { notifyHousehold } from './push.ts';
import { purgeExpiredEvidence, EVIDENCE_RETENTION_DAYS } from './privacy.ts';

/** Tell households when held credits became spendable within the last `windowMin`. */
export async function notifySettled(windowMin: number): Promise<{ households: number }> {
  const now = new Date();
  const since = new Date(now.getTime() - windowMin * 60_000);
  const { data, error } = await admin()
    .from('credit_ledger')
    .select('household_id, amount')
    .in('entry_type', ['earn', 'milestone', 'reversal'])
    .gt('effective_at', since.toISOString())
    .lte('effective_at', now.toISOString())
    // Rows created already-settled (doorstep issuance) were announced when issued.
    .lt('created_at', since.toISOString());
  if (error) throw error;

  const totals = new Map<string, number>();
  for (const r of data ?? []) totals.set(r.household_id, (totals.get(r.household_id) ?? 0) + r.amount);
  let sent = 0;
  for (const [householdId, amount] of totals) {
    // Net of reversals settling in the same window: nothing to announce if reversed.
    if (amount <= 0) continue;
    await notifyHousehold(householdId, {
      title: 'Your leaves are ready',
      body: `${amount} leaves are now spendable on rewards.`,
      url: '/?tab=rewards',
      tag: 'settled',
    });
    sent++;
  }
  return { households: sent };
}

/** v_ledger_reconciliation must be empty. */
export async function checkLedger(): Promise<{ ok: boolean; mismatches: unknown[] }> {
  const { data, error } = await admin().from('v_ledger_reconciliation').select('*').limit(100);
  if (error) throw error;
  return { ok: !data?.length, mismatches: data ?? [] };
}

/** Everything the daily cron runs. Each job is isolated so one failure doesn't skip the rest. */
export async function runDaily(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (e: any) {
      out[name] = { error: String(e?.message ?? e) };
    }
  };
  await step('purgeEvidence', () => purgeExpiredEvidence(EVIDENCE_RETENTION_DAYS));
  await step('notifySettled', () => notifySettled(24 * 60));
  await step('ledger', () => checkLedger());
  return out;
}
