// Ledger reconciliation check: v_ledger_reconciliation must be empty. Exits 1 and prints
// the offending rows when it is not, so a scheduler (cron / GitHub Actions) can alert.
// `npm run ops:check-ledger`
import 'dotenv/config';
import { admin } from '../server/supabaseAdmin.ts';

const { data, error } = await admin().from('v_ledger_reconciliation').select('*').limit(100);
if (error) {
  console.error(JSON.stringify({ event: 'ledger_check_failed', error: error.message }));
  process.exit(1);
}
if (data && data.length) {
  console.error(JSON.stringify({ event: 'ledger_mismatch', count: data.length, rows: data }));
  process.exit(1);
}
console.log(JSON.stringify({ event: 'ledger_ok' }));
