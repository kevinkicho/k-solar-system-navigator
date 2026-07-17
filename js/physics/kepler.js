import {
  AU, CENTURY_SEC, DAY, DEG, G_CONST, PI, TWO_PI,
} from '../constants.js';
import { BODIES, SUN_DATA } from '../data/bodies.js';
import { MOONS } from '../data/moons.js';
import { inclMultiplier, sunWobbleMultiplier } from '../display-scale.js';
import {
  isPlanetRelativeRoute, planetRelativeTransferSeed,
} from './planet-relative.js';

export function solveKepler(M, e, tol = 1e-10) {
  M = ((M % TWO_PI) + TWO_PI) % TWO_PI;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

// Evaluate orbital elements at time T (Julian centuries past J2000) using
// JPL's "Approximate Positions of Major Planets" linear-rate model, plus the
// great-inequality / long-period correction (b·T² + c·cos(fT) + s·sin(fT))
// added to the mean longitude L for Jupiter through Neptune.
function evolvedElements(body, T) {
  const a    = body.a    + (body.a_dot    || 0) * T;
  const e    = body.e    + (body.e_dot    || 0) * T;
  const I    = body.I    + (body.I_dot    || 0) * T;
  let   L    = body.L0   + (body.L_dot    || 0) * T;
  const wBar = body.wBar + (body.wBar_dot || 0) * T;
  const omega = body.omega + (body.omega_dot || 0) * T;
  if (body.f !== undefined) {
    const fT = body.f * T;
    L += body.b * T * T + body.c * Math.cos(fT) + body.s * Math.sin(fT);
  }
  return { a, e, I, L, wBar, omega };
}

// exaggerate=true (default) uses INCL_EXAGGERATION for the visual scene;
// exaggerate=false returns real-inclination heliocentric coordinates for
// physics. Underlying elements are time-evolved using JPL rates regardless.
//
// If `body` is a moon (has body.parent), returns the moon's actual
// heliocentric position by combining its parent planet's heliocentric
// position with the moon's offset around the parent (using real distance
// units, not the visualisation-scaled `displayOrbit`).
export function getBodyPosition3D(body, timeSec, exaggerate = true) {
  if (body.waypointOf) {
    return getWaypointPosition3D(body, timeSec, exaggerate);
  }
  if (body.parent) {
    const parent = BODIES.find(b => b.name === body.parent);
    if (!parent) return { x: 0, y: 0, z: 0, r: 0, v: 0, E: 0 };
    const ph = getBodyPosition3D(parent, timeSec, exaggerate);
    const mp = getMoonRelativePositionAU(body, timeSec);
    const x = ph.x + mp.x, y = ph.y + mp.y, z = ph.z + mp.z;
    return { x, y, z, r: Math.sqrt(x*x + y*y + z*z), v: ph.v, E: ph.E };
  }
  const T = timeSec / CENTURY_SEC;
  const el = evolvedElements(body, T);
  const M = el.L - el.wBar;
  const E = solveKepler(M, el.e);
  const cosE = Math.cos(E), sinE = Math.sin(E);
  const cosV = (cosE - el.e) / (1 - el.e * cosE);
  const sinV = (Math.sqrt(1 - el.e * el.e) * sinE) / (1 - el.e * cosE);
  const v = Math.atan2(sinV, cosV);
  const r = el.a * (1 - el.e * cosE);
  const w = el.wBar - el.omega;
  const cosO = Math.cos(el.omega), sinO = Math.sin(el.omega);
  const cosWV = Math.cos(w + v), sinWV = Math.sin(w + v);
  const Ivis = el.I * (exaggerate ? inclMultiplier() : 1);
  const cosI = Math.cos(Ivis), sinI = Math.sin(Ivis);
  const xe = r * (cosO * cosWV - sinO * sinWV * cosI);
  const ye = r * (sinO * cosWV + cosO * sinWV * cosI);
  const ze = r * (sinWV * sinI);
  return { x: xe, y: ze, z: ye, r, v, E };
}

// Collinear Earth–Moon Lagrange sketch: r = r_E + f * (r_M - r_E).
// f=0.84 → L1, f=1.16 → L2. Not CR3BP.
export function getWaypointPosition3D(wp, timeSec, exaggerate = true) {
  const cfg = wp.waypointOf;
  if (!cfg) return { x: 0, y: 0, z: 0, r: 0, v: 0, E: 0 };
  const earth = BODIES.find(b => b.id === (cfg.primaryId || 'earth') || b.name === 'Earth');
  const moon = MOONS.find(m => m.id === (cfg.secondaryId || 'moon') || m.name === 'Moon');
  if (!earth || !moon) return { x: 0, y: 0, z: 0, r: 0, v: 0, E: 0 };
  const re = getBodyPosition3D(earth, timeSec, exaggerate);
  const rm = getBodyPosition3D(moon, timeSec, exaggerate);
  const f = cfg.f ?? (cfg.lagrange === 'L2' ? 1.16 : 0.84);
  const x = re.x + f * (rm.x - re.x);
  const y = re.y + f * (rm.y - re.y);
  const z = re.z + f * (rm.z - re.z);
  return { x, y, z, r: Math.sqrt(x * x + y * y + z * z), v: 0, E: 0 };
}

// Moon position RELATIVE to its parent planet, in AU.  Uses the real
// `a_km` semi-major axis (not the visualisation-scaled `displayOrbit`) so
// the returned offset is physically correct — suitable for combining with
// the parent's heliocentric position to get the moon's true heliocentric
// coordinates.  Inclination is the moon's real I (not exaggerated), since
// the moon's tiny orbital scale doesn't benefit from visual stretching.
export function getMoonRelativePositionAU(moon, timeSec) {
  const n = TWO_PI / moon.period;
  const M = moon.M0 + n * timeSec;
  const E = solveKepler(M, moon.e);
  const cosE = Math.cos(E), sinE = Math.sin(E);
  const cosV = (cosE - moon.e) / (1 - moon.e * cosE);
  const sinV = (Math.sqrt(1 - moon.e * moon.e) * sinE) / (1 - moon.e * cosE);
  const v = Math.atan2(sinV, cosV);
  const a_AU = (moon.a_km * 1000) / AU;
  const r = a_AU * (1 - moon.e * cosE);
  const Irad = moon.I * DEG;
  const x = r * Math.cos(v);
  const z = r * Math.sin(v) * Math.cos(Irad);
  const y = r * Math.sin(v) * Math.sin(Irad);
  return { x, y, z };
}

// In the heliocentric frame the Sun is fixed at origin; in the barycentric frame the
// barycenter is fixed and the Sun wobbles. r_sun_bary = -Σ mᵢ·rᵢ_helio / M_total.
export function getSunBarycentricOffset(timeSec, exaggerate = true) {
  let sx = 0, sy = 0, sz = 0, mTotal = SUN_DATA.mass;
  for (const body of BODIES) {
    const p = getBodyPosition3D(body, timeSec, exaggerate);
    sx += body.mass * p.x;
    sy += body.mass * p.y;
    sz += body.mass * p.z;
    mTotal += body.mass;
  }
  const wobbleScale = exaggerate ? sunWobbleMultiplier() : 1;
  const k = -wobbleScale / mTotal;
  return { x: sx * k, y: sy * k, z: sz * k };
}

export function getBodyVelocity3D(body, timeSec, exaggerate = false) {
  const dt = 60;
  const pa = getBodyPosition3D(body, timeSec - dt, exaggerate);
  const pb = getBodyPosition3D(body, timeSec + dt, exaggerate);
  return [
    (pb.x - pa.x) / (2 * dt) * AU,
    (pb.y - pa.y) / (2 * dt) * AU,
    (pb.z - pa.z) / (2 * dt) * AU,
  ];
}

// Returns a flat array of {x,y,z} samples. Scene module wraps to THREE.Vector3.
export function generateOrbitPoints(body, segments = 256) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * body.period;
    points.push(getBodyPosition3D(body, t));
  }
  return points;
}

