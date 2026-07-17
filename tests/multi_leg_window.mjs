// Offline multi-leg window search (sync pure path).

import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);
const { DAY, J2000 } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);
const { findMultiLegWindow: reExport, solveMultiLegRoute } = await import(
  pathToFileURL(resolve(ROOT, 'js/physics/routing.js')).href
);
const {
  findMultiLegWindow,
  ML_N_DEP,
  evaluateMultiLegWindowCandidate,
} = await import(pathToFileURL(resolve(ROOT, 'js/physics/multi-leg-window-search.js')).href);

let passed = 0, failed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n━━━ MULTI-LEG WINDOW SEARCH ━━━');

const Earth = BODIES.find((b) => b.name === 'Earth');
const Mars = BODIES.find((b) => b.name === 'Mars');
const Jupiter = BODIES.find((b) => b.name === 'Jupiter');
const Venus = BODIES.find((b) => b.name === 'Venus');

check('ML_N_DEP 36', ML_N_DEP === 36);
check('routing re-export bound', typeof reExport === 'function');
check('solveMultiLegRoute available', typeof solveMultiLegRoute === 'function');

const depHint = (Date.UTC(2031, 0, 10) - J2000) / 1000;
const flybyHints = [
  { body: Mars, simTime: (Date.UTC(2031, 9, 1) - J2000) / 1000 },
];

// Empty hints → null
check('empty hints null', findMultiLegWindow(Earth, Jupiter, [], depHint) === null);

// Small progress grid for speed in CI
let progressHits = 0;
const best = findMultiLegWindow(Earth, Jupiter, flybyHints, depHint, {}, {
  nDep: 8,
  nFb: 6,
  onProgress: () => { progressHits++; },
});
check('progress columns', progressHits === 8, `hits=${progressHits}`);
check(
  'best null or finite dv',
  best === null || (isFinite(best.dvTotal) && best.flybyTimes?.length === 1),
);
if (best) {
  check('best arr > dep', best.arrivalSimTime > best.departureSimTime);
  check('flyby between dep and arr',
    best.flybyTimes[0] > best.departureSimTime
    && best.flybyTimes[0] < best.arrivalSimTime);
}

// Venus-Mars via Venus style
const dep2 = (Date.UTC(2027, 0, 10) - J2000) / 1000;
const best2 = findMultiLegWindow(
  Earth,
  Mars,
  [{ body: Venus, simTime: (Date.UTC(2027, 5, 15) - J2000) / 1000 }],
  dep2,
  {},
  { nDep: 6, nFb: 4 },
);
check('venus assist search completes', best2 === null || isFinite(best2.dvTotal));

// re-export parity on tiny grid
const a = findMultiLegWindow(Earth, Jupiter, flybyHints, depHint, {}, { nDep: 4, nFb: 3 });
const b = reExport(Earth, Jupiter, flybyHints, depHint, {}, { nDep: 4, nFb: 3 });
check(
  're-export matches',
  (a === null && b === null)
    || (a && b && Math.abs(a.dvTotal - b.dvTotal) < 1e-3),
);

// cancel
const cancelled = findMultiLegWindow(Earth, Jupiter, flybyHints, depHint, {}, {
  nDep: 20,
  shouldCancel: () => true,
});
check('shouldCancel → null', cancelled === null);

// evaluate candidate returns null or object
const cand = evaluateMultiLegWindowCandidate(
  Earth, Jupiter, flybyHints, depHint, 100 * DAY, 1.0, {},
);
check(
  'candidate shape',
  cand === null || (isFinite(cand.dvTotal) && cand.flybyTimes?.length === 1),
);

console.log(`\nMulti-leg window: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
