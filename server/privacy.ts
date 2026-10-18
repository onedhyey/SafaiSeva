// Consent and data-subject rights (audit F8; DPDP Act 2023).
//
// CONSENT_VERSION names the privacy notice the resident agreed to. Bump it whenever the
// notice text changes materially (what is collected, why, who processes it, how long it
// is kept); everyone is then asked again before their next submission.

import { admin } from './supabaseAdmin.ts';
import { removeEvidence } from './storage.ts';

export const CONSENT_VERSION = '2026-10-v1';

// How long evidence media is kept before the purge job deletes the objects (hashes stay).
export const EVIDENCE_RETENTION_DAYS = Number(process.env.EVIDENCE_RETENTION_DAYS) || 90;

export async function consentFor(userId: string): Promise<{ version: string | null; at: string | null }> {
  const { data } = await admin()
    .from('users')
    .select('consent_version, consent_at')
    .eq('id', userId)
    .maybeSingle();
  return { version: data?.consent_version ?? null, at: data?.consent_at ?? null };
}

export async function hasCurrentConsent(userId: string): Promise<boolean> {
  return (await consentFor(userId)).version === CONSENT_VERSION;
}

export function consentRequiredError(): Error {
  const e: any = new Error('Please read and accept the privacy notice before submitting evidence.');
  e.status = 428;
  return e;
}

/** Anonymise a user and delete the evidence objects they submitted. */
export async function forgetUser(userId: string): Promise<{ removedObjects: number }> {
  // Push endpoints identify a device; drop them first.
  await admin().from('push_subscriptions').delete().eq('user_id', userId);
  const { data, error } = await admin().rpc('forget_user', { p_user: userId });
  if (error) throw error;
  const keys: string[] = ((data as any)?.storage_paths ?? []).filter(Boolean);
  if (!keys.length) return { removedObjects: 0 };
  const removed = await removeEvidence(keys);
  await markPurged([...removed]);
  // Anything not confirmed removed stays due; the next purge run retries it first.
  return { removedObjects: removed.size };
}

async function markPurged(paths: string[]): Promise<number> {
  if (!paths.length) return 0;
  const { data: rows } = await admin()
    .from('handover_media')
    .select('id')
    .in('storage_path', paths)
    .is('purged_at', null);
  const ids = (rows ?? []).map((r: any) => r.id);
  if (!ids.length) return 0;
  const { data: n, error } = await admin().rpc('mark_media_purged', { p_ids: ids });
  if (error) throw error;
  return Number(n ?? 0);
}

/** One retention pass: delete due objects (deleted users' first), mark only confirmed ones. */
export async function purgeExpiredEvidence(
  days = EVIDENCE_RETENTION_DAYS,
  batchSize = 500
): Promise<{ purged: number; removedObjects: number; failed: number }> {
  let purged = 0;
  let removedObjects = 0;
  let failed = 0;
  for (let round = 0; round < 100; round++) {
    const { data, error } = await admin().rpc('media_due_for_purge', { p_days: days, p_limit: batchSize });
    if (error) throw error;
    const rows = (data ?? []) as { id: string; storage_path: string }[];
    if (!rows.length) break;
    const removed = await removeEvidence(rows.map((r) => r.storage_path));
    removedObjects += removed.size;
    const ok = rows.filter((r) => removed.has(r.storage_path)).map((r) => r.id);
    failed += rows.length - ok.length;
    if (ok.length) {
      const { data: n, error: markErr } = await admin().rpc('mark_media_purged', { p_ids: ok });
      if (markErr) throw markErr;
      purged += Number(n ?? 0);
    }
    // Stop when nothing more could be removed this run (avoid spinning on failures).
    if (rows.length < batchSize || ok.length === 0) break;
  }
  return { purged, removedObjects, failed };
}