export function getMoonPosition(moon, timeSec) {
  const n = TWO_PI / moon.period;
  const M = moon.M0 + n * timeSec;
  const E = solveKepler(M, moon.e);
  const cosE = Math.cos(E), sinE = Math.sin(E);
  const cosV = (cosE - moon.e) / (1 - moon.e * cosE);
  const sinV = (Math.sqrt(1 - moon.e * moon.e) * sinE) / (1 - moon.e * cosE);
  const v = Math.atan2(sinV, cosV);
  const rDisp = moon.displayOrbit * (1 - moon.e * moon.e) / (1 + moon.e * Math.cos(v));
  const Irad = moon.I * DEG;
  const x = rDisp * Math.cos(v);
  const z = rDisp * Math.sin(v) * Math.cos(Irad);
  const y = rDisp * Math.sin(v) * Math.sin(Irad);
  return { x, y, z };
}

export function generateMoonOrbitPoints(moon, segments = 64) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * moon.period;
    points.push(getMoonPosition(moon, t));
  }
  return points;
}

// Returns the heliocentric Keplerian elements (semi-major axis, period) of
// the body's *Sun-orbit*.  For planets that's just (body.a, body.period);
// for moons it's (parent.a, parent.period) since the moon co-orbits the Sun
// with its parent.  Used by hohmannTransfer to size the heliocentric leg.
function helioElements(body) {
  if (body.waypointOf) {
    // Approximate heliocentric radius from current position for TOF guesses.
    const p = getBodyPosition3D(body, 0, false);
    const a = Math.max(0.5, p.r || 1);
    return { a, period: Math.sqrt(a * a * a) * 365.25 * DAY };
  }
  if (body.parent) {
    const parent = BODIES.find(b => b.name === body.parent);
    if (parent) return { a: parent.a, period: parent.period };
  }
  return { a: body.a, period: body.period };
}

