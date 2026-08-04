/**
 * Apply window-family seed or architecture matrix row to live planner.
 * Deterministic — no invented Δv; always recompute after apply.
 */

import { state } from '../state.js';
import { notify, dateToInputValue, simTimeToDate, dateToSimTime } from './format.js';
import { timeState } from './time-system.js';
import { computeRoute } from './route-planner.js';
import { DAY } from '../constants.js';

/**
 * Apply best member of a window family (or explicit member).
 * @param {object} family from clusterWindowFamilies
 * @param {object} [member] optional shortlist cell
 */
export async function applyWindowFamily(family, member = null) {
  const cell = member || family?.best || family?.members?.[0];
  if (!cell) {
    notify('NO WINDOW SEED TO APPLY');
    return { ok: false, error: 'no cell' };
  }
  if (!state.routeOrigin || !state.routeDestination) {
    notify('SET ORIGIN AND DESTINATION FIRST');
    return { ok: false, error: 'no route' };
  }

  let depSim = cell.dep_sim;
  if (depSim == null && cell.dep_iso) {
    const d = new Date(cell.dep_iso);
    if (!isNaN(d.getTime())) depSim = dateToSimTime(d);
  }
  if (depSim == null) {
    notify('WINDOW SEED MISSING DEPARTURE');
    return { ok: false, error: 'no dep' };
  }

  const tofDays = cell.tof_days ?? (cell.tof_s != null ? cell.tof_s / DAY : null);
  if (tofDays != null && isFinite(tofDays) && tofDays > 0) {
    state.userTofDays = tofDays;
    const tofInput = document.getElementById('tof-days');
    if (tofInput) {
      tofInput.value = String(Math.round(tofDays));
      tofInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  const depDate = simTimeToDate(depSim);
  const depInput = document.getElementById('depart-date');
  if (depInput) {
    depInput.value = dateToInputValue(depDate);
    depInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  timeState.simTime = depSim;
  timeState.updateDisplay();

  notify(`APPLIED WINDOW · ${String(cell.dep_iso || '').slice(0, 10)} · TOF ${tofDays != null ? Math.round(tofDays) : '—'}d`);
  computeRoute();
  try {
    const { pushCampaignStep } = await import('../agent/campaign-object.js');
    pushCampaignStep({
      kind: 'apply_window',
      label: `Window ${family?.label || cell.dep_iso || ''}`.trim(),
      detail: `TOF ${tofDays != null ? Math.round(tofDays) : '—'}d`,
      source: 'apply',
    });
  } catch { /* */ }
  return {
    ok: true,
    dep_iso: cell.dep_iso,
    tof_days: tofDays,
    family_id: family?.id || null,
    product_class: 'preliminary-not-flight-certified',
  };
}

/**
 * Apply architecture matrix row to vehicle state + recompute.
 * @param {object} row from buildArchitectureMatrix
 */
export async function applyArchitectureRow(row) {
  if (!row) {
    notify('NO ARCHITECTURE ROW');
    return { ok: false, error: 'no row' };
  }
  if (!state.transferData && !state.routeOrigin) {
    notify('SET ROUTE / COMPUTE FIRST');
    return { ok: false, error: 'no plan' };
  }

  if (row.vehicleId) {
    state.vehicleId = row.vehicleId;
    const sel = document.getElementById('vehicle-select');
    if (sel) {
      sel.value = state.vehicleId;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  if (row.starshipArch) {
    state.starshipArch = row.starshipArch;
    const arch = document.getElementById('starship-arch');
    if (arch) {
      arch.value = state.starshipArch;
      arch.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  if (row.tankerCount != null && Number.isFinite(Number(row.tankerCount))) {
    state.tankerCount = Math.max(0, Math.floor(Number(row.tankerCount)));
    const t = document.getElementById('tanker-count');
    if (t) {
      t.value = String(state.tankerCount);
      t.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (row.cargoMass_kg != null && Number.isFinite(Number(row.cargoMass_kg))) {
    state.cargoMass_kg = Number(row.cargoMass_kg);
    const c = document.getElementById('cargo-mass');
    if (c) {
      c.value = String(state.cargoMass_kg);
      c.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (row.falcon9Variant) {
    state.falcon9Variant = row.falcon9Variant;
  }

  window.dispatchEvent(new CustomEvent('helios:vehicle-changed'));
  notify(`APPLIED ARCH · ${row.label || row.id || row.vehicleId}`);
  if (state.routeOrigin && state.routeDestination) computeRoute();
  try {
    const { pushCampaignStep } = await import('../agent/campaign-object.js');
    pushCampaignStep({
      kind: 'apply_arch',
      label: `Arch ${row.label || row.id || row.vehicleId}`,
      detail: row.feasible ? 'feasible' : 'infeasible seed',
      source: 'apply',
    });
  } catch { /* */ }
  return {
    ok: true,
    applied: {
      vehicleId: state.vehicleId,
      starshipArch: state.starshipArch,
      tankerCount: state.tankerCount,
      cargoMass_kg: state.cargoMass_kg,
    },
    product_class: 'preliminary-not-flight-certified',
  };
}
