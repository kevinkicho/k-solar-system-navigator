// Import HELIOS mission plan JSON (v1/v2) or a bare plan_request object.
// Always recomputes geometry — stored Δv / feasibility are never trusted.
// Keep top-level imports free of share.js (DOM/Three) so offline tests can load planJsonToRequest.

import { findByIdOrName } from '../data/catalog.js';
import { parseDateUTC, padDate } from './share-codec.js';
import { notify } from './format.js';
import { pushRecentRoute } from './recent-routes.js';

/**
 * Normalize a parsed JSON object into a plan_request-like structure for applyPlanRequest.
 * @returns {object|null} parsePlanRequest-compatible object
 */
export function planJsonToRequest(obj) {
  if (!obj || typeof obj !== 'object') return null;

  // Already a codec-shaped object with o/d/dep
  if (obj.o && obj.d && obj.dep) {
    return {
      originId: String(obj.o).toLowerCase(),
      destId: String(obj.d).toLowerCase(),
      depDate: parseDateUTC(obj.dep),
      tofDays: obj.tof != null ? parseInt(obj.tof, 10) : null,
      flybys: parseFbList(obj.fb),
      vehicleId: obj.veh || 'sh-starship',
      abstractBudget_m_s: obj.ab != null ? Number(obj.ab) : 8000,
      costBasis: obj.basis === 'mission' ? 'mission' : 'helio',
      view: obj.view === 'schematic' ? 'schematic' : 'cinematic',
      tofIgnoredMulti: false,
      cargoMass_kg: obj.cargo != null ? Number(obj.cargo) : 0,
      starshipArch: obj.arch || (obj.veh === 'sh-starship' || !obj.veh ? 'legacy-demo' : null),
      archOmitted: (obj.veh === 'sh-starship' || !obj.veh) && obj.arch == null,
      tankerCount: obj.tankers != null ? Number(obj.tankers) : 0,
      falcon9Variant: obj.f9v === 'asds' ? 'asds' : 'expendable',
      originSite: parseSiteObject(obj.originSite || obj.os),
      destSite: parseSiteObject(obj.destSite || obj.ds),
    };
  }

  // schema v1/v2/v3 export with nested plan_request
  if (obj.plan_request && obj.plan_request.o && obj.plan_request.d) {
    return planJsonToRequest(obj.plan_request);
  }

  const sum = obj.summary || {};
  const originId = sum.origin_id || sum.origin;
  const destId = sum.destination_id || sum.destination;
  if (!originId || !destId) return null;

  let depDate = null;
  if (sum.departure_utc) {
    const d = new Date(sum.departure_utc);
    if (!isNaN(d.getTime())) depDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
  }
  if (!depDate) return null;

  // Multi-leg from legs array
  const flybys = [];
  if (Array.isArray(obj.legs) && obj.legs.length > 1) {
    for (let i = 0; i < obj.legs.length - 1; i++) {
      const L = obj.legs[i];
      // intermediate arrivals are flybys (not final dest)
      if (i === 0) continue;
      // legs: 0=first, last=final; flyby bodies are leg[i].from for i>=1? better: leg[i-1].to for intermediate
    }
    // Prefer plan_request if present; else reconstruct from maneuvers flyby entries
  }
  if (Array.isArray(obj.maneuvers)) {
    for (const m of obj.maneuvers) {
      if (m.type === 'flyby' && m.body && m.epoch_utc) {
        const d = new Date(m.epoch_utc);
        if (!isNaN(d.getTime())) {
          flybys.push({
            bodyId: String(m.body).toLowerCase(),
            date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)),
          });
        }
      }
    }
  }

  let tofDays = null;
  if (sum.transit_days != null && flybys.length === 0) {
    tofDays = Math.round(Number(sum.transit_days));
  }

  const pr = obj.plan_request || {};
  const geo = obj.geographic || {};
  return {
    originId: String(originId).toLowerCase(),
    destId: String(destId).toLowerCase(),
    depDate,
    tofDays,
    flybys,
    vehicleId: pr.veh || obj.feasibility?.vehicle_id || 'sh-starship',
    abstractBudget_m_s: pr.ab != null ? Number(pr.ab) : 8000,
    costBasis: sum.cost_basis === 'mission' ? 'mission' : 'helio',
    view: obj.methodology?.display_mode === 'schematic' ? 'schematic' : 'cinematic',
    tofIgnoredMulti: false,
    cargoMass_kg: pr.cargo != null ? Number(pr.cargo) : (sum.cargo_mass_kg || 0),
    starshipArch: pr.arch || 'legacy-demo',
    archOmitted: pr.veh === 'sh-starship' && pr.arch == null,
    tankerCount: pr.tankers != null ? Number(pr.tankers) : 0,
    falcon9Variant: pr.f9v === 'asds' ? 'asds' : 'expendable',
    originSite: parseSiteObject(pr.originSite)
      || parseSiteFromGeo(geo.origin),
    destSite: parseSiteObject(pr.destSite)
      || parseSiteFromGeo(geo.destination),
  };
}