export function hohmannTransfer(body1, body2, departureSimTime) {
  // Same-SOI pairs (Europa→Io, Earth→Moon): parent-centered seed, not Sun μ.
  if (isPlanetRelativeRoute(body1, body2)) {
    return planetRelativeTransferSeed(body1, body2, departureSimTime);
  }

  const pos1 = getBodyPosition3D(body1, departureSimTime);
  const pos2 = getBodyPosition3D(body2, departureSimTime);
  const e1 = helioElements(body1);
  const e2 = helioElements(body2);
  const r1 = e1.a, r2 = e2.a;
  const mu = G_CONST * SUN_DATA.mass;
  const r1m = r1 * AU, r2m = r2 * AU;
  const aT_m = (r1m + r2m) / 2;
  const transferTime = PI * Math.sqrt(aT_m * aT_m * aT_m / mu);

  const v1c = Math.sqrt(mu / r1m);
  const v1t = Math.sqrt(mu * (2 / r1m - 1 / aT_m));
  const dv1 = Math.abs(v1t - v1c);
  const v2c = Math.sqrt(mu / r2m);
  const v2t = Math.sqrt(mu * (2 / r2m - 1 / aT_m));
  const dv2 = Math.abs(v2c - v2t);

  const phaseAngle = PI * (1 - Math.pow((r1m + r2m) / (2 * r2m), 1.5));
  const angle1 = Math.atan2(pos1.z, pos1.x);
  const angle2 = Math.atan2(pos2.z, pos2.x);
  const currentPhase = ((angle2 - angle1) % TWO_PI + TWO_PI) % TWO_PI;
  const n2 = TWO_PI / e2.period, n1 = TWO_PI / e1.period;
  const relativeRate = n2 - n1;
  const phaseDiff = ((phaseAngle - currentPhase) % TWO_PI + TWO_PI) % TWO_PI;
  const timeToWindow = Math.abs(relativeRate) > 1e-20 ? phaseDiff / Math.abs(relativeRate) : Infinity;

  const arrivalSimTime = departureSimTime + transferTime;
  const posArrival = getBodyPosition3D(body2, arrivalSimTime);

  return {
    transferTime, dv1, dv2, dvTotal: dv1 + dv2,
    aT: aT_m, r1: r1m, r2: r2m,
    phaseAngle, currentPhase, timeToWindow,
    pos1, pos2, posArrival, body1, body2,
    departureSimTime, arrivalSimTime,
  };
}
