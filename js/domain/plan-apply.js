/**
 * Domain apply — restore PlanSeed into app state + optional compute.
 * No dual public apply: share / undo / review all call this.
 */

import { state } from '../state.js';
import { notify, dateToInputValue, dateToSimTime } from '../ui/format.js';
import { timeState } from '../ui/time-system.js';
import { bodyId, findByIdOrName } from '../data/catalog.js';
import { DAY } from '../constants.js';
import { normalizePlanRequest } from './plan-seed.js';

/**
 * @param {object} pr plan_request-like (compact or parse shape)
 * @param {{ notifyUser?: boolean, compute?: boolean }} [opts]
 */
export async function reapplyPlanRequest(pr, opts = {}) {
  const notifyUser = opts.notifyUser !== false;
  const doCompute = opts.compute !== false;
  const seed = normalizePlanRequest(pr);
  if (!seed || (!seed.o && !seed.d && !seed.dep && !seed.veh)) {
    if (notifyUser) notify('NO PLAN SEED TO APPLY');
    return { ok: false, error: 'empty seed' };
  }

  const { setRouteOrigin, setRouteDestination, computeRoute } = await import('../ui/route-planner.js');
  const { renderFlybyList } = await import('../ui/route-planner.js');

  if (seed.o) {
    const b = findByIdOrName(seed.o);
    if (b) setRouteOrigin(b);
  }
  if (seed.d) {
    const b = findByIdOrName(seed.d);
    if (b) setRouteDestination(b);
  }

  if (seed.veh) {
    state.vehicleId = String(seed.veh);
    const sel = document.getElementById('vehicle-select');
    if (sel) {
      sel.value = state.vehicleId;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  if (seed.arch) {
    state.starshipArch = seed.arch;
    const arch = document.getElementById('starship-arch');
    if (arch) {
      arch.value = seed.arch;
      arch.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  if (seed.tankers != null) {
    state.tankerCount = Math.max(0, Math.floor(Number(seed.tankers) || 0));
    const t = document.getElementById('tanker-count');
    if (t) {
      t.value = String(state.tankerCount);
      t.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (seed.cargo != null) {
    state.cargoMass_kg = Number(seed.cargo) || 0;
    const c = document.getElementById('cargo-mass');
    if (c) {
      c.value = String(state.cargoMass_kg);
      c.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (seed.f9v) state.falcon9Variant = seed.f9v;
  if (seed.ab != null && Number.isFinite(Number(seed.ab))) {
    state.abstractBudget_m_s = Number(seed.ab);
  }
  if (seed.basis === 'helio' || seed.basis === 'mission') {
    state.costBasis = seed.basis;
  }
  if (seed.site) {
    state.launchSiteId = String(seed.site);
    const site = document.getElementById('launch-site');
    if (site) {
      site.value = state.launchSiteId;
      site.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  if (seed.eph === 'sample' || seed.eph === 'sample-de') {
    state.ephemerisBackend = 'sample-de';
    if (state.fidelityLevel === 'L1') state.fidelityLevel = 'L2-plan';
  } else if (seed.eph === 'approx') {
    state.ephemerisBackend = 'approx';
  }

  if (seed.os || seed.ds) {
    try {
      const { normalizeSurfacePoint } = await import('../physics/surface-point.js');
      if (seed.os && state.routeOrigin) {
        state.routeOriginPoint = normalizeSurfacePoint(seed.os, state.routeOrigin);
      }
      if (seed.ds && state.routeDestination) {
        state.routeDestPoint = normalizeSurfacePoint(seed.ds, state.routeDestination);
      }
      const { refreshSurfacePointUi } = await import('../ui/surface-point-ui.js');
      try { refreshSurfacePointUi(); } catch { /* */ }
    } catch { /* optional */ }
  }

  if (seed.dep) {
    const d = new Date(/T/.test(String(seed.dep)) ? seed.dep : `${seed.dep}T12:00:00Z`);
    if (!isNaN(d.getTime())) {
      const input = document.getElementById('depart-date');
      if (input) {
        input.value = dateToInputValue(d);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      timeState.simTime = dateToSimTime(d);
      timeState.updateDisplay();
    }
  }

  if (seed.tof != null && Number.isFinite(Number(seed.tof))) {
    state.userTofDays = Number(seed.tof);
    const tofInput = document.getElementById('tof-days');
    if (tofInput) {
      tofInput.value = String(Math.round(Number(seed.tof)));
      tofInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  if (Array.isArray(seed.fb)) {
    state.flybys = [];
    for (const f of seed.fb.slice(0, 6)) {
      const id = f.id || f.bodyId || f.bodyName;
      const b = findByIdOrName(id);
      if (!b) continue;
      let simTime = timeState.simTime + 120 * DAY;
      if (f.date) {
        const fd = new Date(/T/.test(String(f.date)) ? f.date : `${f.date}T12:00:00Z`);
        if (!isNaN(fd.getTime())) simTime = dateToSimTime(fd);
      }
      state.flybys.push({
        bodyId: bodyId(b) || b.id || b.name,
        bodyName: b.name,
        simTime,
      });
    }
    try { renderFlybyList(); } catch { /* */ }
  }

  if (doCompute && state.routeOrigin && state.routeDestination) {
    computeRoute();
  }

  if (notifyUser) {
    notify(`PLAN SEED APPLIED · ${seed.o || '?'} → ${seed.d || '?'}${seed.dep ? ` · ${seed.dep}` : ''}`);
  }
  return {
    ok: true,
    plan_request: seed,
    flybys: state.flybys.length,
    product_class: 'preliminary-not-flight-certified',
  };
}
