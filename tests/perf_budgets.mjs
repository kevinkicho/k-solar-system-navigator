// Soft / informational performance budgets (design PR 18).
//
// Never fails CI: always exits 0. Throughput varies wildly on GitHub runners
// and shared hosts. Correctness stays gated by trip_planning_test,
// module_integration accuracy sections, etc.
//
// Thresholds are intentionally loose "smoke" floors for local desktops.
// Measured baselines (local desktop, Windows) are recorded in README.md.

import { statSync } from 'fs';
import { dirname, resolve as pathResolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathResolve(__dirname, '..');
const importMod = (rel) => import(pathToFileURL(pathResolve(ROOT, rel)).href);

const MACHINE_CLASS = 'local desktop (Windows)';

// Soft floors — informational only. GH runners may miss these.
const BUDGETS = {
  starsBytesMax: 2.5 * 1024 * 1024,       // stars-mag75.json cold-load size
  ephSamplesBytesMax: 2.5 * 1024 * 1024,  // ephemeris-samples-v1.json L2-plan soft budget
  lambertSolvesPerSec: 2000,              // soft; GH runners often ~1–5k
  multiLegMsMax: 50,                      // soft upper bound per VEEGA solve
  bodyPosUsMax: 50,                       // soft μs/call
  firstRouteMsMax: 100,                   // cold planning path (module load excluded)
};

let softFails = 0;
let softPasses = 0;

function soft(label, ok, detail = '') {
  if (ok) softPasses++;
  else softFails++;
  const mark = ok ? '✓' : '⚠ SOFT';
  console.log(`  ${mark} ${label}${detail ? '   ' + detail : ''}`);
}

function section(s) { console.log('\n━━━ ' + s + ' ━━━'); }

console.log('HELIOS soft performance budgets (informational — exit always 0)');
console.log(`Machine class note: baselines in README were measured on ${MACHINE_CLASS}`);

// ---- Asset sizes (cold-load) ----
section('1. COLD-LOAD ASSETS');
{
  const starsPath = pathResolve(ROOT, 'assets/stars-mag75.json');
  const bytes = statSync(starsPath).size;
  const kb = (bytes / 1024).toFixed(1);
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  soft(
    `stars-mag75.json ≤ ${(BUDGETS.starsBytesMax / (1024 * 1024)).toFixed(1)} MiB`,
    bytes <= BUDGETS.starsBytesMax,
    `got ${kb} KiB (${mb} MiB, ${bytes} bytes)`,
  );
  try {
    const ephPath = pathResolve(ROOT, 'assets/ephemeris-samples-v1.json');
    const eb = statSync(ephPath).size;
    soft(
      `ephemeris-samples-v1.json ≤ 2.5 MiB`,
      eb <= BUDGETS.ephSamplesBytesMax,
      `got ${(eb / 1024).toFixed(1)} KiB`,
    );
  } catch {
    soft('ephemeris-samples-v1.json present', false, 'missing asset');
  }
}

// ---- Planning path throughput ----
section('2. PLANNING PATH (soft)');
const constants = await importMod('js/constants.js');
const bodies = await importMod('js/data/bodies.js');
const kepler = await importMod('js/physics/kepler.js');
const lambert = await importMod('js/physics/lambert.js');
const routing = await importMod('js/physics/routing.js');

const { AU, DAY, G_CONST, J2000 } = constants;
const earth = bodies.BODIES.find(b => b.name === 'Earth');
const mars = bodies.BODIES.find(b => b.name === 'Mars');
const venus = bodies.BODIES.find(b => b.name === 'Venus');
const jupiter = bodies.BODIES.find(b => b.name === 'Jupiter');
const mu = G_CONST * bodies.SUN_DATA.mass;

{
  // Cold-ish first Earth→Mars route (no warmup) — proxy for time-to-first-route.
  const depSim = (Date.UTC(2026, 11, 1) - J2000) / 1000;
  const wps = [
    { body: earth, simTime: depSim },
    { body: mars, simTime: depSim + 258 * DAY },
  ];
  const t0 = performance.now();
  const route = routing.solveMultiLegRoute(wps);
  const ms = performance.now() - t0;
  soft(
    `First Earth→Mars route ≤ ${BUDGETS.firstRouteMsMax} ms`,
    ms <= BUDGETS.firstRouteMsMax && !!route,
    `got ${ms.toFixed(2)} ms (solved=${!!route})`,
  );
}

{
  // Lambert throughput after brief warmup.
  const dep = (Date.UTC(2026, 11, 1) - J2000) / 1000;
  const tof = 258 * DAY;
  const p1 = kepler.getBodyPosition3D(earth, dep, false);
  const p2 = kepler.getBodyPosition3D(mars, dep + tof, false);
  const r1 = [p1.x * AU, p1.y * AU, p1.z * AU];
  const r2 = [p2.x * AU, p2.y * AU, p2.z * AU];
  for (let i = 0; i < 100; i++) lambert.solveLambertProblem(r1, r2, tof, mu);
  const N = 5000;
  const t0 = performance.now();
  let solved = 0;
  for (let i = 0; i < N; i++) {
    if (lambert.solveLambertProblem(r1, r2, tof, mu)) solved++;
  }
  const elapsed = performance.now() - t0;
  const rate = N / (elapsed / 1000);
  soft(
    `Lambert ≥ ${BUDGETS.lambertSolvesPerSec}/s (soft)`,
    rate >= BUDGETS.lambertSolvesPerSec && solved === N,
    `got ${rate.toFixed(0)}/s, ${solved}/${N} solved`,
  );
}

{
  const depSim = (Date.UTC(2029, 9, 15) - J2000) / 1000;
  const wps = [
    { body: earth, simTime: depSim },
    { body: venus, simTime: depSim + 172 * DAY },
    { body: earth, simTime: depSim + 462 * DAY },
    { body: jupiter, simTime: depSim + 1157 * DAY },
  ];
  for (let i = 0; i < 20; i++) routing.solveMultiLegRoute(wps);
  const N = 200;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) routing.solveMultiLegRoute(wps);
  const ms = (performance.now() - t0) / N;
  soft(
    `Multi-leg VEEGA ≤ ${BUDGETS.multiLegMsMax} ms (soft)`,
    ms <= BUDGETS.multiLegMsMax,
    `got ${ms.toFixed(3)} ms/route`,
  );
}

{
  const N = 50000;
  for (let i = 0; i < 1000; i++) kepler.getBodyPosition3D(earth, i * DAY, true);
  const t0 = performance.now();
  for (let i = 0; i < N; i++) kepler.getBodyPosition3D(earth, i * DAY, true);
  const us = (performance.now() - t0) / N * 1000;
  soft(
    `getBodyPosition3D < ${BUDGETS.bodyPosUsMax} μs (soft)`,
    us < BUDGETS.bodyPosUsMax,
    `got ${us.toFixed(2)} μs/call`,
  );
}

console.log('\n━━━ SUMMARY ━━━\n');
console.log(
  `${softPasses} soft-pass · ${softFails} soft-miss`
  + '  (informational only — exit 0 always)',
);
console.log(
  'CI primary gate is correctness. See README Performance baselines for measured numbers.',
);
process.exit(0);
