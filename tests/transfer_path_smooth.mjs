/**
 * High-e transfer arcs (e.g. Mercury → Pluto) must draw as smooth 2-body
 * conics — no multi-AU jumps, no time-varying sun-wobble warping.
 *
 * Mirrors the true-anomaly sampler in js/ui/route-orbit-visual.js without
 * pulling Three.js into the Node physics suite.
 */
import { BODIES, SUN_DATA } from '../js/data/bodies.js';
import { DWARFS } from '../js/data/dwarfs.js';
import { AU, DAY, G_CONST, PI, TWO_PI } from '../js/constants.js';
import { solveTransferOrbit } from '../js/physics/routing.js';
import {
  getBodyPosition3D, getBodyVelocity3D, getSunBarycentricOffset,
} from '../js/physics/kepler.js';
import { propagateOrbit, propagateHelioOrbit } from '../js/physics/helio.js';
import { solveLambertBestBranch } from '../js/physics/lambert.js';
import { v3add, v3dot, v3mag, v3scale } from '../js/physics/vec3.js';

function prop(orb, dt) {
  if (!orb) return null;
  return orb.hyperbolic ? propagateHelioOrbit(orb, dt) : propagateOrbit(orb, dt);
}

function trueAnomalyOfPos(orb, pos_m) {
  const r = v3mag(pos_m);
  const rhat = v3scale(pos_m, 1 / r);
  return Math.atan2(
    v3dot(rhat, orb.q_hat),
    Math.max(-1, Math.min(1, v3dot(rhat, orb.p_hat))),
  );
}

function posAtTrueAnomaly(orb, nu) {
  const den = 1 + orb.e * Math.cos(nu);
  if (Math.abs(den) < 1e-12) return null;
  const r = orb.p / den;
  if (!(r > 0) || !isFinite(r)) return null;
  return v3add(
    v3scale(orb.p_hat, r * Math.cos(nu)),
    v3scale(orb.q_hat, r * Math.sin(nu)),
  );
}

function sampleConicByTrueAnomaly(orb, r1_m, r2_m, longWay, nSamples = 320) {
  let nu1 = trueAnomalyOfPos(orb, r1_m);
  let nu2 = trueAnomalyOfPos(orb, r2_m);
  let dNu = nu2 - nu1;
  while (dNu > PI) dNu -= TWO_PI;
  while (dNu <= -PI) dNu += TWO_PI;
  if (longWay) dNu = dNu > 0 ? dNu - TWO_PI : dNu + TWO_PI;
  if (Math.abs(dNu) < 1e-6) dNu = 1e-6;

  const pts = [];
  for (let i = 0; i <= nSamples; i++) {
    const pos = posAtTrueAnomaly(orb, nu1 + dNu * (i / nSamples));
    if (!pos) return null;
    pts.push([pos[0] / AU, pos[1] / AU, pos[2] / AU]);
  }
  return pts;
}

function maxSegmentJump(pts) {
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    m = Math.max(m, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return m;
}

function maxSecondDiff(pts) {
  let m = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    m = Math.max(
      m,
      Math.hypot(
        a[0] - 2 * b[0] + c[0],
        a[1] - 2 * b[1] + c[1],
        a[2] - 2 * b[2] + c[2],
      ),
    );
  }
  return m;
}

const mercury = BODIES.find((b) => b.name === 'Mercury');
const pluto = DWARFS.find((b) => b.name === 'Pluto');
if (!mercury || !pluto) {
  console.error('FAIL: Mercury/Pluto not in catalog');
  process.exit(1);
}

const mu = G_CONST * SUN_DATA.mass;
const now = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 1000;

// Coarse grid for a solvable high-e outer transfer
let best = null;
for (let depDay = 0; depDay <= 400; depDay += 40) {
  for (const tofDay of [2000, 3000, 4000, 5000, 6000, 8000]) {
    const depT = now + depDay * DAY;
    const tof = tofDay * DAY;
    const dep = getBodyPosition3D(mercury, depT, false);
    const arr = getBodyPosition3D(pluto, depT + tof, false);
    const v1 = getBodyVelocity3D(mercury, depT, false);
    const v2 = getBodyVelocity3D(pluto, depT + tof, false);
    const r1 = [dep.x * AU, dep.y * AU, dep.z * AU];
    const r2 = [arr.x * AU, arr.y * AU, arr.z * AU];
    const b = solveLambertBestBranch(r1, r2, tof, mu, v1, v2);
    if (!b?.sol) continue;
    const dv1 = Math.hypot(b.sol.v1[0] - v1[0], b.sol.v1[1] - v1[1], b.sol.v1[2] - v1[2]);
    const dv2 = Math.hypot(b.sol.v2[0] - v2[0], b.sol.v2[1] - v2[1], b.sol.v2[2] - v2[2]);
    const dv = dv1 + dv2;
    if (!best || dv < best.dv) best = { dv, depT, tof, longWay: b.longWay };
  }
}

