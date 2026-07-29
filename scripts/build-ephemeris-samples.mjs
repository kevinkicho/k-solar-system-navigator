/**
 * Build offline L2-plan sample tables for major planets.
 *
 * v1 source: HELIOS Approximate Positions (kepler.js) with a documented
 * educational Mars radial bias so L2-plan geometry is distinguishable from L1
 * for regression tests. Replace with Horizons/DE bake when available
 * (see docs/ephemeris-fidelity-platform-design.md).
 *
 * Usage: node scripts/build-ephemeris-samples.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);
const { getBodyPosition3D } = await import(pathToFileURL(resolve(ROOT, 'js/physics/kepler.js')).href);
const { DAY, J2000 } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);

// Expanded window: 2015-01-01 → 2055-01-01, 3-day step (still under ~2.5 MiB soft budget).
// Wider epoch coverage reduces OOR fallback to L1 approx for typical mission plans.
const t0Date = Date.UTC(2015, 0, 1, 12, 0, 0);
const t1Date = Date.UTC(2055, 0, 1, 12, 0, 0);
const t0_sim = (t0Date - J2000) / 1000;
const t1_sim = (t1Date - J2000) / 1000;
const step_days = 3;
const step_sec = step_days * DAY;
const n = Math.floor((t1_sim - t0_sim) / step_sec) + 1;

const names = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const bodies = {};

// Educational Mars bias: +0.00015 AU (~22,400 km) along heliocentric x at every knot.
// Order-of-magnitude comparable to JPL approx range class for Mars (~25×1000 km).
const MARS_BIAS_AU = 0.00015;

for (const name of names) {
  const body = BODIES.find((b) => b.name === name);
  if (!body) throw new Error(`missing body ${name}`);
  const key = name.toLowerCase();
  const pos_au = [];
  for (let i = 0; i < n; i++) {
    const t = t0_sim + i * step_sec;
    const p = getBodyPosition3D(body, t, false);
    let x = p.x; let y = p.y; let z = p.z;
    if (key === 'mars') x += MARS_BIAS_AU;
    // Round to reduce JSON size
    pos_au.push([
      Math.round(x * 1e9) / 1e9,
      Math.round(y * 1e9) / 1e9,
      Math.round(z * 1e9) / 1e9,
    ]);
  }
  bodies[key] = { pos_au };
}

const table = {
  version: 2,
  source: 'approx-bootstrap-v2+mars-educational-bias',
  source_note:
    'v2 expanded 2015–2055 @ 3 d step. Positions from HELIOS JPL Approximate Positions model; Mars x += 0.00015 AU educational bias for L2-plan A/B. Not SPICE/DE. Optional live Horizons inject is separate (network opt-in).',
  frame: 'HELIOS heliocentric ecliptic (physics axes, exaggerate=false)',
  t0_iso: '2015-01-01T12:00:00.000Z',
  t1_iso: '2055-01-01T12:00:00.000Z',
  t0_sim,
  step_days,
  step_sec,
  n,
  mars_bias_au: MARS_BIAS_AU,
  bodies,
  generated_at: new Date().toISOString(),
};

const outDir = resolve(ROOT, 'assets');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'ephemeris-samples-v1.json');
const json = JSON.stringify(table);
writeFileSync(outPath, json);
const mb = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(2);
console.log(`Wrote ${outPath}`);
console.log(`  knots n=${n} step=${step_days}d bodies=${names.length} size=${mb} MiB`);
if (Buffer.byteLength(json) > 2.5 * 1024 * 1024) {
  console.warn('WARNING: exceeds 2.5 MiB soft budget — increase step_days');
  process.exitCode = 1;
}
