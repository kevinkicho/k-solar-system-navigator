import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const need = await import(pathToFileURL(resolve(ROOT, 'js/physics/need.js')).href);
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);
const { hohmannTransfer } = await import(pathToFileURL(resolve(ROOT, 'js/physics/kepler.js')).href);
const { solveTransferOrbit } = await import(pathToFileURL(resolve(ROOT, 'js/physics/routing.js')).href);
const { computeMissionBudget } = await import(pathToFileURL(resolve(ROOT, 'js/physics/mission-budget.js')).href);
const { J2000, DAY } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ NEED CALCULATOR ━━━');

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const dep = (Date.UTC(2026, 10, 21, 12) - J2000) / 1000;
const td = hohmannTransfer(earth, mars, dep);
solveTransferOrbit(td);

const helio = need.computeNeed(td, { vehicleId: 'abstract', costBasis: 'helio' });
check('helio phase', helio.phase === 'helio_leg');
check('helio need matches lambert', Math.abs(helio.need_dv_m_s - td.dvTotal_lambert) / td.dvTotal_lambert < 1e-6);

const mission = need.computeNeed(td, { vehicleId: 'abstract', costBasis: 'mission', phase: 'mission_parking' });
const budget = computeMissionBudget(td);
check('mission need = totalMission', Math.abs(mission.need_dv_m_s - budget.totalMission) / budget.totalMission < 1e-6);

const inj = need.computeNeed(td, { vehicleId: 'sh-starship', starshipArch: 'unrefueled' });
check('unrefueled auto phase injection', inj.phase === 'injection');
check('injection = departure total', Math.abs(inj.need_dv_m_s - budget.departure.total) / budget.departure.total < 1e-6);

const leg = need.computeNeed(td, { vehicleId: 'sh-starship', starshipArch: 'legacy-demo', costBasis: 'helio' });
check('legacy demo helio', leg.phase === 'helio_leg');

const c3 = need.computeDepartureC3(td);
check('C3 positive finite', c3 != null && c3 > 0 && isFinite(c3), `c3=${c3}`);

const aero0 = need.computeNeed(td, { phase: 'mission_parking', aeroassistFactor: 0 });
const aero9 = need.computeNeed(td, { phase: 'mission_parking', aeroassistFactor: 0.9 });
check('aero 0 = baseline', Math.abs(aero0.need_dv_m_s - budget.totalMission) < 1e-3);
check('aero 0.9 reduces arrival', aero9.need_dv_m_s < aero0.need_dv_m_s);
check('aero no-op on injection', need.computeNeed(td, { phase: 'injection', aeroassistFactor: 0.9 }).need_dv_m_s === inj.need_dv_m_s);

check('Need has no cargo field', !('cargo' in helio) && !('cargoMass_kg' in helio));

// multi-leg stub
const multi = need.computeNeed({ isMultiLeg: true, dvTotalMultiLeg: 12345, body1: earth, body2: mars });
check('multi-leg phase helio', multi.phase === 'helio_leg' && multi.multi_leg === true);
check('multi-leg need', multi.need_dv_m_s === 12345);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll need calculator checks passed');
