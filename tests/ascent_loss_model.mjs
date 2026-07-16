import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const m = await import(pathToFileURL(resolve(ROOT, 'js/physics/ascent-loss-model.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ ASCENT LOSS MODEL ━━━');

const f9 = m.estimateAscentLossForVehicle('falcon9');
check('F9 estimate 1500–2500', f9.total_m_s >= 1500 && f9.total_m_s <= 2500, `got ${f9.total_m_s}`);
check('disclaimer long', f9.disclaimer.length > 40);

const ss = m.estimateAscentLossForVehicle('sh-starship');
check('SH class estimate 1500–3000', ss.total_m_s >= 1500 && ss.total_m_s <= 3000);

const ab = m.estimateAscentLossForVehicle('abstract');
check('abstract estimate 0', ab.total_m_s === 0);

check('clamp high', m.clampAscentBudget(99999) === 5000);
check('clamp zero', m.clampAscentBudget(0) === 0);

if (failed) {
  console.error(`\n${failed} ascent loss checks failed`);
  process.exit(1);
}
console.log('\nAll ascent loss model checks passed');
