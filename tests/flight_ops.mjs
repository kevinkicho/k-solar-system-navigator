/**
 * Educational flight-ops helpers + L3 SPICE sample-table detection.
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

import {
  lightTimeSeconds,
  formatLightTime,
  lightTimeSummary,
  buildFlightOpsGates,
  buildEducationalOem,
  opsDisclaimer,
  C_LIGHT,
} from '../js/physics/flight-ops.js';
import {
  setSampleTableForTests,
  getSampleMeta,
  sampleTableIsSpiceDe,
} from '../js/physics/ephemeris-sample.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ FLIGHT OPS + L3 SPICE DETECT ━━━');

// Light time at 1 AU ≈ 499.0 s
const lt1 = lightTimeSeconds(1);
check('1 AU light time ~499 s', lt1 != null && Math.abs(lt1 - 499) < 1.5, `lt=${lt1}`);
check('formatLightTime minutes', formatLightTime(120).includes('min'));
check('formatLightTime null', formatLightTime(null) === '—');
check('C_LIGHT matches SI', C_LIGHT === 299792458);

const td = {
  body1: { name: 'Earth', id: 'earth' },
  body2: { name: 'Mars', id: 'mars' },
  dep3D: { x: 1, y: 0, z: 0 },
  arr3D: { x: 1.5, y: 0, z: 0 },
  departureSimTime: 0,
  arrivalSimTime: 100 * 86400,
  departure_utc: '2030-01-01T12:00:00Z',
  arrival_utc: '2030-07-01T12:00:00Z',
};
const sum = lightTimeSummary(td);
check('lightTimeSummary dep/arr', sum && sum.lt_dep_s > 0 && sum.lt_arr_s > sum.lt_dep_s);
check('lightTimeSummary note present', /light time/i.test(sum.note || ''));

// Gates without SPICE meta
const gatesWarn = buildFlightOpsGates(td, { sampleMeta: null });
check('ops gates include not-certified', gatesWarn.some((g) => g.code === 'G_OPS_NOT_CERTIFIED'));
check('ops gates warn without spice', gatesWarn.some((g) => g.code === 'G_OPS_KERNEL_SOURCE' && g.level === 'warn'));
check('ops gates light-time pass', gatesWarn.some((g) => g.code === 'G_OPS_LIGHT_TIME' && g.level === 'pass'));
check('ops gates aberration warn', gatesWarn.some((g) => g.code === 'G_OPS_ABERRATION'));

// Load real product sample table
const samples = JSON.parse(readFileSync(resolve(ROOT, 'assets/ephemeris-samples-v1.json'), 'utf8'));
setSampleTableForTests(samples);
const meta = getSampleMeta();
check('sample meta has source', !!meta?.source);
const isSpice = sampleTableIsSpiceDe();
check('sampleTableIsSpiceDe for product table', isSpice === true
  || samples.bake_source === 'horizons'
  || samples.bake_source === 'bootstrap',
  `isSpice=${isSpice} bake=${samples.bake_source}`);

if (isSpice) {
  const gatesOk = buildFlightOpsGates(td, { sampleMeta: meta });
  check('SPICE kernel gate pass', gatesOk.some((g) => g.code === 'G_OPS_KERNEL_SOURCE' && g.level === 'pass'));
}

const gatesHz = buildFlightOpsGates(td, { sampleMeta: meta, horizonsInject: true });
check('Horizons inject gate', gatesHz.some((g) => g.code === 'G_OPS_LIVE_HORIZONS' && g.level === 'warn'));

// OEM-like export
const oem = buildEducationalOem(td, [
  { t: 0, x: 1, y: 0, z: 0 },
  { t: 86400, x: 1.01, y: 0.01, z: 0 },
]);
check('OEM has CCSDS header', oem.includes('CCSDS_OEM_VERS'));
check('OEM educational disclaimer', /NOT a CCSDS|Educational/i.test(oem));
check('OEM has state lines', oem.split('\n').length > 15);
check('OEM empty samples comment', buildEducationalOem(td, []).includes('No path samples'));
check('opsDisclaimer present', /educational only/i.test(opsDisclaimer()));

// Synthetic spice vs bootstrap detect
setSampleTableForTests({
  version: 4,
  source: 'naif-de440s-spice-v4',
  bake_source: 'spice-de440s',
  bodies: { earth: { pos_au: [[1, 0, 0]] } },
  n: 1,
  t0_sim: 0,
  step_sec: 1,
});
check('detect spice bake_source', sampleTableIsSpiceDe() === true);

setSampleTableForTests({
  version: 3,
  source: 'jpl-horizons-vectors-v3',
  bake_source: 'horizons',
  bodies: {},
  n: 0,
});
check('detect non-spice horizons', sampleTableIsSpiceDe() === false);

// Restore product table for any subsequent suite modules that share process (we spawn separate processes)
setSampleTableForTests(samples);

if (failed) {
  console.error(`\nflight_ops: ${failed} failed`);
  process.exit(1);
}
console.log('flight_ops: ok');
