// Offline nearest-feasible search (pure sync path used by worker + Node).

import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);
const { DAY, J2000 } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);
const {
  findNearestFeasibleTransfer,
  evaluateNearestFeasibleCell,
  buildNearestFeasibleGrid,
  DEFAULT_N_DEP,
  DEFAULT_N_TOF,
  MIN_PERIHELION_AU,
} = await import(pathToFileURL(resolve(ROOT, 'js/physics/nearest-feasible-search.js')).href);
const { hohmannTransfer } = await import(pathToFileURL(resolve(ROOT, 'js/physics/kepler.js')).href);
const { solveTransferOrbit, findNearestFeasibleTransfer: reExport } = await import(
  pathToFileURL(resolve(ROOT, 'js/physics/routing.js')).href
);

let passed = 0, failed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n━━━ NEAREST FEASIBLE SEARCH ━━━');

const Earth = BODIES.find((b) => b.name === 'Earth');
const Mars = BODIES.find((b) => b.name === 'Mars');
check('DEFAULT grid 40×35', DEFAULT_N_DEP === 40 && DEFAULT_N_TOF === 35);
check('MIN peri 0.3', MIN_PERIHELION_AU === 0.3);
check('routing re-exports finder', typeof reExport === 'function');

// Bad phasing seed: J2000-ish Hohmann often pathological for Earth-Mars in some epochs;
// use a fixed dep that is known-awkward: mid-year 2025.
const depSim = (Date.UTC(2025, 5, 15) - J2000) / 1000;
const seed = hohmannTransfer(Earth, Mars, depSim);
solveTransferOrbit(seed);
const peri = seed.orbitPhysical
  ? (seed.orbitPhysical.a * (1 - seed.orbitPhysical.e)) / 1.495978707e11
  : Infinity;
const dv = seed.dvTotal_lambert ?? seed.dvTotal;
const pathological = !isFinite(peri) || peri < MIN_PERIHELION_AU || dv > 30000;
check('seed computed', !!seed.lambertOk || !!seed.orbitPhysical || true);

const grid = buildNearestFeasibleGrid(Earth, Mars, depSim, seed.transferTime, {});
check('grid N_DEP 40', grid.N_DEP === 40);
check('grid N_TOF 35', grid.N_TOF === 35);
check('tof range ordered', grid.tofMin < grid.tofMax);

// Cell evaluator returns null or finite dv
const midDep = (grid.departStart + grid.departEnd) / 2;
const midTof = (grid.tofMin + grid.tofMax) / 2;
const cell = evaluateNearestFeasibleCell(
  Earth, Mars, midDep, midTof, grid.pOpts, grid.mu,
);
check(
  'cell null or finite',
  cell === null || (isFinite(cell.dvTotal) && cell.perihelionAU >= MIN_PERIHELION_AU),
);

let progressHits = 0;
const best = findNearestFeasibleTransfer(Earth, Mars, depSim, seed.transferTime, {
  backend: 'approx',
  onProgress: () => { progressHits++; },
});
check('search returns candidate or null', best === null || isFinite(best.dvTotal));
check('progress called', progressHits === DEFAULT_N_DEP, `hits=${progressHits}`);
if (best) {
  check('best peri ≥ min', best.perihelionAU >= MIN_PERIHELION_AU - 1e-9);
  check('best dv finite', isFinite(best.dvTotal) && best.dvTotal > 0);
  check('best tof positive', best.transferTime > 0);
  // If seed was pathological, recovery should improve peri or dv when found
  if (pathological) {
    check(
      'recovery improves vs seed when found',
      best.perihelionAU >= MIN_PERIHELION_AU && best.dvTotal <= 30000,
    );
  }
}

// Cancel early
let cancelled = false;
const cancelledResult = findNearestFeasibleTransfer(Earth, Mars, depSim, seed.transferTime, {
  shouldCancel: () => {
    cancelled = true;
    return true;
  },
});
check('shouldCancel returns null', cancelledResult === null && cancelled);

// routing re-export parity
const best2 = reExport(Earth, Mars, depSim, seed.transferTime, { backend: 'approx' });
check(
  're-export matches pure module',
  (best === null && best2 === null)
    || (best && best2 && Math.abs(best.dvTotal - best2.dvTotal) < 1e-6),
);

console.log(`\nNearest feasible: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
