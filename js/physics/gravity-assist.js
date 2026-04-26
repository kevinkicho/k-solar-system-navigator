import { G_CONST } from '../constants.js';
import { v3dot, v3mag } from './vec3.js';

// Minimum hyperbolic excess speed (m/s) for the patched-conic flyby model to
// be physically meaningful. Below this, the spacecraft is effectively captured
// by the planet's gravity rather than swinging by it on a hyperbolic arc, and
// the rPeriapsis formula divides by ~0.
const MIN_VINF_M_S = 100;

// Patched-conic flyby relations (hyperbolic, planet-centered frame):
//   eccentricity:  e = 1 + r_p · V∞² / μ_planet
//   turning angle: sin(δ/2) = 1/e
//   so δ_max at min r_p, and r_p(δ) = μ/V∞² · (1/sin(δ/2) − 1).
//
// The Δv for a powered flyby is computed at periapsis where the Oberth effect
// is maximal: V_periapsis = √(V∞² + 2μ/r_p), so a velocity-aligned burn at
// periapsis costs Δv = | √(V∞_out² + 2μ/r_p) − √(V∞_in² + 2μ/r_p) |.  This is
// significantly less than |V∞_out − V∞_in| at deep flybys (the Oberth gain),
// which the previous "magnitude difference at infinity" model overstated.
export function gravityAssistInfo(planet, vInfIn, vInfOut) {
  const mu_p = G_CONST * planet.mass;
  const minR = planet.radius * 1.1;

  const magIn  = v3mag(vInfIn);
  const magOut = v3mag(vInfOut);

  // Capture detection: V∞ near zero means the spacecraft can't escape the
  // planet's SOI hyperbolically. Patched-conic doesn't apply.
  if (magIn < MIN_VINF_M_S || magOut < MIN_VINF_M_S) {
    return {
      vInfInMag:  magIn,
      vInfOutMag: magOut,
      dvFlyby:    Math.abs(magOut - magIn),
      turningAngle: 0,
      rPeriapsis: Infinity,
      minR,
      achievable: false,
      reason: 'capture (V∞ < 100 m/s)',
      maxTurningAngle: 0,
    };
  }

  const magAvg = 0.5 * (magIn + magOut);
  const cosDelta = Math.max(-1, Math.min(1, v3dot(vInfIn, vInfOut) / (magIn * magOut)));
  const turningAngle = Math.acos(cosDelta);

  const sinHalf = Math.sin(turningAngle / 2);
  const rPeriapsis = sinHalf > 1e-6
    ? mu_p / (magAvg * magAvg) * (1 / sinHalf - 1)
    : Infinity;

  const eMin = 1 + minR * magAvg * magAvg / mu_p;
  const maxTurningAngle = 2 * Math.asin(1 / eMin);

  // Oberth-correct powered Δv at periapsis. Use the chosen rPeriapsis when
  // achievable; otherwise the planet's minimum-safe periapsis (the user has
  // already been warned the turn is TOO SHARP, but we still want a meaningful
  // Δv estimate).
  const rEval = (rPeriapsis >= minR && isFinite(rPeriapsis)) ? rPeriapsis : minR;
  const vPeriIn  = Math.sqrt(magIn  * magIn  + 2 * mu_p / rEval);
  const vPeriOut = Math.sqrt(magOut * magOut + 2 * mu_p / rEval);
  const dvFlyby = Math.abs(vPeriOut - vPeriIn);

  return {
    vInfInMag:  magIn,
    vInfOutMag: magOut,
    dvFlyby,
    turningAngle,
    rPeriapsis,
    minR,
    achievable: rPeriapsis >= minR,
    maxTurningAngle,
  };
}
