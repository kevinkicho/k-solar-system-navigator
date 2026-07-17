import { AU, G_CONST, J2000 } from '../constants.js';
import { SUN_DATA } from '../data/bodies.js';
import { v3add, v3cross, v3dot, v3mag, v3scale, v3sub } from './vec3.js';
import { solveKepler } from './kepler.js';

// Compute transfer-orbit parameters from a heliocentric state vector.
// Returns an orbit object that can be propagated with propagateOrbit().
export function buildTransferOrbit(r1v, v1, mu) {
  const r1 = v3mag(r1v), v1m = v3mag(v1);
  const h_vec = v3cross(r1v, v1);
  const h = v3mag(h_vec);

  const vxh = v3cross(v1, h_vec);
  const r1hat = v3scale(r1v, 1 / r1);
  const e_vec = v3sub(v3scale(vxh, 1 / mu), r1hat);
  const e = v3mag(e_vec);

  const energy = v1m * v1m / 2 - mu / r1;
  const a = -mu / (2 * energy);
  const p = a * (1 - e * e);

  const p_hat = e > 1e-10 ? v3scale(e_vec, 1 / e) : r1hat;
  const w_hat = v3scale(h_vec, 1 / h);
  const q_hat = v3cross(w_hat, p_hat);

  const cosNu0 = v3dot(r1hat, p_hat);
  const sinNu0 = v3dot(r1hat, q_hat);
  const nu0 = Math.atan2(sinNu0, cosNu0);

  const E0 = 2 * Math.atan2(
    Math.sqrt(Math.max(0, 1 - e)) * Math.sin(nu0 / 2),
    Math.sqrt(1 + e) * Math.cos(nu0 / 2));
  const M0 = E0 - e * Math.sin(E0);
  const n = Math.sqrt(mu / (a * a * a));

  return { a, e, p, p_hat, q_hat, w_hat, M0, n, mu };
}

/**
 * Perifocal velocity at true anomaly ν (m/s).
 * v = √(μ/p) [ −sin ν · p̂ + (e + cos ν) · q̂ ]
 */
function velocityAtTrueAnomaly(orb, nu, mu) {
  const p = orb.p;
  if (!(p > 0) || !(mu > 0)) return [0, 0, 0];
  const s = Math.sqrt(mu / p);
  return v3add(
    v3scale(orb.p_hat, -s * Math.sin(nu)),
    v3scale(orb.q_hat, s * (orb.e + Math.cos(nu))),
  );
}

function positionAtTrueAnomaly(orb, nu) {
  const r = orb.p / (1 + orb.e * Math.cos(nu));
  return v3add(
    v3scale(orb.p_hat, r * Math.cos(nu)),
    v3scale(orb.q_hat, r * Math.sin(nu)),
  );
}

/** μ for an orbit object (stored or Sun default). */
function orbitMu(orb) {
  if (orb?.mu > 0) return orb.mu;
  return G_CONST * SUN_DATA.mass;
}

// Propagate a (planet-bound, elliptical) transfer orbit by dt seconds. Returns [x,y,z] in metres.
export function propagateOrbit(orb, dt) {
  const st = propagateOrbitState(orb, dt);
  return st ? st.r : null;
}

/**
 * Elliptical orbit state at t0+dt.
 * @returns {{ r: number[], v: number[], nu: number, r_mag: number, v_mag: number }|null}
 */
export function propagateOrbitState(orb, dt, mu = null) {
  if (!orb || !(orb.p > 0)) return null;
  const M = orb.M0 + orb.n * dt;
  const E = solveKepler(M, orb.e);
  const den = 1 - orb.e * Math.cos(E);
  if (!(Math.abs(den) > 1e-14)) return null;
  const cosNu = (Math.cos(E) - orb.e) / den;
  const sinNu = Math.sqrt(Math.max(0, 1 - orb.e * orb.e)) * Math.sin(E) / den;
  const nu = Math.atan2(sinNu, cosNu);
  const r = positionAtTrueAnomaly(orb, nu);
  const v = velocityAtTrueAnomaly(orb, nu, mu ?? orbitMu(orb));
  return {
    r, v, nu,
    r_mag: v3mag(r),
    v_mag: v3mag(v),
  };
}

