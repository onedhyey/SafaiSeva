// Retention job (audit F8): delete evidence photos/videos older than the retention window
// from Storage and mark their rows purged (hashes are kept for duplicate detection).
// Run daily from a scheduler: `npm run ops:purge-evidence` (EVIDENCE_RETENTION_DAYS, default 90).
import 'dotenv/config';
import { purgeExpiredEvidence, EVIDENCE_RETENTION_DAYS } from '../server/privacy.ts';

const started = Date.now();
purgeExpiredEvidence(EVIDENCE_RETENTION_DAYS)
  .then((r) => {
    console.log(JSON.stringify({ event: 'evidence_purge', days: EVIDENCE_RETENTION_DAYS, ...r, ms: Date.now() - started }));
  })
  .catch((e) => {
    console.error(JSON.stringify({ event: 'evidence_purge_failed', error: String(e?.message ?? e) }));
    process.exitCode = 1;
  });
