/**
 * Agent/UI plan mutations without button .click() automation.
 * State is authority; DOM sync is best-effort projector.
 */

import { state } from '../state.js';
import { dateToInputValue, dateToSimTime, notify } from '../ui/format.js';
import { timeState } from '../ui/time-system.js';
import { findByIdOrName } from '../data/catalog.js';

function syncSelect(id, value) {
  try {
    const el = document.getElementById(id);
    if (el && value != null) {
      el.value = String(value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch { /* no DOM */ }
}

function syncInput(id, value) {
  try {
    const el = document.getElementById(id);
    if (el && value != null) {
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch { /* */ }
}

/**
 * @param {{ vehicleId?: string, cargoMass_kg?: number, starshipArch?: string, tankerCount?: number, falcon9Variant?: string, abstractBudget_m_s?: number }} args
 */
export function applyVehicleArgs(args = {}) {
  const out = {};
  if (args.vehicleId) {
    state.vehicleId = String(args.vehicleId);
    syncSelect('vehicle-select', state.vehicleId);
    out.vehicleId = state.vehicleId;
  }
  if (args.cargoMass_kg != null && Number.isFinite(Number(args.cargoMass_kg))) {
    state.cargoMass_kg = Number(args.cargoMass_kg);
    syncInput('cargo-mass', state.cargoMass_kg);
    out.cargoMass_kg = state.cargoMass_kg;
  }
  if (args.starshipArch) {
    state.starshipArch = args.starshipArch;
    syncSelect('starship-arch', state.starshipArch);
    out.starshipArch = state.starshipArch;
  }
  if (args.tankerCount != null) {
    state.tankerCount = Math.max(0, Math.floor(Number(args.tankerCount) || 0));
    syncInput('tanker-count', state.tankerCount);
    out.tankerCount = state.tankerCount;
  }
  if (args.falcon9Variant) {
    state.falcon9Variant = args.falcon9Variant;
    out.falcon9Variant = state.falcon9Variant;
  }
  if (args.abstractBudget_m_s != null && Number.isFinite(Number(args.abstractBudget_m_s))) {
    state.abstractBudget_m_s = Number(args.abstractBudget_m_s);
    syncInput('abstract-budget', state.abstractBudget_m_s);
    out.abstractBudget_m_s = state.abstractBudget_m_s;
  }
  try {
    window.dispatchEvent(new CustomEvent('helios:vehicle-changed'));
  } catch { /* */ }
  return out;
}

/**
 * @param {string} raw YYYY-MM-DD, year, or ISO
 */
export function applyDepartureArgs(raw) {
  if (!raw) return null;
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) d = new Date(`${raw}T12:00:00Z`);
  else if (/^\d{4}$/.test(raw)) d = new Date(`${raw}-06-01T12:00:00Z`);
  else d = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : `${raw}Z`);
  if (isNaN(d.getTime())) throw new Error(`Invalid departure: ${raw}`);
  const val = dateToInputValue(d);
  try {
    const input = document.getElementById('depart-date');
    if (input) {
      input.value = val;
      // Avoid double-compute from change handler if we will compute ourselves
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch { /* */ }
  timeState.simTime = dateToSimTime(d);
  timeState.updateDisplay();
  return val;
}

/**
 * @param {string} siteId
 */
export function applyLaunchSiteArgs(siteId) {
  if (!siteId) return null;
  state.launchSiteId = String(siteId);
  syncSelect('launch-site', state.launchSiteId);
  return state.launchSiteId;
}

/**
 * Open porkchop window search without relying on agent automation narrative.
 */
export async function openWindowSearch() {
  if (!state.routeOrigin || !state.routeDestination) {
    notify('SET ORIGIN AND DESTINATION FIRST');
    return { ok: false, error: 'no route' };
  }
  try {
    // Prefer direct UI entry: same handler as Plan rail button
    const btn = typeof document !== 'undefined'
      ? document.getElementById('find-windows')
      : null;
    if (btn) {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return { ok: true, via: 'find-windows' };
    }
  } catch { /* */ }
  return { ok: false, error: 'window UI unavailable' };
}

/**
 * SUGGEST GA without button click fallback preference.
 */
export async function runSuggestGa(opts = {}) {
  try {
    if (opts.thorough != null) {
      const thoroughEl = document.getElementById('ga-suggest-thorough');
      if (thoroughEl) thoroughEl.checked = !!opts.thorough;
    }
  } catch { /* */ }
  const { runGaSuggestions } = await import('../ui/ga-suggest-ui.js');
  await runGaSuggestions();
  return {
    ok: true,
    n: state.gaSuggestions?.suggestions?.length ?? 0,
    recommended: state.gaSuggestions?.suggestions?.find((s) => s.recommended)?.label || null,
  };
}

export function resolveBody(name) {
  if (!name) return null;
  return findByIdOrName(String(name).trim());
}
