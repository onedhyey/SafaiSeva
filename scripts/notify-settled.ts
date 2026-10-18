// Tell households when held credits become spendable. `npm run ops:notify-settled`
// (SETTLED_WINDOW_MINUTES, default 60 — match the schedule). On Vercel the daily cron
// (/api/cron/daily) runs this with a 24 h window.
import 'dotenv/config';
import { notifySettled } from '../server/jobs.ts';

const windowMin = Number(process.env.SETTLED_WINDOW_MINUTES) || 60;
notifySettled(windowMin)
  .then((r) => console.log(JSON.stringify({ event: 'notify_settled', ...r, windowMin })))
  .catch((e) => {
    console.error(JSON.stringify({ event: 'notify_settled_failed', error: String(e?.message ?? e) }));
    process.exitCode = 1;
  });
