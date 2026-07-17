/**
 * Phase 1 primary gate: ship and dashed path share one pipeline.
 * Imports **production** modules (C0) — does not reimplement Lambert.
 *
 * C1/C2: same-absolute-time residual ship vs path sample
 * C-dbl: scene = helio + one s(t), not two
 * C3/C4: endpoints near dep/arr scene ghosts
 */
import { BODIES } from '../js/data/bodies.js';
import { DAY } from '../js/constants.js';
import { state } from '../js/state.js';
import { setDisplayMode } from '../js/display-scale.js';
import { solveTransferOrbit, getShipPositionOnTransfer } from '../js/physics/routing.js';
import {
  buildTransferPathSamples, sampleTransferPathAtTime, clearSunOffsetCache,
  getSunOffsetCached,
} from '../js/physics/transfer-path.js';
import { getSunBarycentricOffset } from '../js/physics/kepler.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ PATH FRAME CONSISTENCY (Phase 1) ━━━');

// C0: production modules
check('C0 buildTransferPathSamples is function', typeof buildTransferPathSamples === 'function');
check('C0 sampleTransferPathAtTime is function', typeof sampleTransferPathAtTime === 'function');
check('C0 getShipPositionOnTransfer is function', typeof getShipPositionOnTransfer === 'function');

clearSunOffsetCache();
setDisplayMode('cinematic');
state.pathOffsetPolicy = 'time_varying';
state.pathSampleMode = 'equal_time';

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const jupiter = BODIES.find((b) => b.name === 'Jupiter');

function makeTd(b1, b2, depISO, tofDays) {
  const depT = (Date.parse(depISO) - Date.UTC(2000, 0, 1, 12)) / 1000;
  const tof = tofDays * DAY;
  const td = {
    body1: b1,
    body2: b2,
    departureSimTime: depT,
    transferTime: tof,
    arrivalSimTime: depT + tof,
    pathOffsetPolicy: 'time_varying',
  };
  solveTransferOrbit(td);
  return td;
}

// ——— Earth → Mars (C1) ———
const tdEM = makeTd(earth, mars, '2026-12-01T12:00:00Z', 259);
check('Earth–Mars Lambert ok', tdEM.lambertOk === true, `ok=${tdEM.lambertOk}`);
check('Earth–Mars has visual orbit', !!tdEM.orbit);

const builtEM = buildTransferPathSamples(tdEM, {
  offsetPolicy: 'time_varying',
  sampleMode: 'equal_time',
  nSamples: 320,
});
check('path has ≥320 knots', builtEM.points.length >= 320, `n=${builtEM.points.length}`);
check('path mode not pure fail', builtEM.points[0]?.mode === 'kepler' || builtEM.fallback == null
  || builtEM.fallback === 'physical' || builtEM.points[0]?.mode === 'cosine');

// C1: same-t residual at 21 knots
let maxRes = 0;
const knots = [];
for (let k = 0; k <= 20; k++) {
  const u = k / 20;
  const t = tdEM.departureSimTime + u * tdEM.transferTime;
  const ship = getShipPositionOnTransfer(tdEM.departureSimTime, tdEM, t);
  const line = sampleTransferPathAtTime(tdEM, t, { offsetPolicy: 'time_varying' });
  if (!ship || !line) {
    maxRes = Infinity;
    break;
  }
  const d = Math.hypot(ship.x - line.x, ship.y - line.y, ship.z - line.z);
  if (d > maxRes) maxRes = d;
  knots.push(d);
}
check(
  'C1 ship–line same-t residual ≤ 1e-6 AU (Earth–Mars)',
  maxRes <= 1e-6,
  `max=${maxRes.toExponential(3)} AU`,
);

// Identity: ship === sampleTransferPathAtTime (same function)
const tMid = tdEM.departureSimTime + tdEM.transferTime / 2;
const a = getShipPositionOnTransfer(tdEM.departureSimTime, tdEM, tMid);
const b = sampleTransferPathAtTime(tdEM, tMid, { offsetPolicy: 'time_varying' });
const id = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
check('ship API ≡ sampleTransferPathAtTime', id < 1e-12, `Δ=${id.toExponential(2)}`);

// C-dbl: scene = helio + one s(t)
const s = getSunBarycentricOffset(tMid, true);
const one = Math.hypot(
  a.x - (a.r_helio.x + s.x),
  a.y - (a.r_helio.y + s.y),
  a.z - (a.r_helio.z + s.z),
);
const two = Math.hypot(
  a.x - (a.r_helio.x + 2 * s.x),
  a.y - (a.r_helio.y + 2 * s.y),
  a.z - (a.r_helio.z + 2 * s.z),
);
check('C-dbl scene = helio + one s(t)', one < 1e-9, `‖scene−(h+s)‖=${one.toExponential(2)}`);
check('C-dbl not double-offset (two-s residual large if |s|>0)', two > one || Math.hypot(s.x, s.y, s.z) < 1e-12,
  `‖scene−(h+2s)‖=${two.toExponential(2)} |s|=${Math.hypot(s.x, s.y, s.z).toFixed(4)}`);
