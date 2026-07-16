// Multi-leg window search golden seeds (design PR 14).

import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { DAY, J2000 } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);
const routing = await import(pathToFileURL(resolve(ROOT, 'js/physics/routing.js')).href);
const { hohmannTransfer } = await import(pathToFileURL(resolve(ROOT, 'js/physics/kepler.js')).href);

const earth = BODIES.find(b => b.name === 'Earth');
const venus = BODIES.find(b => b.name === 'Venus');
const mars = BODIES.find(b => b.name === 'Mars');
const jupiter = BODIES.find(b => b.name === 'Jupiter');

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

function simFromUTC(y, m, d) {
  return (Date.UTC(y, m - 1, d, 12) - J2000) / 1000;
}

function evalRoute(origin, dest, dep, flybyBody, flybySim) {
  const h = hohmannTransfer(flybyBody, dest, flybySim);
  const wps = [
    { body: origin, simTime: dep },
    { body: flybyBody, simTime: flybySim },
    { body: dest, simTime: flybySim + h.transferTime },
  ];
  return routing.solveMultiLegRoute(wps);
}

console.log('\n━━━ MULTI-LEG WINDOW SEEDS ━━━');

// Seed A: EVM early flyby (bad) → search should improve
{
  const dep = simFromUTC(2027, 1, 10);
  const badFb = simFromUTC(2027, 1, 25);
  const seed = evalRoute(earth, mars, dep, venus, badFb);
  const seedCost = seed.allLegsOk && seed.flybys.every(f => f.achievable)
    ? seed.dvTotalMultiLeg : Infinity;

  const win = routing.findMultiLegWindow(
    earth, mars,
    [{ body: venus, simTime: badFb }],
    dep,
  );
  check('Seed A search returns something', !!win);
  if (win) {
    const result = evalRoute(earth, mars, win.departureSimTime, venus, win.flybyTimes[0]);
    const ok = result.allLegsOk && result.flybys.every(f => f.achievable);
    check('Seed A post-search feasible', ok);
    if (ok && isFinite(seedCost)) {
      check('Seed A cost ≤ seed or seed was bad', result.dvTotalMultiLeg <= seedCost * 1.05 + 100
        || !isFinite(seedCost),
        `seed=${(seedCost/1000).toFixed(2)} result=${(result.dvTotalMultiLeg/1000).toFixed(2)} km/s`);
    } else if (ok) {
      check('Seed A rescued infeasible seed', true);
    }
  }
}

// Seed B: EMJ early flyby
{
  const dep = simFromUTC(2031, 1, 10);
  const badFb = simFromUTC(2031, 2, 1);
  const seed = evalRoute(earth, jupiter, dep, mars, badFb);
  const seedCost = seed.allLegsOk && seed.flybys.every(f => f.achievable)
    ? seed.dvTotalMultiLeg : Infinity;

  const win = routing.findMultiLegWindow(
    earth, jupiter,
    [{ body: mars, simTime: badFb }],
    dep,
  );
  check('Seed B search returns something', !!win);
  if (win) {
    const result = evalRoute(earth, jupiter, win.departureSimTime, mars, win.flybyTimes[0]);
    const ok = result.allLegsOk && result.flybys.every(f => f.achievable);
    check('Seed B post-search feasible', ok,
      ok ? `Δv=${(result.dvTotalMultiLeg/1000).toFixed(2)} km/s` : 'infeasible');
    if (ok && isFinite(seedCost)) {
      check('Seed B improved or comparable', result.dvTotalMultiLeg <= seedCost * 1.1 + 500);
    }
  }
}

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll multi-leg window seed checks passed');
