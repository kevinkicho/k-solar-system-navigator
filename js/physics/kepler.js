import {
  AU, CENTURY_SEC, DEG, G_CONST, INCL_EXAGGERATION, PI,
  SUN_WOBBLE_EXAGGERATION, TWO_PI,
} from '../constants.js';
import { BODIES, SUN_DATA } from '../data/bodies.js';

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
export function getBodyPosition3D(body, timeSec, exaggerate = true) {
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
  const Ivis = el.I * (exaggerate ? INCL_EXAGGERATION : 1);
  const cosI = Math.cos(Ivis), sinI = Math.sin(Ivis);
  const xe = r * (cosO * cosWV - sinO * sinWV * cosI);
  const ye = r * (sinO * cosWV + cosO * sinWV * cosI);
  const ze = r * (sinWV * sinI);
  return { x: xe, y: ze, z: ye, r, v, E };
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
  const wobbleScale = exaggerate ? SUN_WOBBLE_EXAGGERATION : 1;
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

export function hohmannTransfer(body1, body2, departureSimTime) {
  const pos1 = getBodyPosition3D(body1, departureSimTime);
  const pos2 = getBodyPosition3D(body2, departureSimTime);
  const r1 = body1.a, r2 = body2.a;
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
  const n2 = TWO_PI / body2.period, n1 = TWO_PI / body1.period;
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