check('frame is scene', a.frame === 'scene', `frame=${a.frame}`);
check('offsetApplied true', a.offsetApplied === true);

// C3/C4 endpoints
const ship0 = getShipPositionOnTransfer(tdEM.departureSimTime, tdEM, tdEM.departureSimTime);
const ship1 = getShipPositionOnTransfer(tdEM.departureSimTime, tdEM, tdEM.arrivalSimTime);
const depGhost = {
  x: tdEM.dep3D.x + getSunBarycentricOffset(tdEM.departureSimTime).x,
  y: tdEM.dep3D.y + getSunBarycentricOffset(tdEM.departureSimTime).y,
  z: tdEM.dep3D.z + getSunBarycentricOffset(tdEM.departureSimTime).z,
};
const arrGhost = {
  x: tdEM.arr3D.x + getSunBarycentricOffset(tdEM.arrivalSimTime).x,
  y: tdEM.arr3D.y + getSunBarycentricOffset(tdEM.arrivalSimTime).y,
  z: tdEM.arr3D.z + getSunBarycentricOffset(tdEM.arrivalSimTime).z,
};
const d0 = Math.hypot(ship0.x - depGhost.x, ship0.y - depGhost.y, ship0.z - depGhost.z);
const d1 = Math.hypot(ship1.x - arrGhost.x, ship1.y - arrGhost.y, ship1.z - arrGhost.z);
// Path ends should match ship (same pipeline); ghost miss depends on orbit closure vs dep3D
const p0 = builtEM.points[0];
const pN = builtEM.points[builtEM.points.length - 1];
const shipLine0 = Math.hypot(ship0.x - p0.x, ship0.y - p0.y, ship0.z - p0.z);
const shipLineN = Math.hypot(ship1.x - pN.x, ship1.y - pN.y, ship1.z - pN.z);
check('C3 ship(t0) ≡ path sample 0', shipLine0 < 1e-6, `Δ=${shipLine0.toExponential(2)}`);
check('C4 ship(tT) ≡ path sample N', shipLineN < 1e-6, `Δ=${shipLineN.toExponential(2)}`);
check('dep ghost near ship (orbit closure)', d0 < 0.05, `Δ=${d0.toFixed(6)} AU`);
check('arr ghost near ship (orbit closure)', d1 < 0.05, `Δ=${d1.toFixed(6)} AU`);

// Velocity still physical on r_helio
check('helio speed present', ship0.v_km_s > 20 && ship0.v_km_s < 50, `v=${ship0.v_km_s?.toFixed(2)}`);

// ——— Earth → Jupiter multi-year (C2 class) ———
const tdEJ = makeTd(earth, jupiter, '2030-01-01T12:00:00Z', 1000);
check('Earth–Jupiter Lambert ok', tdEJ.lambertOk === true);
let maxResJ = 0;
if (tdEJ.lambertOk) {
  for (let k = 0; k <= 20; k++) {
    const t = tdEJ.departureSimTime + (k / 20) * tdEJ.transferTime;
    const ship = getShipPositionOnTransfer(tdEJ.departureSimTime, tdEJ, t);
    const line = sampleTransferPathAtTime(tdEJ, t, { offsetPolicy: 'time_varying' });
    if (!ship || !line) { maxResJ = Infinity; break; }
    const d = Math.hypot(ship.x - line.x, ship.y - line.y, ship.z - line.z);
    if (d > maxResJ) maxResJ = d;
  }
}
check(
  'C2 ship–line residual ≤ 5e-4 AU (Earth–Jupiter multi-year)',
  maxResJ <= 5e-4,
  `max=${maxResJ.toExponential(3)} AU`,
);

// Cache smoke
clearSunOffsetCache();
const c1 = getSunOffsetCached(tMid, true);
const c2 = getSunOffsetCached(tMid + 100, true); // same day bucket
check('sun offset cache returns object', c1 && typeof c1.x === 'number');
check('same-day cache stable', c1.x === c2.x && c1.y === c2.y, 'bucket reuse');

// Diagnostic: old midOff bug magnitude (for docs; not a fail)
const midOff = getSunBarycentricOffset(tdEJ.departureSimTime + tdEJ.transferTime / 2);
const liveOff = getSunBarycentricOffset(tdEJ.departureSimTime + tdEJ.transferTime * 0.1);
const bugMag = Math.hypot(midOff.x - liveOff.x, midOff.y - liveOff.y, midOff.z - liveOff.z);
console.log(`  · diagnostic: midOff vs s(t@10%) Δ ≈ ${bugMag.toFixed(4)} AU (old ship–line drift scale)`);

if (failed) {
  console.error(`\n${failed} path frame consistency check(s) failed`);
  process.exit(1);
}
console.log('\nAll path frame consistency checks passed');
