import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pq = await import(pathToFileURL(resolve(ROOT, 'js/physics/plan-quality.js')).href);
const asy = await import(pathToFileURL(resolve(ROOT, 'js/physics/departure-asymptote.js')).href);
const { AU } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ PLAN QUALITY GATES ━━━');

const empty = pq.runQualityGates(null);
check('null td fails', empty.status === 'fail' && empty.mission_ready === false);

const goodTd = {
  body1: { name: 'Earth' },
  body2: { name: 'Mars' },
  lambertOk: true,
  longWay: false,
  orbitPhysical: { a: 1.2 * AU, e: 0.2 }, // peri = 0.96 AU
  dvTotal_lambert: 6000,
  departureSimTime: 0,
  arrivalSimTime: 200 * 86400,
  transferTime: 200 * 86400,
};
const goodMeas = {
  capability: { applicable: true },
  margin: { feasible: true, kind: 'dv' },
};
const pass = pq.runQualityGates(goodTd, goodMeas);
check('good single-leg pass', pass.status === 'pass' && pass.mission_ready === true);
check('good conf 100', pass.confidence_0_100 === 100);

const sunGrazer = {
  ...goodTd,
  orbitPhysical: { a: 0.5 * AU, e: 0.9 }, // peri = 0.05 AU
};
const badPeri = pq.runQualityGates(sunGrazer, goodMeas);
check('sun-grazer fails', badPeri.status === 'fail');
check('has G_PERIHELION fail', badPeri.gates.some((g) => g.code === 'G_PERIHELION' && g.level === 'fail'));

const noLambert = { ...goodTd, lambertOk: false, orbitPhysical: null };
const hoh = pq.runQualityGates(noLambert, goodMeas);
check('no Lambert fails mission_ready', hoh.mission_ready === false);

const vehBad = pq.runQualityGates(goodTd, {
  capability: { applicable: true },
  margin: { feasible: false, kind: 'dv', reason: 'short' },
});
check('vehicle margin fail', vehBad.status === 'fail');

const vehNA = pq.runQualityGates(goodTd, {
  capability: { applicable: false, reason: 'non-Earth' },
  margin: { feasible: false },
});
check('vehicle N/A fail', vehNA.status === 'fail');

const multiBad = {
  isMultiLeg: true,
  body1: { name: 'Earth' },
  body2: { name: 'Jupiter' },
  legs: [{ ok: true, from: 'Earth', to: 'Venus' }, { ok: true, from: 'Venus', to: 'Jupiter' }],
  flybys: [{ body: 'Venus', achievable: false }],
  allLegsOk: true,
};
const mBad = pq.runQualityGates(multiBad, goodMeas);
check('TOO SHARP flyby fails plan', mBad.status === 'fail');
check('G_FLYBY_ALL fail', mBad.gates.some((g) => g.code === 'G_FLYBY_ALL' && g.level === 'fail'));

const multiOk = {
  isMultiLeg: true,
  body1: { name: 'Earth' },
  body2: { name: 'Jupiter' },
  legs: [{ ok: true }, { ok: true }],
  flybys: [{ body: 'Venus', achievable: true }],
  allLegsOk: true,
};
const mOk = pq.runQualityGates(multiOk, goodMeas);
check('good multi-leg pass', mOk.status === 'pass');

const adj = pq.runQualityGates(goodTd, goodMeas, { dateAdjusted: true });
check('date adjust → warn status', adj.status === 'pass_with_warnings');
check('mission still ready on warn', adj.mission_ready === true);

const rec = pq.recoveryFromGates(badPeri.gates, sunGrazer);
check('recovery suggests window', rec.actions.some((a) => a.id === 'find_nearest_window'));

// Asymptote
const ang = asy.asymptoteAnglesFromVinf([3000, 1000, 0]);
check('asymptote finite DLA', ang && isFinite(ang.dla_ecliptic_deg));
check('asymptote frame labeled', /ecliptic/i.test(ang.frame));

if (failed) {
  console.error(`\n${failed} plan quality checks failed`);
  process.exit(1);
}
console.log('\nAll plan quality checks passed');
