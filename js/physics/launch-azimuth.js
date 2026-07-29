/**
 * Educational launch-azimuth + dogleg sketch for Earth departures.
 *
 * NOT range safety, NOT 6DOF ascent, NOT FAA/Range products.
 *
 * Spherical-Earth class formulas (prograde):
 *   cos(i) = sin(Az) * cos(φ)
 *   ⇒ sin(Az) = cos(i) / cos(φ)
 * where Az is azimuth from north (0° N, 90° due east), φ site latitude,
 * i desired inclination. Min achievable inclination ≈ |φ| (due east).
 *
 * Desired i for interplanetary asymptote sketch ≈ |DLA_eq| (educational).
 */

import { getLaunchSite } from '../data/launch-sites-edu.js';
import { planeChangeSketchForSite } from './launch-site-plane.js';

const DEG = Math.PI / 180;
const V_CIRC_LEO = 7800; // m/s educational LEO class

/**
 * @param {number|null} dla_eq_deg
 * @param {string} launchSiteId
 * @param {{ v_circ_m_s?: number, dogleg_efficiency?: number }} [opts]
 * @returns {object}
 */
export function launchAzimuthDoglegSketch(dla_eq_deg, launchSiteId, opts = {}) {
  const site = getLaunchSite(launchSiteId || 'any');
  const base = {
    site,
    dla_eq_deg: dla_eq_deg != null && Number.isFinite(dla_eq_deg) ? dla_eq_deg : null,
    i_des_deg: null,
    i_min_deg: site.lat_deg != null ? Math.abs(site.lat_deg) : null,
    azimuth_from_north_deg: null,
    azimuth_reachable: null,
    dogleg_needed: false,
    dogleg_di_deg: 0,
    dogleg_dv_m_s: 0,
    plane_change_dv_m_s: 0,
    recommended_addon_m_s: 0,
    note: '',
  };

  if (site.id === 'any' || site.lat_deg == null) {
    return {
      ...base,
      note: 'No site constraint — launch azimuth / dogleg sketch n/a.',
    };
  }
  if (dla_eq_deg == null || !Number.isFinite(dla_eq_deg)) {
    return {
      ...base,
      note: 'DLA unavailable — cannot sketch launch azimuth.',
    };
  }

  const phi = site.lat_deg;
  const iDes = Math.abs(dla_eq_deg);
  const iMin = Math.abs(phi);
  base.i_des_deg = iDes;
  base.i_min_deg = iMin;

  // Pure plane-change sketch (orbital, post-LEO) for comparison
  const plane = planeChangeSketchForSite(dla_eq_deg, launchSiteId, opts);
  base.plane_change_dv_m_s = plane.plane_change_dv_m_s || 0;

  // Azimuth for desired inclination (if achievable: i >= |φ|)
  if (iDes + 1e-9 < iMin) {
    // Cannot reach i < |lat| from this site — need plane change / dogleg after insertion at i≈|lat|
    base.azimuth_reachable = false;
    base.azimuth_from_north_deg = 90; // due-east class insertion at i≈|φ|
    base.dogleg_needed = true;
    base.dogleg_di_deg = iMin - iDes;
  } else {
    const cosPhi = Math.cos(phi * DEG);
    if (Math.abs(cosPhi) < 1e-9) {
      base.azimuth_reachable = false;
      base.azimuth_from_north_deg = null;
      base.note = 'Polar-latitude site — azimuth sketch degenerate.';
      return base;
    }
    const sinAz = Math.cos(iDes * DEG) / cosPhi;
    if (Math.abs(sinAz) > 1 + 1e-9) {
      base.azimuth_reachable = false;
      base.azimuth_from_north_deg = null;
      base.dogleg_needed = true;
      base.dogleg_di_deg = Math.max(0, iDes - iMin);
    } else {
      const clamped = Math.max(-1, Math.min(1, sinAz));
      // Two solutions: Az and 180−Az; take prograde eastern hemisphere
      const azRad = Math.asin(clamped);
      let azDeg = azRad / DEG;
      if (azDeg < 0) azDeg = 180 + azDeg;
      // Prefer az in (0, 180) prograde
      base.azimuth_from_north_deg = azDeg;
      base.azimuth_reachable = true;
      base.dogleg_needed = false;
      base.dogleg_di_deg = 0;
    }
  }

  // Dogleg Δv sketch: educational fraction of pure plane-change for the excess Δi
  const vCirc = opts.v_circ_m_s ?? V_CIRC_LEO;
  const eff = opts.dogleg_efficiency ?? 0.72; // dogleg during ascent often cheaper than pure LEO plane-change
  if (base.dogleg_needed && base.dogleg_di_deg > 0.05) {
    const pure = 2 * vCirc * Math.sin((base.dogleg_di_deg * DEG) / 2);
    base.dogleg_dv_m_s = pure * eff;
  } else if (plane.needed && plane.di_deg > 0.05) {
    // Site DLA band exceeded (launch-site-plane model) — dogleg/plane still needed
    base.dogleg_needed = true;
    base.dogleg_di_deg = plane.di_deg;
    const pure = plane.plane_change_dv_m_s || (2 * vCirc * Math.sin((plane.di_deg * DEG) / 2));
    base.dogleg_dv_m_s = pure * eff;
    base.plane_change_dv_m_s = pure;
  }

  // Recommended additive Need term: prefer dogleg sketch when available, else pure plane-change
  if (base.dogleg_needed && base.dogleg_dv_m_s > 0) {
    base.recommended_addon_m_s = base.dogleg_dv_m_s;
  } else if (plane.needed) {
    base.recommended_addon_m_s = plane.plane_change_dv_m_s || 0;
  } else {
    base.recommended_addon_m_s = 0;
  }

  const azTxt = base.azimuth_from_north_deg != null
    ? `Az≈${base.azimuth_from_north_deg.toFixed(1)}° from N`
    : 'Az n/a';
  const dogTxt = base.dogleg_needed
    ? ` · dogleg Δi≈${base.dogleg_di_deg.toFixed(1)}° Δv≈${(base.dogleg_dv_m_s / 1000).toFixed(2)} km/s (edu ${((opts.dogleg_efficiency ?? 0.72) * 100).toFixed(0)}% of pure plane-change)`
    : ' · no dogleg for DLA vs latitude class';
  base.note =
    `Launch geometry (${site.name}): i_des≈${iDes.toFixed(1)}° ( |DLA| ), i_min≈${iMin.toFixed(1)}° · ${azTxt}${dogTxt}. `
    + 'NOT range safety / NOT 6DOF ascent.';

  return base;
}

/**
 * Additive Need term (m/s) for Earth dep + constrained site using dogleg-preferring sketch.
 * @returns {number}
 */
export function doglegNeedAddon_m_s(td, launchSiteId, dla_eq_deg) {
  if (!td?.body1) return 0;
  const n = (td.body1.name || td.body1.id || '').toLowerCase();
  if (n !== 'earth') return 0;
  const sk = launchAzimuthDoglegSketch(dla_eq_deg, launchSiteId);
  return sk.recommended_addon_m_s > 0 ? sk.recommended_addon_m_s : 0;
}