// Heliocentric 2-body orbit from a Cartesian state (r_m, v_m_s). Handles both
// elliptical (e<1) and hyperbolic (e>1) trajectories — safe for escape probes.
export function buildHelioOrbit(r0v, v0, mu) {
  const r0 = v3mag(r0v), v0m = v3mag(v0);
  const h_vec = v3cross(r0v, v0);
  const h = v3mag(h_vec);
  const vxh = v3cross(v0, h_vec);
  const r0hat = v3scale(r0v, 1 / r0);
  const e_vec = v3sub(v3scale(vxh, 1 / mu), r0hat);
  const e = v3mag(e_vec);

  const energy = v0m * v0m / 2 - mu / r0;
  const a = -mu / (2 * energy);
  const p = h * h / mu;

  const p_hat = e > 1e-10 ? v3scale(e_vec, 1 / e) : r0hat;
  const w_hat = v3scale(h_vec, 1 / h);
  const q_hat = v3cross(w_hat, p_hat);

  const cosNu0 = v3dot(r0hat, p_hat);
  const sinNu0 = v3dot(r0hat, q_hat);
  const nu0 = Math.atan2(sinNu0, cosNu0);

  const hyperbolic = e > 1;
  let M0, n;
  if (hyperbolic) {
    const H0 = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu0 / 2));
    M0 = e * Math.sinh(H0) - H0;
    n  = Math.sqrt(mu / Math.pow(Math.abs(a), 3));
  } else {
    const E0 = 2 * Math.atan2(
      Math.sqrt(Math.max(0, 1 - e)) * Math.sin(nu0 / 2),
      Math.sqrt(1 + e) * Math.cos(nu0 / 2));
    M0 = E0 - e * Math.sin(E0);
    n  = Math.sqrt(mu / (a * a * a));
  }
  return { a, e, p, p_hat, q_hat, w_hat, M0, n, hyperbolic, mu };
}

export function propagateHelioOrbit(orb, dt) {
  const st = propagateHelioOrbitState(orb, dt);
  return st ? st.r : null;
}

/**
 * Heliocentric (ellipse or hyperbola) state at t0+dt.
 * @returns {{ r: number[], v: number[], nu: number, r_mag: number, v_mag: number }|null}
 */
export function propagateHelioOrbitState(orb, dt, mu = null) {
  if (!orb || !(orb.p > 0)) return null;
  const M = orb.M0 + orb.n * dt;
  let nu;
  if (orb.hyperbolic) {
    let H = Math.asinh(M / Math.max(orb.e, 1e-12));
    for (let i = 0; i < 60; i++) {
      const f  = orb.e * Math.sinh(H) - H - M;
      const df = orb.e * Math.cosh(H) - 1;
      if (!(Math.abs(df) > 1e-14)) break;
      const dH = f / df;
      H -= dH;
      if (Math.abs(dH) < 1e-12) break;
    }
    nu = 2 * Math.atan2(
      Math.sqrt(orb.e + 1) * Math.sinh(H / 2),
      Math.sqrt(orb.e - 1) * Math.cosh(H / 2));
  } else {
    const E = solveKepler(M, orb.e);
    const den = 1 - orb.e * Math.cos(E);
    if (!(Math.abs(den) > 1e-14)) return null;
    const cosNu = (Math.cos(E) - orb.e) / den;
    const sinNu = Math.sqrt(Math.max(0, 1 - orb.e * orb.e)) * Math.sin(E) / den;
    nu = Math.atan2(sinNu, cosNu);
  }
  const r = positionAtTrueAnomaly(orb, nu);
  const v = velocityAtTrueAnomaly(orb, nu, mu ?? orbitMu(orb));
  return {
    r, v, nu,
    r_mag: v3mag(r),
    v_mag: v3mag(v),
  };
}

// Spacecraft position at simTime (seconds since J2000), scene coords (AU).
// 2-body Kepler propagation about the Sun. Returns null if not yet launched.
export function getSpacecraftPosition(sc, simTimeSec) {
  const launchSimTime = (sc.launchDate - J2000) / 1000;
  if (simTimeSec < launchSimTime) return null;
  if (!sc._orbit) {
    const r0 = [sc.pos_AU[0] * AU, sc.pos_AU[1] * AU, sc.pos_AU[2] * AU];
    sc._orbit = buildHelioOrbit(r0, sc.vel_m_s, G_CONST * SUN_DATA.mass);
  }
  const p = propagateHelioOrbit(sc._orbit, simTimeSec);
  return { x: p[0] / AU, y: p[1] / AU, z: p[2] / AU };
}
