/**
 * PlanSeed normalize + build — domain spine (Phase 1).
 * Single internal compact shape used by apply / history / codecs.
 * Not flight-certified; recompute from seed for authority.
 *
 * @typedef {import('./types.js').PlanSeed} PlanSeed
 */

import { bodyId } from '../data/catalog.js';
import { DAY } from '../constants.js';
import { state } from '../state.js';

/**
 * Normalize compact plan_request or parsePlanRequest output to one seed shape.
 * @param {object|null} raw
 * @returns {object|null}
 */
export function normalizePlanRequest(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // Compact (campaign / encode / buildPlanRequestFromState)
  if (raw.o || raw.d) {
    const fb = Array.isArray(raw.fb)
      ? raw.fb.map((f) => ({
        id: f.id || f.bodyId || f.bodyName,
        date: f.date instanceof Date
          ? f.date.toISOString().slice(0, 10)
          : (typeof f.date === 'string' ? f.date.slice(0, 10) : f.date || null),
      })).filter((f) => f.id)
      : (raw.fb === null || raw.fb === '' ? [] : undefined);
    return {
      v: raw.v ?? 2,
      o: typeof raw.o === 'string' ? raw.o : raw.o?.id || raw.o?.name,
      d: typeof raw.d === 'string' ? raw.d : raw.d?.id || raw.d?.name,
      dep: raw.dep instanceof Date
        ? raw.dep.toISOString().slice(0, 10)
        : (typeof raw.dep === 'string' ? String(raw.dep).slice(0, 10) : raw.dep),
      tof: raw.tof ?? raw.tofDays ?? null,
      veh: raw.veh || raw.vehicleId,
      cargo: raw.cargo ?? raw.cargoMass_kg,
      arch: raw.arch || raw.starshipArch,
      tankers: raw.tankers ?? raw.tankerCount,
      f9v: raw.f9v || raw.falcon9Variant,
      eph: raw.eph || (raw.ephemerisBackend === 'sample-de' ? 'sample' : raw.ephemerisBackend),
      site: raw.site || raw.launchSiteId,
      ab: raw.ab ?? raw.abstractBudget_m_s,
      basis: raw.basis || raw.costBasis,
      view: raw.view,
      archOmitted: raw.archOmitted,
      fb,
      os: raw.os || raw.originSite,
      ds: raw.ds || raw.destSite,
    };
  }

  // parsePlanRequest / applyPlanRequest shape
  if (raw.originId || raw.destId) {
    const dep = raw.depDate instanceof Date
      ? raw.depDate.toISOString().slice(0, 10)
      : (typeof raw.depDate === 'string' ? String(raw.depDate).slice(0, 10) : null);
    const fb = Array.isArray(raw.flybys)
      ? raw.flybys.map((f) => ({
        id: f.bodyId || f.id || f.bodyName,
        date: f.date instanceof Date
          ? f.date.toISOString().slice(0, 10)
          : (typeof f.date === 'string' ? f.date.slice(0, 10) : null),
      })).filter((f) => f.id)
      : undefined;
    return {
      v: 2,
      o: raw.originId,
      d: raw.destId,
      dep,
      tof: raw.tofDays ?? raw.tof ?? null,
      veh: raw.vehicleId || raw.veh,
      cargo: raw.cargoMass_kg ?? raw.cargo,
      arch: raw.starshipArch || raw.arch,
      tankers: raw.tankerCount ?? raw.tankers,
      f9v: raw.falcon9Variant || raw.f9v,
      eph: raw.ephemerisBackend === 'sample-de' || raw.eph === 'sample'
        ? 'sample'
        : (raw.eph || raw.ephemerisBackend),
      ab: raw.abstractBudget_m_s ?? raw.ab,
      basis: raw.costBasis || raw.basis,
      view: raw.view,
      archOmitted: raw.archOmitted,
      fb,
      os: raw.originSite || raw.os,
      ds: raw.destSite || raw.ds,
    };
  }

  return null;
}

/**
 * Compact plan_request-like seed from app state (share-codec compatible).
 * @param {object} [appState]
 * @param {object|null} [td]
 */
export function buildPlanRequestFromState(appState = state, td = appState.transferData) {
  const o = appState.routeOrigin;
  const d = appState.routeDestination;
  if (!o || !d) return null;
  const depSim = td?.departureSimTime;
  const depDay = depSim != null
    ? new Date(depSim * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString().slice(0, 10)
    : null;
  const tofDays = td?.transferTime != null
    ? Math.round(td.transferTime / DAY)
    : (appState.userTofDays ?? null);
  const pr = {
    v: 2,
    o: bodyId(o) || o.name?.toLowerCase(),
    d: bodyId(d) || d.name?.toLowerCase(),
    dep: depDay,
    tof: tofDays,
    veh: appState.vehicleId || 'sh-starship',
    cargo: Math.round(appState.cargoMass_kg || 0),
    arch: appState.vehicleId === 'sh-starship' ? (appState.starshipArch || 'unrefueled') : undefined,
    tankers: appState.starshipArch === 'tanker-n' ? (appState.tankerCount || 0) : undefined,
    f9v: appState.vehicleId === 'falcon9' ? (appState.falcon9Variant || 'expendable') : undefined,
    eph: appState.ephemerisBackend === 'sample-de' ? 'sample' : undefined,
    site: appState.launchSiteId || 'any',
  };
  if (appState.flybys?.length) {
    pr.fb = appState.flybys.slice(0, 6).map((f) => ({
      id: f.bodyId || (f.bodyName || '').toLowerCase(),
      date: f.simTime != null
        ? new Date(f.simTime * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString().slice(0, 10)
        : null,
    })).filter((x) => x.id);
  }
  return pr;
}

/** Stable digest for history / package (not cryptographic). */
export function digestPlanSeed(seed) {
  const s = normalizePlanRequest(seed);
  if (!s) return null;
  const parts = [
    s.o, s.d, s.dep, s.tof, s.veh, s.arch, s.tankers, s.cargo, s.eph, s.site,
    (s.fb || []).map((f) => `${f.id}@${f.date || ''}`).join(','),
  ];
  return parts.join('|');
}
