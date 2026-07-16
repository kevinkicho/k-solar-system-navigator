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
    };
  }

  // schema v1/v2 export
  const pr = obj.plan_request;
  if (pr && pr.o && pr.d) return planJsonToRequest(pr);

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

  return {
    originId: String(originId).toLowerCase(),
    destId: String(destId).toLowerCase(),
    depDate,
    tofDays,
    flybys,
    vehicleId: obj.feasibility?.vehicle_id || 'sh-starship',
    abstractBudget_m_s: 8000,
    costBasis: sum.cost_basis === 'mission' ? 'mission' : 'helio',
    view: obj.methodology?.display_mode === 'schematic' ? 'schematic' : 'cinematic',
    tofIgnoredMulti: false,
  };
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
