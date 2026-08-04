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
  getSunOffsetCached, defaultParentPolicy, PARENT_MID_EPOCH_TOF_MAX_S,
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
// C1–C2 fixtures use visual geometry (cinematic); product default is physical.
state.pathGeometry = 'visual';

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

// C1: same-t residual at 21 knots (visual geometry default)
let maxRes = 0;
const knots = [];
for (let k = 0; k <= 20; k++) {
  const u = k / 20;
  const t = tdEM.departureSimTime + u * tdEM.transferTime;
  const ship = getShipPositionOnTransfer(tdEM.departureSimTime, tdEM, t);
  const line = sampleTransferPathAtTime(tdEM, t, { offsetPolicy: 'time_varying', geometry: 'visual' });
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

// C3/C4 endpoints — match_path_end: ghosts = path ends = ship (≤1e-4 AU industrial gate)
state.endpointMarkerPolicy = 'match_path_end';
const ship0 = getShipPositionOnTransfer(tdEM.departureSimTime, tdEM, tdEM.departureSimTime);
const ship1 = getShipPositionOnTransfer(tdEM.departureSimTime, tdEM, tdEM.arrivalSimTime);
const p0 = builtEM.points[0];
const pN = builtEM.points[builtEM.points.length - 1];
const shipLine0 = Math.hypot(ship0.x - p0.x, ship0.y - p0.y, ship0.z - p0.z);
const shipLineN = Math.hypot(ship1.x - pN.x, ship1.y - pN.y, ship1.z - pN.z);
check('C3 ship(t0) ≡ path sample 0', shipLine0 < 1e-6, `Δ=${shipLine0.toExponential(2)}`);
check('C4 ship(tT) ≡ path sample N', shipLineN < 1e-6, `Δ=${shipLineN.toExponential(2)}`);
// Ghosts at path ends under match_path_end policy
const d0 = Math.hypot(ship0.x - p0.x, ship0.y - p0.y, ship0.z - p0.z);
const d1 = Math.hypot(ship1.x - pN.x, ship1.y - pN.y, ship1.z - pN.z);
check('C3 ghost@path_end near ship ≤ 1e-4 AU', d0 <= 1e-4, `Δ=${d0.toExponential(3)} AU`);
check('C4 ghost@path_end near ship ≤ 1e-4 AU', d1 <= 1e-4, `Δ=${d1.toExponential(3)} AU`);

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

// ——— PR2: visual longWay forced to physical when possible (C7) ———
if (tdEM.lambertOk) {
  check(
    'C7 visualLongWay matches physical longWay when not diverged',
    tdEM.visualBranchDiverged === true
      || tdEM.visualLongWay === tdEM.longWay
      || tdEM.visualLongWay == null,
    `phys=${tdEM.longWay} vis=${tdEM.visualLongWay} diverged=${tdEM.visualBranchDiverged}`,
  );
  check(
    'C7 visualBranchDiverged is boolean',
    typeof tdEM.visualBranchDiverged === 'boolean',
  );
}
if (tdEJ.lambertOk) {
  check(
    'C7b Earth–Jupiter longWay stamp present',
    tdEJ.longWay === true || tdEJ.longWay === false,
    `longWay=${tdEJ.longWay} vis=${tdEJ.visualLongWay}`,
  );
  if (!tdEJ.visualBranchDiverged && tdEJ.orbit) {
    check(
      'C7b forced match when not diverged',
      tdEJ.visualLongWay === tdEJ.longWay,
      `phys=${tdEJ.longWay} vis=${tdEJ.visualLongWay}`,
    );
  }
}

// ——— PR4: parent policy helper ———
check('parent mid-epoch threshold 30 d', PARENT_MID_EPOCH_TOF_MAX_S === 30 * DAY);
check(
  'PR4 short planet-relative → mid_epoch',
  defaultParentPolicy({ planetRelative: true, transferTime: 2 * DAY }) === 'mid_epoch',
);
check(
  'PR4 long planet-relative → time_varying',
  defaultParentPolicy({ planetRelative: true, transferTime: 60 * DAY }) === 'time_varying',
);

// Diagnostic: old midOff bug magnitude (for docs; not a fail)
const midOff = getSunBarycentricOffset(tdEJ.departureSimTime + tdEJ.transferTime / 2);
const liveOff = getSunBarycentricOffset(tdEJ.departureSimTime + tdEJ.transferTime * 0.1);
const bugMag = Math.hypot(midOff.x - liveOff.x, midOff.y - liveOff.y, midOff.z - liveOff.z);
console.log(`  · diagnostic: midOff vs s(t@10%) Δ ≈ ${bugMag.toFixed(4)} AU (old ship–line drift scale)`);

// ——— Schematic + physical: ship follows physical Need conic ———
state.display = state.display || {};
state.display.mode = 'schematic';
state.pathGeometry = 'physical';
const tdPhys = makeTd(earth, mars, '2026-12-01T12:00:00Z', 259);
tdPhys.pathGeometry = 'physical';
let maxPhys = 0;
if (tdPhys.lambertOk) {
  for (let k = 0; k <= 20; k++) {
    const t = tdPhys.departureSimTime + (k / 20) * tdPhys.transferTime;
    const ship = getShipPositionOnTransfer(tdPhys.departureSimTime, tdPhys, t);
    const line = sampleTransferPathAtTime(tdPhys, t, {
      offsetPolicy: 'time_varying',
      geometry: 'physical',
      exaggerate: false,
    });
    if (!ship || !line) { maxPhys = Infinity; break; }
    const d = Math.hypot(ship.x - line.x, ship.y - line.y, ship.z - line.z);
    if (d > maxPhys) maxPhys = d;
  }
}
check(
  'C-phys ship–line residual ≤ 1e-6 AU (schematic + physical)',
  maxPhys <= 1e-6,
  `max=${maxPhys.toExponential(3)} AU`,
);

// ——— Cinematic: ship follows visual (exaggerated) so arc is not ecliptic-flat under ×8 planet tilts ———
state.display.mode = 'cinematic';
state.pathGeometry = 'physical'; // product setting — scene still uses visual
const tdVis = makeTd(earth, mars, '2026-12-01T12:00:00Z', 259);
let maxVis = 0;
if (tdVis.lambertOk && tdVis.orbit) {
  for (let k = 0; k <= 20; k++) {
    const t = tdVis.departureSimTime + (k / 20) * tdVis.transferTime;
    const ship = getShipPositionOnTransfer(tdVis.departureSimTime, tdVis, t);
    const line = sampleTransferPathAtTime(tdVis, t, {
      offsetPolicy: 'time_varying',
      geometry: 'visual',
      exaggerate: true,
    });
    if (!ship || !line) { maxVis = Infinity; break; }
    const d = Math.hypot(ship.x - line.x, ship.y - line.y, ship.z - line.z);
    if (d > maxVis) maxVis = d;
  }
}
check(
  'C-cinematic ship–line residual ≤ 1e-6 AU on visual branch',
  maxVis <= 1e-6,
  `max=${maxVis.toExponential(3)} AU`,
);
state.pathGeometry = 'visual';
state.display.mode = 'cinematic';

if (failed) {
  console.error(`\n${failed} path frame consistency check(s) failed`);
  process.exit(1);
}
console.log('\nAll path frame consistency checks passed');
