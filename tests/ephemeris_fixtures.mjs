/**
 * Offline golden positions: record approx Kepler states at fixed epochs.
 * Guards against accidental ephemeris regressions (no live network).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = resolve(ROOT, 'tests/fixtures/ephemeris');
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);
const { getBodyPosition3D } = await import(pathToFileURL(resolve(ROOT, 'js/physics/kepler.js')).href);
const { J2000 } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);

const EPOCHS = [
  { name: 'j2000', ms: J2000 },
  { name: '2026-06-01', ms: Date.UTC(2026, 5, 1, 12) },
  { name: '2030-01-01', ms: Date.UTC(2030, 0, 1, 12) },
];
const NAMES = ['Earth', 'Mars', 'Venus', 'Jupiter'];

mkdirSync(FIX, { recursive: true });
const goldenPath = resolve(FIX, 'approx_golden_v1.json');

let golden;
if (!existsSync(goldenPath)) {
  golden = { version: 1, epochs: {}, note: 'Generated from kepler approx; commit as regression baseline' };
  for (const ep of EPOCHS) {
    const t = (ep.ms - J2000) / 1000;
    golden.epochs[ep.name] = {};
    for (const name of NAMES) {
      const b = BODIES.find((x) => x.name === name);
      const p = getBodyPosition3D(b, t, false);
      golden.epochs[ep.name][name.toLowerCase()] = {
        x: p.x, y: p.y, z: p.z, t_sim: t,
      };
    }
  }
  writeFileSync(goldenPath, JSON.stringify(golden, null, 2));
  console.log('Wrote new golden fixture', goldenPath);
} else {
  golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
}

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ EPHEMERIS FIXTURES (OFFLINE) ━━━');

// Tolerance: numerical noise only for same model (1e-12 AU ~ 0.15 m)
const TOL = 1e-11;

for (const ep of EPOCHS) {
  const t = (ep.ms - J2000) / 1000;
  for (const name of NAMES) {
    const key = name.toLowerCase();
    const b = BODIES.find((x) => x.name === name);
    const p = getBodyPosition3D(b, t, false);
    const g = golden.epochs[ep.name][key];
    const d = Math.hypot(p.x - g.x, p.y - g.y, p.z - g.z);
    check(`${ep.name} ${key} within ${TOL} AU`, d < TOL, `Δ=${d.toExponential(2)}`);
  }
}

// Sample asset meta
const samples = JSON.parse(readFileSync(resolve(ROOT, 'assets/ephemeris-samples-v1.json'), 'utf8'));
check('sample asset version 1', samples.version === 1);
check('sample has 8 bodies', Object.keys(samples.bodies).length === 8);
check('sample n > 100', samples.n > 100);
const bytes = Buffer.byteLength(JSON.stringify(samples));
check('sample soft budget ≤ 2.5 MiB', bytes <= 2.5 * 1024 * 1024, `${(bytes / 1024 / 1024).toFixed(2)} MiB`);

if (failed) {
  console.error(`\n${failed} fixture checks failed`);
  process.exit(1);
}
console.log('\nAll ephemeris fixture checks passed');
