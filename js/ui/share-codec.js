// Pure share URL codec (no DOM). Used by share.js and offline tests.

import { DAY } from '../constants.js';
import { bodyId, findByIdOrName } from '../data/catalog.js';

export const MAX_FLYS = 6;
export const MAX_LEN = 1800; // slightly larger for optional geographic sites

export function padDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateUTC(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [Y, M, D] = s.split('-').map(Number);
  if (Y < 1800 || Y > 2050) return null;
  return new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
}

/**
 * Compact geographic site for share hash: lat,lon,alt_km (3 decimals / 1 decimal).
 * @param {{enabled?:boolean,lat_deg?:number,lon_deg?:number,alt_m?:number}|null} site
 * @returns {string|null}
 */
export function encodeSiteParam(site) {
  if (!site || !site.enabled) return null;
  const lat = Number(site.lat_deg);
  const lon = Number(site.lon_deg);
  const altKm = Number(site.alt_m) / 1000;
  if (!isFinite(lat) || !isFinite(lon) || !isFinite(altKm)) return null;
  if (lat < -90 || lat > 90) return null;
  return `${lat.toFixed(3)},${lon.toFixed(3)},${altKm.toFixed(1)}`;
}

/**
 * @param {string|null} raw
 * @returns {{enabled:true,lat_deg:number,lon_deg:number,alt_m:number}|null}
 */
export function parseSiteParam(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split(',');
  if (parts.length < 3) return null;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  const altKm = parseFloat(parts[2]);
  if (!isFinite(lat) || !isFinite(lon) || !isFinite(altKm)) return null;
  if (lat < -90 || lat > 90) return null;
  if (altKm < 0 || altKm > 1e5) return null;
  return {
    enabled: true,
    lat_deg: lat,
    lon_deg: lon,
    alt_m: altKm * 1000,
  };
}

/**
 * Encode a plan_request object (not app state).
 * @param {object} plan
 */
export function encodePlanRequestObject(plan) {
  if (!plan?.o || !plan?.d || !plan?.dep) return null;
  const params = new URLSearchParams();
  params.set('v', '1');
  params.set('o', plan.o);
  params.set('d', plan.d);
  params.set('dep', plan.dep);
  if (plan.tof != null && !(plan.fb && plan.fb.length)) params.set('tof', String(plan.tof));
  if (plan.fb?.length) {
    params.set('fb', plan.fb.slice(0, MAX_FLYS).map(f => `${f.id}@${f.date}`).join(','));
  }
  params.set('veh', plan.veh || 'sh-starship');
  if (plan.veh === 'abstract' && plan.ab != null) params.set('ab', String(plan.ab));
  const multi = !!(plan.fb && plan.fb.length);
  params.set('basis', multi ? 'helio' : (plan.basis || 'helio'));
  params.set('view', plan.view || 'cinematic');
  if (plan.cargo != null && Number(plan.cargo) > 0) params.set('cargo', String(Math.round(Number(plan.cargo))));
  if (plan.arch && plan.veh === 'sh-starship') params.set('arch', plan.arch);
  if (plan.tankers != null && plan.arch === 'tanker-n') params.set('tankers', String(plan.tankers));
  if (plan.f9v && plan.veh === 'falcon9') params.set('f9v', plan.f9v);
  if (plan.eph === 'sample' || plan.eph === 'sample-de') params.set('eph', 'sample');
  // Geographic sites (PR-G1): os / ds = lat,lon,alt_km when enabled
  const os = encodeSiteParam(plan.os || plan.originSite);
  const ds = encodeSiteParam(plan.ds || plan.destSite);
  if (os) params.set('os', os);
  if (ds) params.set('ds', ds);
  const encoded = params.toString();
  if (encoded.length > MAX_LEN) return null;
  return '#' + encoded;
}

export function parsePlanRequest(hash) {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  if (params.get('v') !== '1') return null;

  const o = params.get('o');
  const d = params.get('d');
  const dep = params.get('dep');
  if (!o || !d || !dep) return null;

  const depDate = parseDateUTC(dep);
  if (!depDate) return null;

  let tof = params.get('tof');
  if (tof != null) {
    tof = parseInt(tof, 10);
    if (!isFinite(tof) || tof < 1 || tof > 20000) tof = null;
  } else tof = null;

  const fbRaw = params.get('fb') || '';
  const flybys = [];
  if (fbRaw) {
    for (const part of fbRaw.split(',').slice(0, MAX_FLYS)) {
      const [id, dateStr] = part.split('@');
      const dt = parseDateUTC(dateStr);
      if (!id || !dt) continue;
      flybys.push({ bodyId: id.toLowerCase(), date: dt });
    }
  }

  let basis = params.get('basis') || 'helio';
  if (basis !== 'mission' && basis !== 'helio') basis = 'helio';
  if (flybys.length > 0) basis = 'helio';

  let view = params.get('view') || 'cinematic';
  if (view !== 'schematic' && view !== 'cinematic') view = 'cinematic';

  let veh = params.get('veh') || 'sh-starship';
  let ab = parseInt(params.get('ab') || '8000', 10);
  if (!isFinite(ab)) ab = 8000;

  let cargo = parseInt(params.get('cargo') || '0', 10);
  if (!isFinite(cargo) || cargo < 0) cargo = 0;
  cargo = Math.min(500000, cargo);

  // K8: omitted arch on sh-starship ⇒ legacy-demo forever
  let arch = params.get('arch');
  const archOmitted = !params.has('arch');
  if (veh === 'sh-starship') {
    if (archOmitted || !arch) arch = 'legacy-demo';
    if (arch !== 'legacy-demo' && arch !== 'unrefueled' && arch !== 'tanker-n') {
      arch = 'legacy-demo';
    }
  } else {
    arch = null;
  }

  let tankers = parseInt(params.get('tankers') || '0', 10);
  if (!isFinite(tankers) || tankers < 0) tankers = 0;
  tankers = Math.min(20, tankers);

  let f9v = params.get('f9v') || 'expendable';
  if (f9v !== 'asds' && f9v !== 'expendable') f9v = 'expendable';

  let eph = params.get('eph') || 'approx';
  if (eph === 'sample-de' || eph === 'sample') eph = 'sample-de';
  else eph = 'approx';

  const originSite = parseSiteParam(params.get('os'));
  const destSite = parseSiteParam(params.get('ds'));

  return {
    originId: o.toLowerCase(),
    destId: d.toLowerCase(),
    depDate,
    tofDays: flybys.length > 0 ? null : tof,
    flybys,
    vehicleId: veh,
    abstractBudget_m_s: ab,
    costBasis: basis,
    view,
    tofIgnoredMulti: flybys.length > 0 && params.has('tof'),
    cargoMass_kg: cargo,
    starshipArch: arch,
    archOmitted: veh === 'sh-starship' && archOmitted,
    tankerCount: tankers,
    falcon9Variant: f9v,
    ephemerisBackend: eph,
    originSite,
    destSite,
  };
}

/** Validate body ids resolve (optional offline check). */
export function resolvePlanBodies(req) {
  if (!req) return null;
  const origin = findByIdOrName(req.originId);
  const dest = findByIdOrName(req.destId);
  if (!origin || !dest) return null;
  return { origin, dest };
}
