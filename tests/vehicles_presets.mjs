// Golden vehicle preset budgets (design PR 6).

import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const v = await import(pathToFileURL(resolve(ROOT, 'js/physics/vehicles.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ VEHICLE PRESETS ━━━');

const sh = v.superHeavyDeltaV();
check('SH golden ±1 m/s of 3766.67', Math.abs(sh - 3766.67) < 1, `got ${sh.toFixed(4)}`);

check('chem-medium = 6000', v.getTransferBudget('chem-medium') === 6000);
check('fh-class = 9000', v.getTransferBudget('fh-class') === 9000);
check('high-energy = 15000', v.getTransferBudget('high-energy') === 15000);
check('abstract user budget', v.getTransferBudget('abstract', 12345) === 12345);
check('abstract clamp low', v.getTransferBudget('abstract', 10) === 500);
check('abstract clamp high', v.getTransferBudget('abstract', 999999) === 50000);
check('sh-starship uses rocket eq', Math.abs(v.getTransferBudget('sh-starship') - sh) < 1e-9);
check('presets include disclaimers', v.VEHICLE_PRESETS.every(p => p.disclaimer && p.disclaimer.length > 10));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll vehicle preset checks passed');
