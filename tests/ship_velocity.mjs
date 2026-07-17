/**
 * Ship motion on transfers must follow Kepler/vis-viva, not arbitrary scrub speed.
 */
import { BODIES, SUN_DATA } from '../js/data/bodies.js';
import { AU, DAY, G_CONST } from '../js/constants.js';
import {
  buildHelioOrbit, propagateHelioOrbitState, propagateOrbitState,
} from '../js/physics/helio.js';
import { solveTransferOrbit, getShipPositionOnTransfer } from '../js/physics/routing.js';
import {
  pickMissionStudySpeed, formatTimeCompression, TIME_SPEEDS,
} from '../js/ui/time-system.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ SHIP KEPLER VELOCITY ━━━');

const mu = G_CONST * SUN_DATA.mass;
const r0 = [AU, 0, 0];
const vCirc = Math.sqrt(mu / AU);
const orb = buildHelioOrbit(r0, [0, vCirc, 0], mu);
const st0 = propagateHelioOrbitState(orb, 0);
check('|v| matches circular at Earth', Math.abs(st0.v_mag - vCirc) < 1e-6, `v=${st0.v_mag.toFixed(3)}`);
check('|r| matches 1 AU', Math.abs(st0.r_mag - AU) < 1, `r=${st0.r_mag}`);

// Earth→Mars
const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const depT = (Date.UTC(2026, 11, 1) - Date.UTC(2000, 0, 1, 12)) / 1000;
const tof = 259 * DAY;
const td = {
  body1: earth,
  body2: mars,
  departureSimTime: depT,
  transferTime: tof,
  arrivalSimTime: depT + tof,
};
solveTransferOrbit(td);
check('Lambert ok', td.lambertOk === true);
check('has visual orbit', !!td.orbit);

const ship0 = getShipPositionOnTransfer(depT, td, depT);
const shipMid = getShipPositionOnTransfer(depT, td, depT + tof / 2);
const shipOut = getShipPositionOnTransfer(depT, td, depT + tof * 0.9);

check('ship mode kepler', ship0.mode === 'kepler', `mode=${ship0.mode}`);
check('departure speed ~30 km/s class', ship0.v_km_s > 25 && ship0.v_km_s < 45, `v=${ship0.v_km_s?.toFixed(2)}`);
// Outer half of transfer should be slower (vis-viva)
check(
  'speed drops as r grows (vis-viva)',
  shipOut.v_km_s < ship0.v_km_s && shipMid.r_AU > ship0.r_AU,
  `v0=${ship0.v_km_s?.toFixed(2)} v90=${shipOut.v_km_s?.toFixed(2)} r0=${ship0.r_AU?.toFixed(3)} r90=${shipOut.r_AU?.toFixed(3)}`,
);

// Vis-viva identity on visual orbit
const a = td.orbit.a;
const rMid = shipMid.r_AU * AU;
const vVis = Math.sqrt(mu * (2 / rMid - 1 / a));
const err = Math.abs(vVis - shipMid.v_km_s * 1000) / vVis;
check('mid-course matches vis-viva', err < 1e-6, `err=${(err * 100).toFixed(6)}%`);

// Physical orbit velocity matches Lambert v1 at t=0
if (td.orbitPhysical && td.v1_lambert) {
  const stP = propagateOrbitState(td.orbitPhysical, 0);
  const dv = Math.hypot(
    stP.v[0] - td.v1_lambert[0],
    stP.v[1] - td.v1_lambert[1],
    stP.v[2] - td.v1_lambert[2],
  );
  check('physical v0 = Lambert v1', dv < 1e-3, `Δv=${dv.toFixed(6)} m/s`);
}

// Study speed targets ~1 min wall for multi-year legs (constant calendar scale)
const idx = pickMissionStudySpeed(8 * 365.25 * DAY);
const scale = TIME_SPEEDS[idx].scale;
const wall = (8 * 365.25 * DAY) / scale;
check('8 yr transit wall study ~30–120 s', wall > 30 && wall < 150, `wall=${wall.toFixed(1)}s idx=${idx}`);
check('format compression', formatTimeCompression(DAY).includes('×') || formatTimeCompression(DAY).includes('k'));

if (failed) {
  console.error(`\n${failed} ship velocity check(s) failed`);
  process.exit(1);
}
console.log('\nAll ship velocity checks passed');
