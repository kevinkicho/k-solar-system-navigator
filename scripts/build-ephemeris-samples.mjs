/**
 * Build offline L2-plan sample tables for major planets.
 *
 * Preferred source: live JPL Horizons VECTORS series (one request per planet).
 * Fallback: HELIOS Approximate Positions bootstrap (offline, no network).
 *
 * Usage:
 *   node scripts/build-ephemeris-samples.mjs              # Horizons (network)
 *   node scripts/build-ephemeris-samples.mjs --bootstrap   # offline approx only
 *   node scripts/build-ephemeris-samples.mjs --step=3
 *
 * Durable asset: assets/ephemeris-samples-v1.json (filename kept for URL stability).
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);
const { getBodyPosition3D } = await import(pathToFileURL(resolve(ROOT, 'js/physics/kepler.js')).href);
const { DAY, J2000 } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);
const {
  fetchHorizonsSeries,
  eclipticPosToScene,
} = await import(pathToFileURL(resolve(ROOT, 'js/physics/ephemeris-horizons.js')).href);

const args = process.argv.slice(2);
const forceBootstrap = args.includes('--bootstrap') || args.includes('--source=bootstrap');
const stepArg = args.find((a) => a.startsWith('--step='));
const step_days = stepArg ? Math.max(1, Number(stepArg.split('=')[1]) || 3) : 3;

// Expanded durable window
const t0Date = Date.UTC(2015, 0, 1, 12, 0, 0);
const t1Date = Date.UTC(2055, 0, 1, 12, 0, 0);
const t0_sim = (t0Date - J2000) / 1000;
const t1_sim = (t1Date - J2000) / 1000;
const step_sec = step_days * DAY;
const nExpected = Math.floor((t1_sim - t0_sim) / step_sec) + 1;

const names = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

// Legacy educational Mars bias only for bootstrap path (A/B regression vs approx)
const MARS_BIAS_AU = 0.00015;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function round3(x) {
  return Math.round(x * 1e9) / 1e9;
}

function buildBootstrapBody(body, key) {
  const pos_au = [];
  for (let i = 0; i < nExpected; i++) {
    const t = t0_sim + i * step_sec;
    const p = getBodyPosition3D(body, t, false);
    let x = p.x; let y = p.y; let z = p.z;
    if (key === 'mars') x += MARS_BIAS_AU;
    pos_au.push([round3(x), round3(y), round3(z)]);
  }
  return { pos_au };
}

async function buildHorizonsBody(body, key) {
  console.log(`  Horizons series: ${body.name}…`);
  const { rows, url } = await fetchHorizonsSeries({
    body,
    start: t0Date,
    stop: t1Date,
    step: `${step_days} d`,
  });
  if (rows.length < 100) {
    throw new Error(`${body.name}: only ${rows.length} rows from Horizons`);
  }
  // Convert ecliptic → HELIOS scene axes; sample at expected knots if lengths differ
  const pos_au = [];
  const n = rows.length;
  for (let i = 0; i < n; i++) {
    const scene = eclipticPosToScene(rows[i]);
    pos_au.push([round3(scene.x), round3(scene.y), round3(scene.z)]);
  }
  // If Horizons returned a different count, re-grid by linear index onto nExpected
  // (Horizons step is calendar-based; length usually matches.)
  let out = pos_au;
  if (Math.abs(n - nExpected) > 2) {
    console.warn(`  ${body.name}: rows=${n} expected≈${nExpected} — resampling to ${nExpected}`);
    out = [];
    for (let i = 0; i < nExpected; i++) {
      const u = (nExpected === 1) ? 0 : i / (nExpected - 1);
      const f = u * (n - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(n - 1, i0 + 1);
      const t = f - i0;
      const a = pos_au[i0];
      const b = pos_au[i1];
      out.push([
        round3(a[0] + t * (b[0] - a[0])),
        round3(a[1] + t * (b[1] - a[1])),
        round3(a[2] + t * (b[2] - a[2])),
      ]);
    }
  }
  console.log(`  ${body.name}: ${out.length} knots  (${url.slice(0, 80)}…)`);
  return { pos_au: out, horizons_rows: n };
}

async function buildAll(source) {
  const bodies = {};
  const meta = { horizons_rows: {} };
  for (const name of names) {
    const body = BODIES.find((b) => b.name === name);
    if (!body) throw new Error(`missing body ${name}`);
    const key = name.toLowerCase();
    if (source === 'horizons') {
      const built = await buildHorizonsBody(body, key);
      bodies[key] = { pos_au: built.pos_au };
      meta.horizons_rows[key] = built.horizons_rows;
      // Be kind to Horizons API
      await sleep(1500);
    } else {
      bodies[key] = buildBootstrapBody(body, key);
    }
  }
  // Normalize n to first body length
  const n = bodies.earth.pos_au.length;
  for (const k of Object.keys(bodies)) {
    if (bodies[k].pos_au.length !== n) {
      throw new Error(`length mismatch ${k}: ${bodies[k].pos_au.length} vs ${n}`);
    }
  }
  return { bodies, n, meta };
}

let source = forceBootstrap ? 'bootstrap' : 'horizons';
let bodies;
let n;
let extraMeta = {};

if (source === 'horizons') {
  console.log(`Baking Horizons sample table ${new Date(t0Date).toISOString().slice(0, 10)} → ${new Date(t1Date).toISOString().slice(0, 10)} step=${step_days}d`);
  try {
    const out = await buildAll('horizons');
    bodies = out.bodies;
    n = out.n;
    extraMeta = out.meta;
  } catch (err) {
    console.warn('Horizons bake failed — falling back to approx bootstrap:', err?.message || err);
    source = 'bootstrap';
  }
}

if (source === 'bootstrap') {
  console.log(`Baking approx-bootstrap sample table step=${step_days}d`);
  const out = await buildAll('bootstrap');
  bodies = out.bodies;
  n = out.n;
}

const table = {
  version: 3,
  source: source === 'horizons'
    ? 'jpl-horizons-vectors-v3'
    : 'approx-bootstrap-v3+mars-educational-bias',
  source_note: source === 'horizons'
    ? 'Baked from public JPL Horizons VECTORS (heliocentric ecliptic J2000, AU), converted to HELIOS scene axes (Y↔Z). Educational offline L2-plan table — NOT SPICE kernels, NOT flight ops, NOT formal DE covariance.'
    : 'Positions from HELIOS JPL Approximate Positions model; Mars x += 0.00015 AU educational bias. Offline fallback when Horizons bake unavailable. Not SPICE/DE.',
  frame: 'HELIOS scene axes (physics, exaggerate=false); Horizons ecliptic mapped via eclipticPosToScene',
  t0_iso: new Date(t0Date).toISOString(),
  t1_iso: new Date(t1Date).toISOString(),
  t0_sim,
  step_days,
  step_sec,
  n,
  ...(source === 'bootstrap' ? { mars_bias_au: MARS_BIAS_AU } : {}),
  ...extraMeta,
  bodies,
  generated_at: new Date().toISOString(),
  bake_source: source,
};

const outDir = resolve(ROOT, 'assets');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'ephemeris-samples-v1.json');
const json = JSON.stringify(table);
writeFileSync(outPath, json);
const mb = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(2);
console.log(`Wrote ${outPath}`);
console.log(`  source=${source} knots n=${n} step=${step_days}d bodies=${names.length} size=${mb} MiB`);
if (Buffer.byteLength(json) > 2.5 * 1024 * 1024) {
  console.warn('WARNING: exceeds 2.5 MiB soft budget — increase --step=');
  process.exitCode = 1;
}
