/**
 * Educational Cowell n-body residual (PR10).
 * Sun + 8 major planets as point masses; RK4 fixed step.
 * NEVER feeds Need/Δv — overlay only.
 */
import { AU, DAY, G_CONST } from '../constants.js';
import { BODIES, SUN_DATA } from '../data/bodies.js';
import { getBodyPosition3D } from './kepler.js';

const MU_SUN = G_CONST * SUN_DATA.mass;

function accelAt(r, t, planetNames) {
  // Sun at origin (heliocentric educational frame)
  const rmag = Math.hypot(r[0], r[1], r[2]) || 1;
  const a = [
    -MU_SUN * r[0] / (rmag ** 3),
    -MU_SUN * r[1] / (rmag ** 3),
    -MU_SUN * r[2] / (rmag ** 3),
  ];
  for (const name of planetNames) {
    const body = BODIES.find((b) => b.name === name);
    if (!body?.mass) continue;
    const p = getBodyPosition3D(body, t, false);
    const px = p.x * AU, py = p.y * AU, pz = p.z * AU;
    const dx = r[0] - px, dy = r[1] - py, dz = r[2] - pz;
    const d = Math.hypot(dx, dy, dz) || 1;
    const mu = G_CONST * body.mass;
    // Direct term only (simplified — educational residual)
    a[0] -= mu * dx / (d ** 3);
    a[1] -= mu * dy / (d ** 3);
    a[2] -= mu * dz / (d ** 3);
  }
  return a;
}

/**
 * Propagate state with RK4.
 * @param {number[]} r0_m
 * @param {number[]} v0_m_s
 * @param {number} t0
 * @param {number} tof
 * @param {number} nSteps
 * @returns {{ points_AU: Array<{x,y,z,t}>, residualHint: string }}
 */
export function cowellPropagate(r0_m, v0_m_s, t0, tof, nSteps = 200) {
  const planets = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
  const N = Math.max(10, Math.min(2000, nSteps | 0));
  const dt = tof / N;
  let r = r0_m.slice();
  let v = v0_m_s.slice();
  const points = [{
    x: r[0] / AU, y: r[1] / AU, z: r[2] / AU, t: t0,
  }];

  for (let i = 0; i < N; i++) {
    const t = t0 + i * dt;
    const a1 = accelAt(r, t, planets);
    const k1r = v, k1v = a1;

    const r2 = [r[0] + 0.5 * dt * k1r[0], r[1] + 0.5 * dt * k1r[1], r[2] + 0.5 * dt * k1r[2]];
    const v2 = [v[0] + 0.5 * dt * k1v[0], v[1] + 0.5 * dt * k1v[1], v[2] + 0.5 * dt * k1v[2]];
    const a2 = accelAt(r2, t + 0.5 * dt, planets);
    const k2r = v2, k2v = a2;

    const r3 = [r[0] + 0.5 * dt * k2r[0], r[1] + 0.5 * dt * k2r[1], r[2] + 0.5 * dt * k2r[2]];
    const v3 = [v[0] + 0.5 * dt * k2v[0], v[1] + 0.5 * dt * k2v[1], v[2] + 0.5 * dt * k2v[2]];
    const a3 = accelAt(r3, t + 0.5 * dt, planets);
    const k3r = v3, k3v = a3;

    const r4 = [r[0] + dt * k3r[0], r[1] + dt * k3r[1], r[2] + dt * k3r[2]];
    const v4 = [v[0] + dt * k3v[0], v[1] + dt * k3v[1], v[2] + dt * k3v[2]];
    const a4 = accelAt(r4, t + dt, planets);
    const k4r = v4, k4v = a4;

    r = [
      r[0] + (dt / 6) * (k1r[0] + 2 * k2r[0] + 2 * k3r[0] + k4r[0]),
      r[1] + (dt / 6) * (k1r[1] + 2 * k2r[1] + 2 * k3r[1] + k4r[1]),
      r[2] + (dt / 6) * (k1r[2] + 2 * k2r[2] + 2 * k3r[2] + k4r[2]),
    ];
    v = [
      v[0] + (dt / 6) * (k1v[0] + 2 * k2v[0] + 2 * k3v[0] + k4v[0]),
      v[1] + (dt / 6) * (k1v[1] + 2 * k2v[1] + 2 * k3v[1] + k4v[1]),
      v[2] + (dt / 6) * (k1v[2] + 2 * k2v[2] + 2 * k3v[2] + k4v[2]),
    ];
    if ((i + 1) % Math.max(1, Math.floor(N / 100)) === 0 || i === N - 1) {
      points.push({
        x: r[0] / AU, y: r[1] / AU, z: r[2] / AU, t: t0 + (i + 1) * dt,
      });
    }
  }

  return {
    points_AU: points,
    r_end_m: r.slice(),
    v_end_m_s: v.slice(),
    residualHint:
      'n-body coast overlay = analysis residual under Approximate Positions — not navigation OD; never feeds Need/Δv',
  };
}

