/**
 * Moon sample fidelity gates + continuous parent-relative states.
 *
 * Short-period moons (Phobos ~7.7 h) cannot use multi-day sample tables —
 * cubic interp of undersampled orbits produces 1000s of km errors.
 * Prefer continuous Kepler (or dense SPICE-baked tables when step is fine enough).
 *
 * Target class for Mars system: minute-level TOF continuity, km-class relative
 * geometry (educational Kepler/SPICE-bake — not flight OD).
 */

import { AU, DAY } from '../constants.js';
import { getMoonRelativePositionAU } from './kepler.js';

/** Minimum samples per orbital period before a discrete table is usable.
 *  ~46 samples/orbit at 10 min for Phobos (P≈7.65 h) — cubic Hermite class. */
export const MIN_SAMPLES_PER_ORBIT = 40;

/**
 * Adaptive finite-difference half-step (s) for velocity from positions.
 * Targets ~minute or finer for Phobos-class moons.
 */
export function adaptiveVelocityDtSec(periodSec) {
  if (!(periodSec > 0) || !Number.isFinite(periodSec)) return 60;
  // Aim for period/800 … clamped to [1 s, 300 s]
  const dt = periodSec / 800;
  return Math.max(1, Math.min(300, dt));
}

/**
 * True when a sample table's step is dense enough for this moon's period.
 * @param {number} stepSec table step
 * @param {number} periodSec orbital period
 */
export function moonSampleCadenceOk(stepSec, periodSec) {
  if (!(stepSec > 0) || !(periodSec > 0)) return false;
  return stepSec <= periodSec / MIN_SAMPLES_PER_ORBIT;
}

/**
 * Body orbital period (s) when available.
 */
export function bodyPeriodSec(body) {
  if (!body) return null;
  if (body.period > 0) return body.period;
  if (body.a_km > 0 && body.parent) {
    // Not enough mu here — caller should prefer body.period
    return null;
  }
  return null;
}

/**
 * Continuous parent-relative position (AU, scene axes) from Kepler moon model.
 */
export function continuousMoonRelativePositionAU(moon, timeSec) {
  if (!moon?.a_km || !(moon.period > 0)) return null;
  return getMoonRelativePositionAU(moon, timeSec);
}

/**
 * Continuous parent-relative velocity (m/s) via adaptive central difference
 * on the Kepler moon model (minute-class for Phobos).
 */
export function continuousMoonRelativeVelocity_m_s(moon, timeSec) {
  if (!moon?.period) return null;
  const dt = adaptiveVelocityDtSec(moon.period);
  const ra = getMoonRelativePositionAU(moon, timeSec - dt);
  const rb = getMoonRelativePositionAU(moon, timeSec + dt);
  if (!ra || !rb) return null;
  return [
    (rb.x - ra.x) * AU / (2 * dt),
    (rb.y - ra.y) * AU / (2 * dt),
    (rb.z - ra.z) * AU / (2 * dt),
  ];
}

/**
 * Estimate relative position error (km) from undersampled table vs continuous.
 * Order-of-magnitude: for circular orbit radius R, phase error δθ ~ (step/P)²
 * with cubic Hermite residual class — educational, not a formal covariance.
 *
 * @returns {{ mode: string, est_err_km: number, time_res_s: number, note: string }}
 */
export function estimateMoonRelativeAccuracy(moon, stepSec = null) {
  const P = moon?.period;
  const R_km = moon?.a_km;
  if (!(P > 0) || !(R_km > 0)) {
    return {
      mode: 'unknown',
      est_err_km: Infinity,
      time_res_s: null,
      note: 'Missing moon period/a_km.',
    };
  }
  if (stepSec == null || !moonSampleCadenceOk(stepSec, P)) {
    // Continuous Kepler: time res = adaptive velocity dt; spatial error dominated
    // by element fidelity (educational), not sampling — quote ~few km class for
    // near-circular Mars moons over short arcs.
    const dt = adaptiveVelocityDtSec(P);
    const est = Math.max(0.5, R_km * 1e-4); // ~0.1% of a as element-class floor
    return {
      mode: 'continuous-kepler',
      est_err_km: est,
      time_res_s: dt,
      note:
        `Continuous parent-relative Kepler · time res ~${dt.toFixed(0)} s · `
        + `spatial ~${est.toFixed(2)} km class (element fidelity, not SPICE OD).`,
    };
  }
  // Discrete table residual class: δθ ~ 2π (step/P)² / 24 (cubic-ish)
  const phase = (2 * Math.PI) * ((stepSec / P) ** 2) / 24;
  const est = Math.max(0.1, R_km * phase);
  return {
    mode: 'dense-sample',
    est_err_km: est,
    time_res_s: stepSec,
    note: `Dense sample step ${stepSec}s · est relative err ~${est.toFixed(2)} km.`,
  };
}

/**
 * Helio Mars (or planet) cubic sample residual class vs step.
 * Mars |v| ~ 24 km/s; cubic Hermite on DE steps of a few days is typically
 * sub-km to few-km for smooth heliocentric arcs (educational estimate).
 */
export function estimatePlanetSampleAccuracy(stepSec, v_km_s = 24) {
  if (!(stepSec > 0)) {
    return { est_err_km: Infinity, time_res_s: null, note: 'No step.' };
  }
  // Heuristic: residual ~ 0.01 * v * step * (step/1d)^2 for multi-day DE tables
  const dayFrac = stepSec / DAY;
  const est = 0.02 * v_km_s * stepSec * (dayFrac * dayFrac) / 1000; // rough km
  const clamped = Math.max(0.1, Math.min(50, est));
  return {
    est_err_km: clamped,
    time_res_s: stepSec,
    note: `Planet sample step ${stepSec / DAY}d · est helio err ~${clamped.toFixed(2)} km class (cubic DE table).`,
  };
}

export { DAY };
