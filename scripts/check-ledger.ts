// Ledger reconciliation check: exits 1 and prints the offending rows when
// v_ledger_reconciliation is not empty. `npm run ops:check-ledger`
import 'dotenv/config';
import { checkLedger } from '../server/jobs.ts';

checkLedger()
  .then((r) => {
    if (r.ok) return console.log(JSON.stringify({ event: 'ledger_ok' }));
    console.error(JSON.stringify({ event: 'ledger_mismatch', count: r.mismatches.length, rows: r.mismatches }));
    process.exitCode = 1;
  })
  .catch((e) => {
    console.error(JSON.stringify({ event: 'ledger_check_failed', error: String(e?.message ?? e) }));
    process.exitCode = 1;
  });
