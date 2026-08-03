/**
 * Residual / trust dashboard — analysis overlays only (never mutates Need).
 */

import { transferNbodyResidual } from './nbody-cowell.js';
import { fullAsymptotePackage, departureVinfVec } from './departure-asymptote.js';
import { planeChangeSketchForSite } from './launch-site-plane.js';
import { getLaunchSite } from '../data/launch-sites-edu.js';

/**
 * Build residual dashboard snapshot from transferData + app state.
 * @param {object} td transferData
 * @param {object} appState
 */
export function buildResidualDashboard(td, appState = {}) {
  const items = [];
  const product = {
    product_class: 'preliminary-not-flight-certified',
    note: 'Residuals are educational analysis overlays — not OD covariance, not navigation.',
  };

  if (!td) {
    return { ...product, items: [], readiness: 'incomplete' };
  }

  // Path geometry honesty
  const geom = appState.pathGeometry || 'physical';
  items.push({
    id: 'path_geometry',
    level: geom === 'physical' || geom === 'both' ? 'ok' : 'warn',
    title: `Path geometry: ${geom}`,
    detail: geom === 'visual'
      ? 'Visual path may diverge from Need/ship — prefer product physical'
      : 'Physical/both aligns ship≡line with Need',
  });

  // n-body residual (single-leg only)
  if (!td.isMultiLeg && (appState.pathAccuracy?.nbodyOverlay || td.nbodyResidual)) {
    try {
      const res = td.nbodyResidual || transferNbodyResidual(td);
      if (res) {
        items.push({
          id: 'nbody',
          level: 'info',
          title: 'n-body coast residual (Cowell sketch)',
          detail: `miss ≈ ${Number(res.miss_km).toExponential(2)} km · analysis only · not OD`,
          miss_km: res.miss_km,
          miss_AU: res.miss_AU,
        });
      }
    } catch {
      items.push({
        id: 'nbody',
        level: 'info',
        title: 'n-body residual unavailable',
        detail: 'Enable n-body overlay after single-leg compute',
      });
    }
  } else if (td.isMultiLeg) {
    items.push({
      id: 'nbody',
      level: 'info',
      title: 'n-body residual N/A on multi-leg',
      detail: 'Cowell sketch is single-leg only in this product',
    });
  }

  // Fidelity
  items.push({
    id: 'fidelity',
    level: appState.ephemerisBackend === 'approx' ? 'warn' : 'ok',
    title: `Ephemeris: ${appState.ephemerisBackend || '—'} · ${appState.fidelityLevel || '—'}`,
    detail: appState.horizonsEndpointInject
      ? 'Horizons inject ON (network · analysis)'
      : 'Offline sample-DE / L3 preferred for product pipeline',
  });

  // Launch geometry sketch
  try {
    const v1 = td.v1 || td.v_depart || td.v1_mps || null;
    const vPlanet = td.vPlanet1 || td.v_planet_dep || td.vPlanet_dep || null;
    // Prefer dossier geometry if present
    const geo = td.dossier?.geometry?.asymptote || td.asymptote || null;
    if (geo || (v1 && vPlanet)) {
      let asym = geo;
      if (!asym && v1 && vPlanet) {
        const vInf = departureVinfVec(v1, vPlanet);
        const pack = fullAsymptotePackage(vInf, { earthDeparture: true });
        asym = pack
          ? {
              dla_deg: pack.equatorial_approx?.dla_deg ?? pack.ecliptic?.dla_deg,
              rla_deg: pack.equatorial_approx?.rla_deg ?? pack.ecliptic?.rla_deg,
              vinf_m_s: pack.vinf_m_s,
              ecliptic: pack.ecliptic,
              equatorial_approx: pack.equatorial_approx,
            }
          : null;
      }
      let plane = null;
      const siteId = appState.launchSiteId || 'any';
      if (asym?.dla_deg != null) {
        try {
          plane = planeChangeSketchForSite(asym.dla_deg, siteId, {});
        } catch { /* */ }
      }
      const site = getLaunchSite(siteId);
      items.push({
        id: 'launch_geometry',
        level: plane?.needed ? 'warn' : 'info',
        title: 'Departure asymptote / site plane (sketch)',
        detail: asym
          ? `DLA≈${fmtDeg(asym.dla_deg)} · RLA≈${fmtDeg(asym.rla_deg)} · site=${site?.name || siteId}${
            plane?.needed && plane.plane_change_dv_m_s != null
              ? ` · plane Δv sketch ${(plane.plane_change_dv_m_s / 1000).toFixed(2)} km/s`
              : ''
          }`
          : 'Asymptote unavailable',
        asymptote: asym,
        plane_change: plane,
      });
    }
  } catch {
    items.push({
      id: 'launch_geometry',
      level: 'info',
      title: 'Launch geometry sketch pending',
      detail: 'Requires computed dep v∞ vectors',
    });
  }

  // DSM sketch if present
  const dsm = appState.dsmNodes;
  if (Array.isArray(dsm) && dsm.length) {
    const sum = dsm.reduce((s, n) => s + (Number(n.dv_m_s) || 0), 0);
    items.push({
      id: 'dsm',
      level: 'info',
      title: `DSM sketch · ${dsm.length} node(s) · Σ${(sum / 1000).toFixed(2)} km/s`,
      detail: 'Educational add-on — not re-optimized Lambert',
    });
  }

  // Horizons inject residual class (if last compare stored on td)
  const hz = td.horizonsCompare || td.horizonsResidual || appState.lastHorizonsCompare || null;
  if (hz) {
    const dr = hz.delta_r_km ?? hz.dr_km ?? hz.miss_km;
    items.push({
      id: 'horizons',
      level: dr != null && Number(dr) > 1e5 ? 'warn' : 'info',
      title: 'Horizons inject / compare residual',
      detail: dr != null
        ? `Δr class ≈ ${Number(dr).toExponential(2)} km · analysis only · not OD`
        : (hz.note || 'Horizons compare recorded'),
    });
  } else if (appState.horizonsEndpointInject) {
    items.push({
      id: 'horizons',
      level: 'info',
      title: 'Horizons inject ON',
      detail: 'Live VECTORS at dep/arr for Need — residual card fills after compare/inject',
    });
  }

  return {
    ...product,
    items,
    readiness: td.dossier?.mission_ready ? 'ready' : (td.lambertOk ? 'blocked' : 'incomplete'),
    generated_at: new Date().toISOString(),
  };
}

function fmtDeg(v) {
  return v != null && isFinite(v) ? `${Number(v).toFixed(1)}°` : '—';
}
