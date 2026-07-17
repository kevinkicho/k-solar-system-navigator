import { TWO_PI } from '../constants.js';
import { v3dot, v3mag, v3scale, v3sub } from './vec3.js';
import { buildTransferOrbit, propagateOrbit } from './helio.js';

function stumpffC(z) {
  if (Math.abs(z) < 1e-8) return 1 / 2 - z / 24 + z * z / 720;
  if (z > 0) return (1 - Math.cos(Math.sqrt(z))) / z;
  return (Math.cosh(Math.sqrt(-z)) - 1) / (-z);
}

function stumpffS(z) {
  if (Math.abs(z) < 1e-8) return 1 / 6 - z / 120 + z * z / 5040;
  if (z > 0) {
    const sq = Math.sqrt(z);
    return (sq - Math.sin(sq)) / (z * sq);
  }
  const sq = Math.sqrt(-z);
  return (Math.sinh(sq) - sq) / ((-z) * sq);
}

/**
 * Universal-variable Lambert solver.
 * @param {number[]|null} longWay - null = geometric heuristic; true/false force branch
 * @param {number} [revolutions=0] - extra full revolutions (0 = single-rev). Multi-rev is
 *   elliptical-class only (z > 0 search windows between (2πN)² singularities).
 * @returns {{ v1, v2, revolutions }|null}
 */
export function solveLambertProblem(r1v, r2v, tof, mu, longWay = null, revolutions = 0) {
  const N = Math.max(0, Math.min(3, Math.floor(Number(revolutions) || 0)));
  const r1 = v3mag(r1v), r2 = v3mag(r2v);
  const cosDth = Math.max(-1, Math.min(1, v3dot(r1v, r2v) / (r1 * r2)));

  // y-component of (r1 × r2) in scene coords. < 0 ⇒ short arc is prograde.
  const crossY = r1v[2] * r2v[0] - r1v[0] * r2v[2];
  const useLong = longWay === null ? (crossY >= 0) : longWay;
  // Transfer angle in (0, 2π]; multi-rev adds 2πN (A uses sin/cos of total angle).
  const theta0 = useLong ? TWO_PI - Math.acos(cosDth) : Math.acos(cosDth);
  const dtheta = theta0 + N * TWO_PI;

  const sinDth = Math.sin(dtheta);
  const cosDthN = Math.cos(dtheta);
  if (Math.abs(1 - cosDthN) < 1e-14) return null;
  if (Math.abs(sinDth) < 1e-8) return null;
  // A uses the multi-rev angle (sin/cos of θ+2πN)
  const A = sinDth * Math.sqrt(r1 * r2 / (1 - cosDthN));
  if (Math.abs(A) < 1e-10 || !isFinite(A)) return null;

  const sqrtMu = Math.sqrt(mu);
  const targetErr = 1e-8 * sqrtMu * tof;

  function F(z) {
    const C = stumpffC(z), S = stumpffS(z);
    const sqC = Math.sqrt(Math.abs(C));
    if (sqC < 1e-30) return NaN;
    const y = r1 + r2 + A * (z * S - 1) / sqC;
    if (y < 0) return NaN;
    const chi = Math.sqrt(y / C);
    // Multi-rev: add 2πN/sqrt(μ) * a^{3/2} terms appear via z domain for elliptical
    return chi * chi * chi * S + A * Math.sqrt(y) - sqrtMu * tof;
  }

  let z_lo = null, z_hi = null, F_lo, F_hi;

  if (N === 0) {
    // Single-rev: classic bracket around z=0
    let F0 = F(0);
    if (isNaN(F0)) {
      for (const zt of [0.1, -0.1, 0.5, -0.5, 1, -1]) {
        F0 = F(zt);
        if (!isNaN(F0)) break;
      }
      if (isNaN(F0)) return null;
    }
    {
      let zp = 0.5, Fp = F(zp);
      for (let i = 0; i < 60; i++) {
        if (!isNaN(Fp) && Math.sign(Fp) !== Math.sign(F0)) {
          z_lo = 0; z_hi = zp; F_lo = F0; F_hi = Fp;
          break;
        }
        zp += 0.5;
        if (zp > 39.3) break;
        Fp = F(zp);
      }
    }
    if (z_lo === null) {
      let zn = -0.5, Fn = F(zn);
      for (let i = 0; i < 80; i++) {
        if (!isNaN(Fn) && Math.sign(Fn) !== Math.sign(F0)) {
          z_lo = zn; z_hi = 0; F_lo = Fn; F_hi = F0;
          break;
        }
        zn *= 1.6;
        if (zn < -1e6) break;
        Fn = F(zn);
      }
    }
  } else {
    // Multi-rev elliptical: search between (2πN)² and (2π(N+1))² singularities
    const zMin = (TWO_PI * N) ** 2 + 1e-4;
    const zMax = (TWO_PI * (N + 1)) ** 2 - 1e-3;
    // Sample for a sign change
    let prevZ = zMin, prevF = F(zMin);
    for (let i = 1; i <= 80; i++) {
      const z = zMin + (zMax - zMin) * (i / 80);
      const Fz = F(z);
      if (!isNaN(prevF) && !isNaN(Fz) && Math.sign(prevF) !== Math.sign(Fz) && Math.sign(Fz) !== 0) {
        z_lo = prevZ; z_hi = z; F_lo = prevF; F_hi = Fz;
        break;
      }
      if (!isNaN(Fz)) {
        prevZ = z;
        prevF = Fz;
      }
    }
  }

  if (z_lo === null) return null;

  let z = 0.5 * (z_lo + z_hi);
  for (let iter = 0; iter < 200; iter++) {
    z = 0.5 * (z_lo + z_hi);
    const Fz = F(z);
    if (isNaN(Fz)) {
      z_lo = z;
      continue;
    }
    if (Math.abs(Fz) < targetErr) break;
    if (Math.sign(Fz) === Math.sign(F_lo)) {
      z_lo = z;
      F_lo = Fz;
    } else {
      z_hi = z;
      F_hi = Fz;
    }
    if (z_hi - z_lo < 1e-12) break;
  }

  const C = stumpffC(z), S = stumpffS(z);
  const sqC = Math.sqrt(Math.abs(C));
  if (sqC < 1e-30) return null;
  const y = r1 + r2 + A * (z * S - 1) / sqC;
  if (y < 0 || !isFinite(y)) return null;

  const f = 1 - y / r1;
  const g = A * Math.sqrt(y / mu);
  const gdot = 1 - y / r2;
  if (Math.abs(g) < 1e-30) return null;

  const v1 = v3scale(v3sub(r2v, v3scale(r1v, f)), 1 / g);
  const v2 = v3scale(v3sub(v3scale(r2v, gdot), r1v), 1 / g);

  const vCircRef = Math.sqrt(mu / r1);
  const v1m = v3mag(v1), v2m = v3mag(v2);
  if (!isFinite(v1m) || !isFinite(v2m)) return null;
  if (v1m > 50 * vCircRef || v2m > 50 * vCircRef) return null;

  return { v1, v2, revolutions: N, longWay: useLong };
}

