/**
 * Departure asymptote angles from V∞ vector (educational).
 * Frame: HELIOS heliocentric ecliptic components of v_inf (m/s).
 * Labeled as ecliptic-class DLA/RLA — not Earth-equatorial handbook DLA until EOP transform.
 */

import { DEG } from '../constants.js';
import { v3mag, v3sub } from './vec3.js';

/**
 * @param {number[]} vInf_mps [vx,vy,vz] in HELIOS scene axes (physics)
 * @returns {{
 *   vinf_m_s: number,
 *   dla_ecliptic_deg: number,
 *   rla_ecliptic_deg: number,
 *   frame: string,
 * }|null}
 */
export function asymptoteAnglesFromVinf(vInf_mps) {
  if (!vInf_mps || vInf_mps.length < 3) return null;
  const [vx, vy, vz] = vInf_mps;
  const mag = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (!(mag > 1e-6)) return null;
  // HELIOS: x,z in ecliptic plane-ish; y often out-of-plane (see kepler visual swap).
  // For physics (exaggerate false), y is ecliptic Z (out of plane).
  const decl = Math.asin(Math.max(-1, Math.min(1, vy / mag)));
  const ra = Math.atan2(vz, vx); // longitude of asymptote in ecliptic xz
  return {
    vinf_m_s: mag,
    dla_ecliptic_deg: decl / DEG,
    rla_ecliptic_deg: ((ra / DEG) % 360 + 360) % 360,
    frame: 'HELIOS ecliptic-class (physics axes; not Earth-equatorial DLA)',
  };
}

/**
 * Build v_inf from Lambert v1 and planet velocity arrays.
 */
export function departureVinfVec(v1_lambert, vPlanet) {
  if (!v1_lambert || !vPlanet) return null;
  return v3sub(v1_lambert, vPlanet);
}

export function arrivalVinfVec(v2_lambert, vPlanet) {
  if (!v2_lambert || !vPlanet) return null;
  return v3sub(v2_lambert, vPlanet);
}

export function vinfMagnitude(vInf) {
  if (!vInf) return null;
  return v3mag(vInf);
}
