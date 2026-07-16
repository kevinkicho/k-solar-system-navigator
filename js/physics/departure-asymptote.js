/**
 * Departure asymptote angles from V∞ vector (educational).
 * Ecliptic-class always; Earth-equatorial via mean J2000 obliquity (approx).
 * Not range-safety / flight DLA products.
 */

import { DEG } from '../constants.js';
import { v3mag, v3sub } from './vec3.js';

/** Mean obliquity of the ecliptic at J2000 (deg). */
export const OBLIQUITY_J2000_DEG = 23.43928;
export const OBLIQUITY_J2000_RAD = OBLIQUITY_J2000_DEG * DEG;

/**
 * @param {number[]} vInf_mps [vx,vy,vz] in HELIOS physics axes
 *   (x,z ecliptic plane; y ≈ ecliptic north / out-of-plane)
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
  const decl = Math.asin(Math.max(-1, Math.min(1, vy / mag)));
  const ra = Math.atan2(vz, vx);
  return {
    vinf_m_s: mag,
    dla_ecliptic_deg: decl / DEG,
    rla_ecliptic_deg: ((ra / DEG) % 360 + 360) % 360,
    frame: 'HELIOS ecliptic-class (physics axes; not Earth-equatorial DLA)',
  };
}

/**
 * Rotate HELIOS ecliptic physics V∞ to approximate Earth equatorial.
 * Physics axes: X_ecl, Y_ecl_out (HELIOS y), Z_ecl.
 * Equatorial: rotate about X by +ε so Z_eq is Earth polar-ish (mean equinox J2000 class).
 *
 * @param {number[]} vInf_mps
 * @returns {{
 *   vinf_m_s: number,
 *   dla_eq_deg: number,
 *   rla_eq_deg: number,
 *   frame: string,
 *   obliquity_model: string,
 * }|null}
 */
export function eclipticVinfToEquatorialDlaRla(vInf_mps) {
  if (!vInf_mps || vInf_mps.length < 3) return null;
  const [vx, vy, vz] = vInf_mps;
  const mag = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (!(mag > 1e-6)) return null;
  const c = Math.cos(OBLIQUITY_J2000_RAD);
  const s = Math.sin(OBLIQUITY_J2000_RAD);
  // HELIOS y = ecliptic Z; HELIOS z = ecliptic Y-ish
  // Standard ecliptic (X,Y_ecl,Z_ecl) with Z out of plane = (vx, vz, vy)
  const Xe = vx;
  const Ye = vz;
  const Ze = vy;
  // Rotate about X by +ε: Y' = Y cosε − Z sinε; Z' = Y sinε + Z cosε
  const Yeq = Ye * c - Ze * s;
  const Zeq = Ye * s + Ze * c;
  const Xeq = Xe;
  const mag2 = Math.sqrt(Xeq * Xeq + Yeq * Yeq + Zeq * Zeq);
  if (!(mag2 > 1e-6)) return null;
  const dla = Math.asin(Math.max(-1, Math.min(1, Zeq / mag2))) / DEG;
  const rla = ((Math.atan2(Yeq, Xeq) / DEG) % 360 + 360) % 360;
  return {
    vinf_m_s: mag,
    dla_eq_deg: dla,
    rla_eq_deg: rla,
    frame: 'Earth mean equator / equinox (J2000 mean obliquity approx)',
    obliquity_model: 'J2000_mean_23.43928',
    disclaimer:
      'Educational Earth-equatorial DLA/RLA — mean obliquity only, not IAU full EOP, not range safety.',
  };
}

/**
 * Full asymptote package.
 * @param {number[]} vInf_mps
 * @param {{ earthDeparture?: boolean }} [opts]
 */
export function fullAsymptotePackage(vInf_mps, opts = {}) {
  const ecl = asymptoteAnglesFromVinf(vInf_mps);
  if (!ecl) return null;
  const out = {
    ecliptic: {
      dla_deg: ecl.dla_ecliptic_deg,
      rla_deg: ecl.rla_ecliptic_deg,
      frame: ecl.frame,
    },
    vinf_m_s: ecl.vinf_m_s,
    equatorial_approx: null,
    disclaimer: 'Educational asymptote angles — not range-safety products.',
  };
  if (opts.earthDeparture) {
    const eq = eclipticVinfToEquatorialDlaRla(vInf_mps);
    if (eq) {
      out.equatorial_approx = {
        dla_deg: eq.dla_eq_deg,
        rla_deg: eq.rla_eq_deg,
        frame: eq.frame,
        obliquity_model: eq.obliquity_model,
        disclaimer: eq.disclaimer,
      };
    }
  }
  return out;
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