/**
 * Best branch over short/long and optional multi-rev N=0..maxRevolutions.
 * @param {object} [opts]
 * @param {number} [opts.maxRevolutions=0]
 */
export function solveLambertBestBranch(r1v, r2v, tof, mu, vBody1 = null, vBody2 = null, opts = {}) {
  const maxRev = Math.max(0, Math.min(2, Math.floor(opts.maxRevolutions ?? 0)));
  let best = null;
  for (let N = 0; N <= maxRev; N++) {
    for (const lw of [false, true]) {
      const sol = solveLambertProblem(r1v, r2v, tof, mu, lw, N);
      if (!sol) continue;
      const orb = buildTransferOrbit(r1v, sol.v1, mu);
      if (!orb || !(orb.e < 1) && N > 0) continue; // multi-rev requires ellipse
      let hit;
      try {
        hit = propagateOrbit(orb, tof);
      } catch {
        continue;
      }
      if (!hit || v3mag(v3sub(hit, r2v)) > 1e6) continue;
      const cost = (vBody1 && vBody2)
        ? v3mag(v3sub(sol.v1, vBody1)) + v3mag(v3sub(sol.v2, vBody2))
        : v3mag(sol.v1);
      if (!best || cost < best.cost) {
        best = {
          sol, orb, longWay: lw, cost, revolutions: N,
        };
      }
    }
  }
  return best;
}
