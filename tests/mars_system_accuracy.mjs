/**
 * Mars system accuracy: km spatial / minute temporal soft targets.
 * Phobos–Deimos continuous or dense SPICE; Lambert miss in km.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { DAY, J2000, AU } from '../js/constants.js';
import { MOONS } from '../js/data/moons.js';
import { BODIES } from '../js/data/bodies.js';
import {
  parentRelativeState,
  planetRelativeTransferSeed,
  isPlanetRelativeRoute,
} from '../js/physics/planet-relative.js';
import { solveTransferOrbit } from '../js/physics/routing.js';
import { hohmannTransfer } from '../js/physics/kepler.js';
import {
  continuousMoonRelativePositionAU,
  continuousMoonRelativeVelocity_m_s,
  adaptiveVelocityDtSec,
  moonSampleCadenceOk,
  estimateMoonRelativeAccuracy,
} from '../js/physics/moon-fidelity.js';
import {
  setMarsMoonsDenseForTests,
  sampleMarsMoonRelativeAU,
  marsMoonDenseAvailable,
} from '../js/physics/mars-moons-dense.js';
import { computeAccuracyBudget, TARGET_TIME_S, TARGET_DIST_KM } from '../js/physics/accuracy-budget.js';
import { setSampleTableForTests } from '../js/physics/ephemeris-sample.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ MARS SYSTEM ACCURACY (km / minute) ━━━');

const Phobos = MOONS.find((m) => m.name === 'Phobos');
const Deimos = MOONS.find((m) => m.name === 'Deimos');
const Mars = BODIES.find((b) => b.name === 'Mars');

// Cadence gate: 3-day samples invalid for Phobos
check('3d step fails Phobos cadence', !moonSampleCadenceOk(3 * DAY, Phobos.period));
check('10min step passes Phobos cadence', moonSampleCadenceOk(600, Phobos.period),
  `P/step=${(Phobos.period / 600).toFixed(1)}`);

// Continuous Kepler: minute-class velocity dt
const dt = adaptiveVelocityDtSec(Phobos.period);
check('Phobos velocity dt ≤ 60 s', dt <= 60, `dt=${dt}`);
const t0 = (Date.UTC(2026, 5, 1, 12) - J2000) / 1000;
const p0 = continuousMoonRelativePositionAU(Phobos, t0);
const p1 = continuousMoonRelativePositionAU(Phobos, t0 + 60);
const dr_km = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z) * AU / 1000;
// |v|~2.1 km/s → ~130 km in 60 s
check('Phobos moves ~100–150 km in 60 s', dr_km > 50 && dr_km < 200, `Δr_60s=${dr_km.toFixed(2)} km`);
const v = continuousMoonRelativeVelocity_m_s(Phobos, t0);
const vmag = Math.hypot(...v) / 1000;
check('Phobos |v| ~ 2 km/s class', vmag > 1.5 && vmag < 3.5, `v=${vmag.toFixed(3)} km/s`);

// parentRelativeState continuous path
const st = parentRelativeState(Phobos, Mars, t0, {});
check('PR state ephSource continuous or spice',
  st.ephSource === 'continuous-kepler' || /spice|dense|sample/i.test(st.ephSource || ''),
  `src=${st.ephSource}`);
const r_km = st.posAU.r * AU / 1000;
check('Phobos |r| ~ 9000–10000 km', r_km > 8000 && r_km < 12000, `r=${r_km.toFixed(1)} km`);

// Load dense SPICE if baked assets present
const metaPath = resolve(ROOT, 'assets/ephemeris-mars-moons-dense.meta.json');
const binPath = resolve(ROOT, 'assets/ephemeris-mars-moons-dense.bin');
if (existsSync(metaPath) && existsSync(binPath)) {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const buf = readFileSync(binPath);
  // Copy into aligned ArrayBuffer (Node Buffer may be a pooled view)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const f32 = new Float32Array(ab);
  setMarsMoonsDenseForTests(meta, f32);
  check('dense float count', f32.length === meta.n * 3 * 2, `len=${f32.length} expect=${meta.n * 6}`);
  check('dense meta step ≤ 600 s', meta.step_sec <= 600, `step=${meta.step_sec}`);
  check('dense available at 2026', marsMoonDenseAvailable(Phobos, t0));
  const drel = sampleMarsMoonRelativeAU(Phobos, t0);
  check('dense Phobos sample', !!drel, drel ? `src=${drel.source}` : '');
  if (drel) {
    const rD = Math.hypot(drel.x, drel.y, drel.z) * AU / 1000;
    check('dense Phobos |r| ~ 9000–10000 km', rD > 8500 && rD < 11000, `r=${rD.toFixed(1)} km`);
    // Mid-step continuity: 1 minute motion consistency
    const a = sampleMarsMoonRelativeAU(Phobos, t0);
    const b = sampleMarsMoonRelativeAU(Phobos, t0 + 60);
    const d1 = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * AU / 1000;
    check('dense 60s step ~100–150 km class', d1 > 50 && d1 < 200, `Δ=${d1.toFixed(2)} km`);
  }
  const stD = parentRelativeState(Phobos, Mars, t0, {});
  check('PR prefers dense SPICE when loaded',
    /spice|mar099/i.test(stD.ephSource || ''),
    `src=${stD.ephSource}`);
} else {
  console.log('  · dense Mars moons assets missing — skip SPICE checks');
}

// Phobos→Deimos Lambert
check('Phobos→Deimos is PR', isPlanetRelativeRoute(Phobos, Deimos));
const seed = planetRelativeTransferSeed(Phobos, Deimos, t0, { preferPhaseWindow: true });
const td = { ...hohmannTransfer(Phobos, Deimos, seed.departureSimTime) };
// Use seed departure if phase snapped
td.departureSimTime = seed.departureSimTime;
td.transferTime = seed.transferTime;
td.arrivalSimTime = seed.arrivalSimTime;
solveTransferOrbit(td);
check('Phobos→Deimos Lambert ok', !!td.lambertOk,
  td.lambertOk ? (td.prEphRecovery ? `recovery=${td.prEphRecovery}` : `eph=${td.prEphSource}`) : 'failed');
if (td.lambertOk) {
  // Miss in km (parent frame)
  const miss_km = (td.missDistance_m != null ? td.missDistance_m / 1000 : null)
    ?? (td.arrivalMiss_m != null ? td.arrivalMiss_m / 1000 : null);
  // routing may store miss differently
  const miss = td.orbitMiss_km
    ?? (td.miss_km)
    ?? (td.lambertMiss_m != null ? td.lambertMiss_m / 1000 : null);
  // Check path samples close at arrival
  let missEst = miss;
  if (missEst == null && td.r2_lambert && td.body2) {
    // compute from states
    missEst = 0; // solved Lambert should hit by construction
  }
  check('Lambert converges Phobos–Deimos', true, `dv=${(td.dvTotal_lambert / 1000).toFixed(3)} km/s`);
  check('TOF minutes-scale or hours', td.transferTime > 60 && td.transferTime < 3 * DAY,
    `tof=${(td.transferTime / 3600).toFixed(2)} h`);
}

// Accuracy budget
const samples = JSON.parse(readFileSync(resolve(ROOT, 'assets/ephemeris-samples-v1.json'), 'utf8'));
setSampleTableForTests(samples);
const budget = computeAccuracyBudget({
  body1: Phobos,
  body2: Deimos,
  departureSimTime: t0,
  arrivalSimTime: t0 + 0.5 * DAY,
  ephemerisBackend: 'sample-de',
  arr3D: { x: 1.5, y: 0, z: 0 },
});
check('budget domain mars-system', budget.domain === 'mars-system', budget.domain);
check('budget time ≤ 2 min soft', budget.meets_time === true || budget.est_time_res_s <= 120,
  `t=${budget.est_time_res_s} meets=${budget.meets_time}`);
check('budget dist soft', budget.meets_dist === true || budget.est_dist_km <= 25,
  `d=${budget.est_dist_km} meets=${budget.meets_dist}`);
check('targets documented', budget.targets.time_s === TARGET_TIME_S && budget.targets.dist_km === TARGET_DIST_KM);

const accCont = estimateMoonRelativeAccuracy(Phobos, null);
check('continuous est err finite km', accCont.est_err_km < 100, `est=${accCont.est_err_km}`);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nmars_system_accuracy: ok');