/** @param {object|string|null} s */
function parseSiteObject(s) {
  if (!s) return null;
  if (typeof s === 'string') {
    // lat,lon,alt_km compact
    const parts = s.split(',');
    if (parts.length < 3) return null;
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    const altKm = parseFloat(parts[2]);
    if (!isFinite(lat) || !isFinite(lon) || !isFinite(altKm)) return null;
    return { enabled: true, lat_deg: lat, lon_deg: lon, alt_m: altKm * 1000 };
  }
  if (typeof s === 'object' && (s.enabled || s.lat_deg != null)) {
    const lat = Number(s.lat_deg);
    const lon = Number(s.lon_deg);
    const alt = Number(s.alt_m);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return {
      enabled: s.enabled !== false,
      lat_deg: lat,
      lon_deg: lon,
      alt_m: isFinite(alt) ? alt : 100e3,
    };
  }
  return null;
}

function parseSiteFromGeo(g) {
  if (!g || !g.active) return null;
  return parseSiteObject({
    enabled: true,
    lat_deg: g.lat_deg,
    lon_deg: g.lon_deg,
    alt_m: g.alt_m,
  });
}

function parseFbList(fb) {
  if (!fb) return [];
  if (Array.isArray(fb)) {
    return fb.map((f) => {
      if (typeof f === 'string') {
        const [id, dateStr] = f.split('@');
        return { bodyId: id?.toLowerCase(), date: parseDateUTC(dateStr) };
      }
      return {
        bodyId: (f.id || f.bodyId || '').toLowerCase(),
        date: f.date instanceof Date ? f.date : parseDateUTC(f.date || f.dep),
      };
    }).filter((f) => f.bodyId && f.date);
  }
  if (typeof fb === 'string') {
    return fb.split(',').map((part) => {
      const [id, dateStr] = part.split('@');
      return { bodyId: id?.toLowerCase(), date: parseDateUTC(dateStr) };
    }).filter((f) => f.bodyId && f.date);
  }
  return [];
}

export async function importMissionPlanObject(obj) {
  const req = planJsonToRequest(obj);
  if (!req || !req.depDate) {
    notify('IMPORT FAILED — unrecognized plan JSON');
    return false;
  }
  // Ensure bodies exist
  if (!findByIdOrName(req.originId) || !findByIdOrName(req.destId)) {
    notify('IMPORT FAILED — unknown origin/destination');
    return false;
  }
  const { applyPlanRequest } = await import('./share.js');
  const ok = applyPlanRequest(req);
  if (ok) {
    pushRecentRoute({
      o: req.originId,
      d: req.destId,
      dep: padDate(req.depDate),
      label: `${req.originId} → ${req.destId}`,
    });
    notify('MISSION PLAN IMPORTED — geometry recomputed');
  }
  return ok;
}

export function wireMissionImport() {
  const input = document.getElementById('import-plan-file');
  const btn = document.getElementById('btn-import-plan');
  if (!input || !btn) return;

  btn.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      await importMissionPlanObject(obj);
    } catch (e) {
      notify('IMPORT FAILED — invalid JSON');
      console.error(e);
    }
  };
}
