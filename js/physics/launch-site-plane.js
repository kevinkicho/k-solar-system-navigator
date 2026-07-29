/**
 * Educational launch-site plane-change sketch vs asymptote DLA.
 * NOT range safety, NOT dogleg optimization, NOT 6DOF ascent.
 *
 * Model: if |DLA_eq| exceeds educational site latitude band, estimate a
 * rough plane-change Δv at circular LEO-class speed:
 *   Δv ≈ 2 v_circ sin(|Δi|/2)
 * where Δi = |DLA| − site_lat_band (deg), v_circ ≈ 7.8 km/s (Earth LEO class).
 */

import { getLaunchSite } from '../data/launch-sites-edu.js';

const V_CIRC_EARTH_LEO_M_S = 7800;
const DEG2RAD = Math.PI / 180;

/**
 * @param {number|null} dla_eq_deg equatorial-class DLA
 * @param {string} launchSiteId
 * @param {{ v_circ_m_s?: number }} [opts]
 * @returns {{ needed: boolean, di_deg: number, plane_change_dv_m_s: number|null, site, note: string }}
 */
export function planeChangeSketchForSite(dla_eq_deg, launchSiteId, opts = {}) {
  const site = getLaunchSite(launchSiteId || 'any');
  if (site.id === 'any' || site.dla_max_deg == null || site.lat_deg == null) {
    return {
      needed: false,
      di_deg: 0,
      plane_change_dv_m_s: null,
      site,
      note: 'No site band — plane-change sketch n/a.',
    };
  }
  if (dla_eq_deg == null || !Number.isFinite(dla_eq_deg)) {
    return {
      needed: false,
      di_deg: 0,
      plane_change_dv_m_s: null,
      site,
      note: 'DLA unavailable — cannot sketch plane change.',
    };
  }
  const absDla = Math.abs(dla_eq_deg);
  const band = site.dla_max_deg;
  const di = Math.max(0, absDla - band);
  if (di <= 0.05) {
    return {
      needed: false,
      di_deg: 0,
      plane_change_dv_m_s: 0,
      site,
      note: `|DLA| ${absDla.toFixed(1)}° within educational band ${band}° (${site.name}).`,
    };
  }
  const vCirc = opts.v_circ_m_s ?? V_CIRC_EARTH_LEO_M_S;
  const dv = 2 * vCirc * Math.sin((di * DEG2RAD) / 2);
  return {
    needed: true,
    di_deg: di,
    plane_change_dv_m_s: dv,
    site,
    note:
      `Educational plane-change sketch: |DLA| ${absDla.toFixed(1)}° vs band ${band}° `
      + `→ Δi≈${di.toFixed(1)}° · Δv≈${(dv / 1000).toFixed(2)} km/s at LEO-class v_circ. `
      + 'NOT range safety / NOT dogleg design.',
  };
}

/**
 * Optional additive term for Need when Earth departure + site constrained.
 * @returns {number} m/s to add (0 if n/a)
 */
export function planeChangeNeedAddon_m_s(td, launchSiteId, dla_eq_deg) {
  if (!td?.body1) return 0;
  const n = (td.body1.name || td.body1.id || '').toLowerCase();
  if (n !== 'earth') return 0;
  const sk = planeChangeSketchForSite(dla_eq_deg, launchSiteId);
  if (!sk.needed || sk.plane_change_dv_m_s == null) return 0;
  return sk.plane_change_dv_m_s;
}
