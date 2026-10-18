// Video length policy: the frame sampler stays bounded and evenly spread for any length.
import { FrameSampler, MAX_FRAMES, mmss } from '../src/lib/timelapse.ts';

let failed = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ${detail}`}`);
  if (!cond) failed++;
};

function record(seconds, tickMs = 33) {
  const s = new FrameSampler();
  for (let t = 0; t <= seconds * 1000; t += tickMs) if (s.wants(t)) s.add(t, t);
  return s;
}

const short = record(20);
check('20 s recording keeps every 100 ms frame (~200)', short.size >= 195 && short.size <= 205, String(short.size));

for (const secs of [31, 60, 300, 600]) {
  const s = record(secs);
  const times = s.times();
  check(`${secs} s recording stays within ${MAX_FRAMES} frames`, s.size <= MAX_FRAMES && s.size >= MAX_FRAMES / 2, String(s.size));
  const span = times[times.length - 1] - times[0];
  check(`${secs} s recording frames span the whole clip`, span >= secs * 1000 * 0.9, `${span}`);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const ratio = Math.max(...gaps) / Math.min(...gaps);
  check(`${secs} s recording frames are evenly spaced (max/min gap ${ratio.toFixed(2)})`, ratio <= 2.5, String(ratio));
}

const ten = record(600);
const picked = ten.pick(5);
check('pick(5) returns 5 frames from start to end', picked.length === 5 && picked[0] === ten.all()[0] && picked[4] === ten.all()[ten.size - 1]);
check('mm:ss formatting', mmss(0) === '0:00' && mmss(65) === '1:05' && mmss(600) === '10:00');

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
if (failed) process.exitCode = 1;