if (!best) {
  console.error('FAIL: no Mercury→Pluto Lambert cell in grid');
  process.exit(1);
}

const td = {
  body1: mercury,
  body2: pluto,
  departureSimTime: best.depT,
  transferTime: best.tof,
  arrivalSimTime: best.depT + best.tof,
};
solveTransferOrbit(td);

if (!td.lambertOk || !td.orbit) {
  console.error('FAIL: solveTransferOrbit did not produce visual orbit', {
    lambertOk: td.lambertOk,
    hasOrbit: !!td.orbit,
  });
  process.exit(1);
}

const orb = td.orbit;
const e = orb.e;
console.log(`[setup] TOF=${(best.tof / DAY).toFixed(0)} d  e=${e.toFixed(5)}  longWay=${td.longWay}  dv~${(best.dv / 1000).toFixed(1)} km/s`);

const r1 = prop(orb, 0);
const r2 = prop(orb, td.transferTime);
const conic = sampleConicByTrueAnomaly(orb, r1, r2, !!td.longWay, 320);
if (!conic) {
  console.error('FAIL: true-anomaly sampler returned null');
  process.exit(1);
}

const jumpConic = maxSegmentJump(conic);
const secConic = maxSecondDiff(conic);

// Time-uniform pure Kepler (no wobble) — should also be smooth with fixed solveKepler
const N = 256;
const timePts = [];
for (let i = 0; i <= N; i++) {
  const p = prop(orb, (i / N) * td.transferTime);
  if (!p || !isFinite(p[0])) {
    console.error('FAIL: Kepler sample invalid at i=', i);
    process.exit(1);
  }
  timePts.push([p[0] / AU, p[1] / AU, p[2] / AU]);
}
const jumpTime = maxSegmentJump(timePts);

// OLD bug path: per-sample sun wobble — path should still be continuous but
// can show larger lateral “wiggle” than pure conic on multi-year TOFs.
const wobbPts = [];
for (let i = 0; i <= N; i++) {
  const dt = (i / N) * td.transferTime;
  const p = prop(orb, dt);
  const off = getSunBarycentricOffset(td.departureSimTime + dt);
  wobbPts.push([p[0] / AU + off.x, p[1] / AU + off.y, p[2] / AU + off.z]);
}
const jumpWobb = maxSegmentJump(wobbPts);

// Endpoint of pure conic near visual arrival (same exaggerated frame as orbit)
const arr = td.arr3D;
const end = conic[conic.length - 1];
const endMiss = Math.hypot(end[0] - arr.x, end[1] - arr.y, end[2] - arr.z);

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

// High-e transfers historically blew to multi-AU jumps (solveKepler → 1e9).
// True-anomaly equal-Δν sampling is denser near perihelion and sparser near
// apoapsis, so a few-AU step on a 40 AU arc is OK if the curve is still smooth.
check('true-anomaly max segment jump < 6 AU', jumpConic < 6, `jump=${jumpConic.toFixed(4)} AU`);
check('time-uniform Kepler max jump < 2 AU', jumpTime < 2, `jump=${jumpTime.toFixed(4)} AU`);
check('true-anomaly second-diff finite/small', secConic < 5 && isFinite(secConic), `sec=${secConic.toFixed(4)}`);
check('visual orbit high-e (Mercury→outer)', e > 0.9, `e=${e.toFixed(5)}`);
check('conic end near arrival ghost (< 1 AU)', endMiss < 1, `miss=${endMiss.toFixed(4)} AU`);
// Wobble path must still be continuous (no spaghetti), even if we no longer draw it
check('wobble-warped path still continuous', jumpWobb < 3, `jump=${jumpWobb.toFixed(4)} AU`);
// Pure conic should not be wildly kinkier than time sampling (no 1e6 AU spikes)
check('true-anomaly smoother-or-comparable order', jumpConic < 20 * Math.max(jumpTime, 0.05),
  `nu=${jumpConic.toFixed(3)} time=${jumpTime.toFixed(3)}`);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll transfer path smoothness checks passed');
