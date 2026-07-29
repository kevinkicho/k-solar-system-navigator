/**
 * Bake offline HELIOS moon sample table (parent-relative AU, scene axes).
 * Used for denser planet-relative planning honesty when parents use sample-DE.
 *
 * Output: assets/ephemeris-moons-v1.json
 * Educational — not SPICE satellite SPKs.
 */
import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { DAY, J2000 } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);
const { MOONS } = await import(pathToFileURL(resolve(ROOT, 'js/data/moons.js')).href);
const { getMoonRelativePositionAU } = await import(pathToFileURL(resolve(ROOT, 'js/physics/kepler.js')).href);

// Short-period moons (Phobos, Deimos, Enceladus) are NOT baked here —
// multi-day steps undersample orbits and destroy km accuracy. Use continuous
// Kepler or the dense SPICE Mars table (build-mars-moons-spice.py).
const NAMES = ['Moon', 'Io', 'Europa', 'Ganymede', 'Callisto', 'Titan', 'Triton'];
// 1 d for slow moons (size budget)
const step_days = 1;
const t0Date = Date.UTC(2015, 0, 1, 12);
const t1Date = Date.UTC(2055, 0, 1, 12);
const t0_sim = (t0Date - J2000) / 1000;
const t1_sim = (t1Date - J2000) / 1000;
const step_sec = step_days * DAY;
const n = Math.floor((t1_sim - t0_sim) / step_sec) + 1;

function round9(x) {
  return Math.round(x * 1e12) / 1e12;
}

const bodies = {};
for (const name of NAMES) {
  const moon = MOONS.find((m) => m.name === name);
  if (!moon) {
    console.warn('skip missing', name);
    continue;
  }
  const key = name.toLowerCase();
  const pos_au = [];
  for (let i = 0; i < n; i++) {
    const t = t0_sim + i * step_sec;
    const p = getMoonRelativePositionAU(moon, t);
    pos_au.push([round9(p.x), round9(p.y), round9(p.z)]);
  }
  bodies[key] = {
    parent: moon.parent.toLowerCase(),
    pos_au_parent_relative: pos_au,
  };
  console.log(`  ${name}: ${n} knots parent=${moon.parent}`);
}

const table = {
  version: 1,
  source: 'helios-kepler-moons-v1',
  bake_source: 'kepler-moon-relative',
  source_note:
    'Parent-relative moon positions from HELIOS Kepler moon model (not SPICE SPK). '
    + 'Combined with planet sample-DE/approx parent heliocentric state for planet-relative routes. '
    + 'EDUCATIONAL — not flight OD.',
  frame: 'parent-centered AU, HELIOS scene axes',
  t0_iso: new Date(t0Date).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  t1_iso: new Date(t1Date).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  t0_sim,
  step_days,
  step_sec,
  n,
  bodies,
  generated_at: new Date().toISOString(),
  flight_ops_certified: false,
};

const out = resolve(ROOT, 'assets/ephemeris-moons-v1.json');
const raw = JSON.stringify(table);
writeFileSync(out, raw);
const mb = Buffer.byteLength(raw) / (1024 * 1024);
console.log(`Wrote ${out}  ${(mb).toFixed(2)} MiB  moons=${Object.keys(bodies).length}`);
if (mb > 8) {
  console.warn('WARNING: moon table large');
  process.exit(1);
}
