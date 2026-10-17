// UI translation layer: fallback, interpolation, and every key translated in gu and hi.
import { translate } from '../src/lib/i18n.tsx';
import * as mod from '../src/lib/i18n.tsx';

let failed = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  ${detail}`}`);
  if (!cond) failed++;
};

check('English string', translate('en', 'nav.wallet') === 'Wallet');
check('Gujarati string', translate('gu', 'nav.wallet') === 'વૉલેટ');
check('unknown key falls back to the key', translate('hi', 'no.such.key') === 'no.such.key');
check('interpolation', translate('en', 'members.wants', { name: 'Asha' }) === 'Asha wants to join');
check('interpolation in Gujarati', translate('gu', 'members.wants', { name: 'Asha' }).startsWith('Asha '));

// Every English key has a Gujarati and Hindi translation (no silent English fallbacks).
const keys = Object.keys(mod.__dicts.en);
for (const lang of ['gu', 'hi']) {
  const missing = keys.filter((k) => !(k in mod.__dicts[lang]));
  check(`${lang}: all ${keys.length} keys translated`, missing.length === 0, missing.join(', '));
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
if (failed) process.exitCode = 1;
