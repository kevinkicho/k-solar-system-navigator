/**
 * Launch Geometry Card — asymptote + site plane report (educational).
 * Not range safety / not flight-certified.
 */

import { fullAsymptotePackage, departureVinfVec } from './departure-asymptote.js';
import { planeChangeSketchForSite } from './launch-site-plane.js';
import { getLaunchSite } from '../data/launch-sites-edu.js';

/**
 * Build launch geometry report from transferData + state.
 * @param {object} td
 * @param {object} appState
 */
export function buildLaunchGeometryCard(td, appState = {}) {
  const siteId = appState.launchSiteId || 'any';
  const site = getLaunchSite(siteId);
  const product = {
    product_class: 'preliminary-not-flight-certified',
    disclaimer: 'Educational asymptote / site plane sketch — not range safety, not flight release.',
  };

  if (!td) {
    return { ...product, ok: false, error: 'no transfer', site };
  }

  // Prefer dossier geometry
  let dla_deg = td.dossier?.geometry?.dla_deg
    ?? td.dossier?.geometry?.asymptote?.dla_deg
    ?? td.asymptote?.dla_deg
    ?? null;
  let rla_deg = td.dossier?.geometry?.rla_deg
    ?? td.dossier?.geometry?.asymptote?.rla_deg
    ?? td.asymptote?.rla_deg
    ?? null;
  let vinf_m_s = td.dossier?.geometry?.vinf_dep_m_s
    ?? td.need?.vinf_dep_m_s
    ?? null;
  let pack = null;

  if (dla_deg == null || vinf_m_s == null) {
    try {
      const v1 = td.v1 || td.v_depart;
      const vP = td.vPlanet1 || td.v_planet_dep;
      if (v1 && vP) {
        const vInf = departureVinfVec(v1, vP);
        pack = fullAsymptotePackage(vInf, { earthDeparture: true });
        if (pack) {
          vinf_m_s = pack.vinf_m_s;
          dla_deg = pack.equatorial_approx?.dla_deg ?? pack.ecliptic?.dla_deg;
          rla_deg = pack.equatorial_approx?.rla_deg ?? pack.ecliptic?.rla_deg;
        }
      }
    } catch { /* */ }
  }

  const plane = dla_deg != null
    ? planeChangeSketchForSite(dla_deg, siteId, {})
    : { needed: false, note: 'DLA unavailable' };

  const lines = [
    `Site: ${site?.name || siteId} (lat ${site?.lat_deg ?? '—'}°)`,
    `v∞ dep: ${vinf_m_s != null ? `${(vinf_m_s / 1000).toFixed(3)} km/s` : '—'}`,
    `DLA: ${dla_deg != null ? `${Number(dla_deg).toFixed(2)}°` : '—'}`,
    `RLA: ${rla_deg != null ? `${Number(rla_deg).toFixed(2)}°` : '—'}`,
    plane.needed
      ? `Plane-change sketch: Δi≈${plane.di_deg?.toFixed?.(2) ?? plane.di_deg}° · Δv≈${
        plane.plane_change_dv_m_s != null ? `${(plane.plane_change_dv_m_s / 1000).toFixed(2)} km/s` : '—'
      }`
      : `Plane-change: ${plane.note || 'not required for site band'}`,
  ];

  return {
    ...product,
    ok: true,
    site: {
      id: siteId,
      name: site?.name || siteId,
      lat_deg: site?.lat_deg ?? null,
      dla_max_deg: site?.dla_max_deg ?? null,
    },
    asymptote: {
      dla_deg,
      rla_deg,
      vinf_m_s,
      equatorial: pack?.equatorial_approx || null,
      ecliptic: pack?.ecliptic || null,
    },
    plane_change: plane,
    lines,
    generated_at: new Date().toISOString(),
  };
}

export function formatLaunchGeometryMarkdown(card) {
  if (!card?.ok) return '# Launch Geometry\n\n(unavailable)\n';
  return [
    '# Launch Geometry Card',
    '',
    `**${card.disclaimer}**`,
    '',
    ...card.lines.map((l) => `- ${l}`),
    '',
    `Generated: ${card.generated_at}`,
    '',
  ].join('\n');
}
