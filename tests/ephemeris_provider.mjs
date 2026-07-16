import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prov = await import(pathToFileURL(resolve(ROOT, 'js/physics/ephemeris-provider.js')).href);
const sample = await import(pathToFileURL(resolve(ROOT, 'js/physics/ephemeris-sample.js')).href);
const kepler = await import(pathToFileURL(resolve(ROOT, 'js/physics/kepler.js')).href);
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);
const { solveTransferOrbit } = await import(pathToFileURL(resolve(ROOT, 'js/physics/routing.js')).href);
const { hohmannTransfer } = kepler;
const { DAY, J2000 } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ EPHEMERIS PROVIDER ━━━');

check('resolve default approx', prov.resolveBackend(undefined, {}) === 'approx');
check('classroom forces approx', prov.resolveBackend('sample-de', { classroomMode: true }) === 'approx');
check('sample requested ok', prov.resolveBackend('sample-de', {}) === 'sample-de');

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const t = (Date.UTC(2026, 5, 1, 12) - J2000) / 1000;

// Load real asset
const table = JSON.parse(readFileSync(resolve(ROOT, 'assets/ephemeris-samples-v1.json'), 'utf8'));
sample.setSampleTableForTests(table);

check('sample available mid window', sample.sampleAvailable(earth, t) === true);
check('sample OOR past', sample.sampleAvailable(earth, t0TooOld()) === false);

function t0TooOld() {
  return table.t0_sim - 365 * DAY;
}

const pK = kepler.getBodyPosition3D(earth, t, false);
const pA = prov.getPlanningPosition3D(earth, t, { backend: 'approx' });
check('approx provider ≡ kepler', Math.hypot(pK.x - pA.x, pK.y - pA.y, pK.z - pA.z) < 1e-15);

const pS = prov.getPlanningPosition3D(mars, t, { backend: 'sample-de' });
const pM = kepler.getBodyPosition3D(mars, t, false);
const dMars = Math.hypot(pS.x - pM.x, pS.y - pM.y, pS.z - pM.z);
check('sample Mars differs from approx (bias)', dMars > 1e-5, `Δr=${dMars.toExponential(2)} AU`);

// Bit-identical Need path: Earth→Mars with approx backend
const dep = (Date.UTC(2026, 10, 21, 12) - J2000) / 1000;
const td1 = hohmannTransfer(earth, mars, dep);
td1.ephemerisBackend = 'approx';
solveTransferOrbit(td1);
const dv1 = td1.dvTotal_lambert;

const td2 = hohmannTransfer(earth, mars, dep);
td2.ephemerisBackend = 'approx';
solveTransferOrbit(td2);
check('approx double-solve stable', Math.abs(td2.dvTotal_lambert - dv1) < 1e-9);

const td3 = hohmannTransfer(earth, mars, dep);
td3.ephemerisBackend = 'sample-de';
solveTransferOrbit(td3);
check('sample-de solves Lambert', td3.lambertOk === true);
check('sample-de Δv differs from approx', Math.abs(td3.dvTotal_lambert - dv1) > 0.01,
  `Δ=${Math.abs(td3.dvTotal_lambert - dv1).toFixed(2)} m/s`);

// Classroom forced approx even if requested sample on provider
const pC = prov.getPlanningPosition3D(mars, t, { backend: 'sample-de', classroomMode: true });
check('classroom provider uses approx for Mars', Math.hypot(pC.x - pM.x, pC.y - pM.y, pC.z - pM.z) < 1e-12);

if (failed) {
  console.error(`\n${failed} provider checks failed`);
  process.exit(1);
}
console.log('\nAll ephemeris provider checks passed');