/**
 * Quantitative residual for a transfer: Cowell-propagate Lambert v1 and report
 * arrival miss vs 2-body target. Analysis-only — never mutates Need.
 *
 * @param {object} td transfer with lambertOk, v1_lambert, dep, TOF, body2
 * @returns {{ miss_km: number, miss_AU: number, residualHint: string }|null}
 */
export function transferNbodyResidual(td, opts = {}) {
  if (!td?.lambertOk || !td.v1_lambert || td.departureSimTime == null || !(td.transferTime > 0)) {
    return null;
  }
  // Prefer physical dep position if available
  let r0;
  if (td.dep3DPhysical) {
    r0 = [td.dep3DPhysical.x * AU, td.dep3DPhysical.y * AU, td.dep3DPhysical.z * AU];
  } else if (td.r1v_m) {
    r0 = td.r1v_m.slice();
  } else if (td.body1) {
    const p = getBodyPosition3D(td.body1, td.departureSimTime, false);
    r0 = [p.x * AU, p.y * AU, p.z * AU];
  } else {
    return null;
  }
  let rTarget;
  if (td.arr3DPhysical) {
    rTarget = [td.arr3DPhysical.x * AU, td.arr3DPhysical.y * AU, td.arr3DPhysical.z * AU];
  } else if (td.r2v_m) {
    rTarget = td.r2v_m.slice();
  } else if (td.body2) {
    const p = getBodyPosition3D(td.body2, td.arrivalSimTime ?? (td.departureSimTime + td.transferTime), false);
    rTarget = [p.x * AU, p.y * AU, p.z * AU];
  } else {
    return null;
  }
  const nSteps = opts.nSteps ?? Math.min(800, Math.max(80, Math.floor(td.transferTime / DAY) * 4));
  const out = cowellPropagate(r0, td.v1_lambert, td.departureSimTime, td.transferTime, nSteps);
  const re = out.r_end_m;
  const dx = re[0] - rTarget[0];
  const dy = re[1] - rTarget[1];
  const dz = re[2] - rTarget[2];
  const miss_m = Math.hypot(dx, dy, dz);
  return {
    miss_km: miss_m / 1000,
    miss_AU: miss_m / AU,
    nSteps,
    residualHint: out.residualHint,
    note: 'Arrival miss of 2-body Lambert coast under Cowell n-body (analysis only — Need unchanged).',
  };
}

/** Smoke: 2-body Sun-only should stay near Kepler for short arc. */
export function cowellSunOnlyMatchesKeplerSmoke() {
  const r0 = [AU, 0, 0];
  const vCirc = Math.sqrt(MU_SUN / AU);
  const v0 = [0, vCirc, 0];
  const out = cowellPropagate(r0, v0, 0, 10 * DAY, 50);
  const last = out.points_AU[out.points_AU.length - 1];
  const r = Math.hypot(last.x, last.y, last.z);
  return Math.abs(r - 1) < 0.05; // loose educational
}
