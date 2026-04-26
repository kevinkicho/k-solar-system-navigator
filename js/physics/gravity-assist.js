import { G_CONST } from '../constants.js';
import { v3dot, v3mag } from './vec3.js';

// Patched-conic flyby relations:
//   eccentricity:  e = 1 + r_p · V∞² / μ_planet
//   turning angle: sin(δ/2) = 1/e
//   so δ_max at min r_p, and r_p(δ) = μ/V∞² · (1/sin(δ/2) − 1).
export function gravityAssistInfo(planet, vInfIn, vInfOut) {
  const mu_p = G_CONST * planet.mass;
  const minR = planet.radius * 1.1;

  const magIn  = v3mag(vInfIn);
  const magOut = v3mag(vInfOut);
  const dvFlyby = Math.abs(magOut - magIn);

  const magAvg = 0.5 * (magIn + magOut);
  const cosDelta = Math.max(-1, Math.min(1, v3dot(vInfIn, vInfOut) / (magIn * magOut)));
  const turningAngle = Math.acos(cosDelta);

  const sinHalf = Math.sin(turningAngle / 2);
  const rPeriapsis = sinHalf > 1e-6
    ? mu_p / (magAvg * magAvg) * (1 / sinHalf - 1)
    : Infinity;

  const eMin = 1 + minR * magAvg * magAvg / mu_p;
  const maxTurningAngle = 2 * Math.asin(1 / eMin);

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
