/**
 * Natural-language / structured mission campaign orchestrator.
 * Runs deterministic planner steps; AI never invents Δv.
 */

import { state } from '../state.js';
import { findByIdOrName } from '../data/catalog.js';
import {
  setRouteOrigin,
  setRouteDestination,
  clearRoute,
  computeRoute,
} from '../ui/route-planner.js';
import { dateToInputValue, dateToSimTime, notify } from '../ui/format.js';
import { timeState } from '../ui/time-system.js';
import { getMissionAiBundle } from './ai-core.js';
import { buildMissionSnapshot } from './transfer-summary.js';
export { parseCampaignHint } from './campaign-parse.js';

function resolveBody(name) {
  if (!name) return null;
  return findByIdOrName(String(name).trim());
}

function waitForPlan(timeoutMs = 120_000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (payload) => {
      if (done) return;
      done = true;
      window.removeEventListener('helios:plan-computed', onEvt);
      clearTimeout(timer);
      resolve(payload);
    };
    const onEvt = (e) => finish(e.detail || { ok: true });
    const timer = setTimeout(() => finish({ ok: true, timedOut: true }), timeoutMs);
    window.addEventListener('helios:plan-computed', onEvt);
  });
}

function applyDeparture(raw) {
  if (!raw) return null;
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) d = new Date(raw + 'T00:00:00Z');
  else if (/^\d{4}$/.test(raw)) d = new Date(`${raw}-06-01T00:00:00Z`);
  else d = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z');
  if (isNaN(d.getTime())) throw new Error(`Invalid departure: ${raw}`);
  const val = dateToInputValue(d);
  const input = document.getElementById('depart-date');
  if (input) {
    input.value = val;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  timeState.simTime = dateToSimTime(d);
  timeState.updateDisplay();
  return val;
}

function applyVehicle(args) {
  const out = {};
  if (args.vehicleId) {
    state.vehicleId = String(args.vehicleId);
    const sel = document.getElementById('vehicle-select');
    if (sel) {
      sel.value = state.vehicleId;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    out.vehicleId = state.vehicleId;
  }
  if (args.cargoMass_kg != null && Number.isFinite(Number(args.cargoMass_kg))) {
    state.cargoMass_kg = Number(args.cargoMass_kg);
    const cargo = document.getElementById('cargo-mass');
    if (cargo) {
      cargo.value = String(state.cargoMass_kg);
      cargo.dispatchEvent(new Event('input', { bubbles: true }));
    }
    out.cargoMass_kg = state.cargoMass_kg;
  }
  if (args.starshipArch) {
    state.starshipArch = args.starshipArch;
    const arch = document.getElementById('starship-arch');
    if (arch) {
      arch.value = state.starshipArch;
      arch.dispatchEvent(new Event('change', { bubbles: true }));
    }
    out.starshipArch = state.starshipArch;
  }
  window.dispatchEvent(new CustomEvent('helios:vehicle-changed'));
  return out;
}

function applyLaunchSite(siteId) {
  if (!siteId) return null;
  state.launchSiteId = String(siteId);
  const sel = document.getElementById('launch-site');
  if (sel) {
    sel.value = state.launchSiteId;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return state.launchSiteId;
}

/**
 * Run a structured campaign plan.
 * @param {object} args
 * @param {string} [args.origin]
 * @param {string} [args.destination]
 * @param {string} [args.departure] YYYY-MM-DD or year
 * @param {string} [args.vehicleId]
 * @param {number} [args.cargoMass_kg]
 * @param {string} [args.starshipArch]
 * @param {string} [args.launchSiteId]
 * @param {boolean} [args.clearFirst]
 * @param {boolean} [args.compute=true]
 * @param {boolean} [args.suggestGa]
 * @param {boolean} [args.openWindows]
 */
export async function runMissionCampaign(args = {}) {
  const steps = [];
  const log = (step, detail) => {
    steps.push({ step, ...detail });
  };

  if (args.clearFirst) {
    clearRoute();
    log('clear_route', { ok: true });
  }

  if (args.origin || args.destination) {
    const out = {};
    if (args.origin) {
      const b = resolveBody(args.origin);
      if (!b) throw new Error(`Unknown origin: ${args.origin}`);
      setRouteOrigin(b);
      out.origin = b.name;
    }
    if (args.destination) {
      const b = resolveBody(args.destination);
      if (!b) throw new Error(`Unknown destination: ${args.destination}`);
      setRouteDestination(b);
      out.destination = b.name;
    }
    log('set_route', out);
  }

  if (args.departure) {
    log('set_departure', { departure: applyDeparture(args.departure) });
  }

  if (args.vehicleId || args.cargoMass_kg != null || args.starshipArch) {
    log('set_vehicle', applyVehicle(args));
  }

  if (args.launchSiteId) {
    log('set_launch_site', { launchSiteId: applyLaunchSite(args.launchSiteId) });
  }

  if (args.openWindows) {
    document.getElementById('find-windows')?.click();
    log('open_windows', { ok: true });
  }

  let snapshot = null;
  if (args.compute !== false) {
    if (!state.routeOrigin || !state.routeDestination) {
      throw new Error('Campaign needs origin and destination before compute');
    }
    const waitP = waitForPlan();
    computeRoute();
    await waitP;
    snapshot = buildMissionSnapshot(state, {
      departure: dateToInputValue(timeState.getDate()),
    });
    log('compute_route', {
      ok: true,
      missionReady: snapshot?.transfer?.missionReady,
      quality: snapshot?.transfer?.quality,
    });
  }

  if (args.suggestGa) {
    try {
      const { runGaSuggestions } = await import('../ui/ga-suggest-ui.js');
      if (typeof runGaSuggestions === 'function') {
        await runGaSuggestions();
        log('suggest_ga', { ok: true, n: state.gaSuggestions?.suggestions?.length ?? 0 });
      } else {
        document.getElementById('btn-ga-suggest')?.click();
        log('suggest_ga', { ok: true, via: 'button' });
      }
    } catch (e) {
      log('suggest_ga', { ok: false, error: e.message });
    }
  }

  const bundle = getMissionAiBundle();
  notify('CAMPAIGN STEPS APPLIED · review Results / AI next actions');
  return {
    ok: true,
    product_class: 'preliminary-not-flight-certified',
    steps,
    snapshot: snapshot || buildMissionSnapshot(state),
    next_actions: bundle.next,
    dossier: bundle.ctx?.dossier || null,
    triad: bundle.ctx?.triad || null,
  };
}

