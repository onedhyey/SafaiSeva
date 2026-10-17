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
  return { removedObjects: keys.length ? await removeEvidence(keys) : 0 };
}

/** One retention pass: delete objects older than the window, mark rows purged. */
export async function purgeExpiredEvidence(
  days = EVIDENCE_RETENTION_DAYS,
  batchSize = 500
): Promise<{ purged: number; removedObjects: number }> {
  let purged = 0;
  let removedObjects = 0;
  for (;;) {
    const { data, error } = await admin().rpc('media_due_for_purge', { p_days: days, p_limit: batchSize });
    if (error) throw error;
    const rows = (data ?? []) as { id: string; storage_path: string }[];
    if (!rows.length) break;
    removedObjects += await removeEvidence(rows.map((r) => r.storage_path));
    const { data: n, error: markErr } = await admin().rpc('mark_media_purged', { p_ids: rows.map((r) => r.id) });
    if (markErr) throw markErr;
    purged += Number(n ?? 0);
    if (rows.length < batchSize) break;
  }
  return { purged, removedObjects };
}
