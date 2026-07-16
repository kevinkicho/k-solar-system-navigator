// Validates that the refactored ES modules under js/ produce the expected
// numeric outputs and meet performance budgets. Unlike trip_planning_test.mjs
// (which inlines its own math), this test imports the production modules
// directly — so it catches wiring breakage from refactors.
//
// Checks:
//   1. Module load — every js/* module under physics/, data/, constants resolves
//   2. Physics accuracy — Hohmann references, Lambert convergence
//   3. Multi-leg routing — VEEGA-style route solves with per-flyby feasibility
//   4. Performance budgets (SOFT) — Lambert / multi-leg / body-pos throughput
//      are informational only: a miss prints ⚠ but does not fail the process.
//      Soft floors also live in tests/perf_budgets.mjs (always exit 0).
//      CI primary gate remains correctness (sections 1–3).
//
// Note: scene/, ui/, animation modules require a DOM, so they're excluded.

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve as pathResolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathResolve(__dirname, '..');

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '   ' + detail : ''}`);
}
/** Soft budget: never contributes to process exit failure (CI-safe on GH runners). */
function softCheck(label, ok, detail = '') {
  results.push({ label, ok: true, soft: !ok });
  console.log(`  ${ok ? '✓' : '⚠ SOFT'} ${label}${detail ? '   ' + detail : ''}`);
}
function section(s) { console.log('\n━━━ ' + s + ' ━━━'); }

// ---- 1. Module loading ----
section('1. MODULE LOAD');
const importMod = (rel) => import(pathToFileURL(pathResolve(ROOT, rel)).href);

const constants = await importMod('js/constants.js');
check('constants.js loads', !!constants.AU && !!constants.G_CONST,
      `AU=${constants.AU.toExponential(3)}`);

const bodies = await importMod('js/data/bodies.js');
check('data/bodies.js loads', bodies.BODIES.length === 8 && bodies.SUN_DATA.mass > 0,
      `${bodies.BODIES.length} planets`);

const moons = await importMod('js/data/moons.js');
check('data/moons.js loads (~30 moons, sorted, M0 spread)',
      moons.MOONS.length >= 25 && moons.MOONS[0].displayOrbit > 0 && moons.MOONS[0].M0 !== undefined);

const spacecraft = await importMod('js/data/spacecraft.js');
check('data/spacecraft.js loads (5 probes)', spacecraft.SPACECRAFT.length === 5);

const vec3 = await importMod('js/physics/vec3.js');
check('physics/vec3.js dot/cross/mag',
      vec3.v3dot([1,2,3],[4,5,6]) === 32 && vec3.v3mag([3,4,0]) === 5);

const kepler = await importMod('js/physics/kepler.js');
check('physics/kepler.js loads', typeof kepler.solveKepler === 'function');

const helio = await importMod('js/physics/helio.js');
check('physics/helio.js loads', typeof helio.buildHelioOrbit === 'function');

const lambert = await importMod('js/physics/lambert.js');
check('physics/lambert.js loads', typeof lambert.solveLambertProblem === 'function');

const ga = await importMod('js/physics/gravity-assist.js');
check('physics/gravity-assist.js loads', typeof ga.gravityAssistInfo === 'function');

const routing = await importMod('js/physics/routing.js');
check('physics/routing.js loads', typeof routing.solveTransferOrbit === 'function');

const state = await importMod('js/state.js');
check('state.js loads with mission/bodyPositions', state.state.mission && state.state.bodyPositions);

// ---- 2. Physics accuracy ----
section('2. PHYSICS ACCURACY');
const { AU, DAY, G_CONST, J2000 } = constants;
const { BODIES, SUN_DATA } = bodies;
const earth = BODIES.find(b => b.name === 'Earth');
const mars  = BODIES.find(b => b.name === 'Mars');
const venus = BODIES.find(b => b.name === 'Venus');
const jupiter = BODIES.find(b => b.name === 'Jupiter');

// Hohmann references against textbook values.
{
  const h = kepler.hohmannTransfer(earth, mars, 0);
  const tofDays = h.transferTime / DAY;
  const dvKms = h.dvTotal / 1000;
  // Textbook Hohmann Earth→Mars: 258.8 d, 5.59 km/s.
  check(`Hohmann Earth→Mars TOF ≈ 258.8d (got ${tofDays.toFixed(1)}d)`,
        Math.abs(tofDays - 258.8) < 5);
  check(`Hohmann Earth→Mars Δv ≈ 5.6 km/s (got ${dvKms.toFixed(2)})`,
        Math.abs(dvKms - 5.6) < 0.3);
}

{
  const h = kepler.hohmannTransfer(earth, venus, 0);
  // Textbook Earth→Venus: ~146 d, ~5.2 km/s.
  check(`Hohmann Earth→Venus TOF ≈ 146d (got ${(h.transferTime/DAY).toFixed(1)}d)`,
        Math.abs(h.transferTime/DAY - 146) < 5);
  check(`Hohmann Earth→Venus Δv ≈ 5.2 km/s (got ${(h.dvTotal/1000).toFixed(2)})`,
        Math.abs(h.dvTotal/1000 - 5.2) < 0.3);
}

// Lambert solver: solve Earth→Mars at a known feasible date and check the
// orbit closes (propagating r1+v1 by tof should land within 1000 km of r2).
{
  const dep = (Date.UTC(2026, 11, 1) - J2000) / 1000;
  const tof = 258 * DAY;
  const arr = dep + tof;
  const p1 = kepler.getBodyPosition3D(earth, dep, false);
  const p2 = kepler.getBodyPosition3D(mars, arr, false);
  const r1 = [p1.x*AU, p1.y*AU, p1.z*AU];
  const r2 = [p2.x*AU, p2.y*AU, p2.z*AU];
  const sol = lambert.solveLambertProblem(r1, r2, tof, G_CONST * SUN_DATA.mass);
  check('Lambert Earth→Mars 2026-12-01 returns solution', sol !== null);
  if (sol) {
    const orb = helio.buildTransferOrbit(r1, sol.v1, G_CONST * SUN_DATA.mass);
    const hit = helio.propagateOrbit(orb, tof);
    const miss_km = vec3.v3mag(vec3.v3sub(hit, r2)) / 1000;
    // Solver convergence target is `1e-8 · sqrt(mu) · tof` (sub-meter at
    // these distances); 10 km gives ample margin without claiming false
    // precision.
    check(`Lambert orbit closes (miss=${miss_km.toFixed(2)} km < 10)`, miss_km < 10);
  }
}

// Hyperbolic spacecraft propagation — Voyager 1 distance at 2026-01-01 ~ 168 AU.
{
  const sc = spacecraft.SPACECRAFT[0]; // Voyager 1
  const t2026 = (Date.UTC(2026, 0, 1) - J2000) / 1000;
  const p = helio.getSpacecraftPosition(sc, t2026);
  const r = Math.sqrt(p.x*p.x + p.y*p.y + p.z*p.z);
  // NASA tracking: Voyager 1 ≈ 168 AU at 2026-01-01.
  check(`Voyager 1 distance @ 2026-01-01 ≈ 168 AU (got ${r.toFixed(1)} AU)`,
        Math.abs(r - 168) < 5);
}

// Barycentric-frame closure: with all positions in the bary frame
// (planet bary = planet helio + sunOff, sun bary = sunOff), the mass-weighted
// centroid must sit at the origin.
{
  const sunOff = kepler.getSunBarycentricOffset(0, false);
  let sx = SUN_DATA.mass * sunOff.x, sy = SUN_DATA.mass * sunOff.y, sz = SUN_DATA.mass * sunOff.z;
  let mTotal = SUN_DATA.mass;
  for (const b of BODIES) {
    const p = kepler.getBodyPosition3D(b, 0, false);
    sx += b.mass * (p.x + sunOff.x);
    sy += b.mass * (p.y + sunOff.y);
    sz += b.mass * (p.z + sunOff.z);
    mTotal += b.mass;
  }
  const cmAU = Math.sqrt(sx*sx + sy*sy + sz*sz) / mTotal;
  check(`barycentric centroid at origin < 1e-12 AU (got ${cmAU.toExponential(2)})`, cmAU < 1e-12);
}

// ---- 3. Multi-leg routing ----
section('3. MULTI-LEG ROUTING');
{
  // Earth → Venus → Mars (gravity assist). Pick dates roughly aligned.
  const depSim = (Date.UTC(2027, 0, 10) - J2000) / 1000;
  const venusFlyby = depSim + 156 * DAY;
  const marsArrive = venusFlyby + 300 * DAY;
  const td = routing.solveMultiLegRoute([
    { body: earth, simTime: depSim },
    { body: venus, simTime: venusFlyby },
    { body: mars,  simTime: marsArrive },
  ]);
  check('multi-leg structure has legs+maneuvers+flybys',
        td.legs.length === 2 && td.maneuvers.length === 3 && td.flybys.length === 1);
  check('all legs Lambert-solved', td.allLegsOk);
  if (td.flybys[0]) {
    const fb = td.flybys[0];
    check(`Venus flyby has finite turning angle (got ${(fb.turningAngle * 180/Math.PI).toFixed(1)}°)`,
          isFinite(fb.turningAngle));
    check(`Venus flyby reports achievability flag`, typeof fb.achievable === 'boolean');
  }
}

// ---- 4. Performance budgets (SOFT — do not fail CI) ----
section('4. PERFORMANCE (soft / informational)');
{
  // Lambert solver throughput (single-leg, stable Earth→Mars geometry).
  // Soft target ≥10k/s on a modern desktop; GH runners often miss this.
  const dep = (Date.UTC(2026, 11, 1) - J2000) / 1000;
  const tof = 258 * DAY;
  const p1 = kepler.getBodyPosition3D(earth, dep, false);
  const p2 = kepler.getBodyPosition3D(mars, dep + tof, false);
  const r1 = [p1.x*AU, p1.y*AU, p1.z*AU];
  const r2 = [p2.x*AU, p2.y*AU, p2.z*AU];
  const mu = G_CONST * SUN_DATA.mass;
  const N = 10000;
  const t0 = performance.now();
  let solved = 0;
  for (let i = 0; i < N; i++) {
    const sol = lambert.solveLambertProblem(r1, r2, tof, mu);
    if (sol) solved++;
  }
  const elapsed = performance.now() - t0;
  const rate = N / (elapsed / 1000);
  softCheck(`Lambert throughput ≥ 10k/s (got ${rate.toFixed(0)}/s, ${solved}/${N} solved)`,
        rate >= 10000 && solved === N);
}

{
  // Multi-leg solve time budget (Earth → Venus → Earth → Jupiter VEEGA).
  const depSim = (Date.UTC(2029, 9, 15) - J2000) / 1000;
  const wps = [
    { body: earth,   simTime: depSim },
    { body: venus,   simTime: depSim + 172 * DAY },
    { body: earth,   simTime: depSim + 462 * DAY },
    { body: jupiter, simTime: depSim + 1157 * DAY },
  ];
  const N = 1000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) routing.solveMultiLegRoute(wps);
  const ms = (performance.now() - t0) / N;
  softCheck(`Multi-leg solve ≤ 10ms (got ${ms.toFixed(2)} ms)`, ms <= 10);
}

{
  // Body position throughput — animate loop calls this 8× per frame.
  const N = 100000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    kepler.getBodyPosition3D(earth, i * DAY, true);
  }
  // performance.now() returns ms. (ms / N) * 1000 = μs per call.
  const us = (performance.now() - t0) / N * 1000;
  softCheck(`getBodyPosition3D < 5μs/call (got ${us.toFixed(2)} μs)`, us < 5);
}

// ---- Summary ----
console.log('\n━━━ SUMMARY ━━━\n');
const pass = results.filter(r => r.ok).length;
const fail = results.length - pass;
console.log(`${pass}/${results.length} passed${fail ? ` · ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
