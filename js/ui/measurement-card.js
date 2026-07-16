// Mission Measurement Card — Need / Capability / Margin triad UI.

import { state } from '../state.js';
import {
  evaluateCapability, evaluateMargin, presetDisplayName, presetDisclaimer,
  superHeavyDeltaV, starshipDeltaV, totalMissionDeltaV,
} from '../physics/vehicles.js';
import { formatVelocity } from './format.js';
import { computeNeedNow } from './mission-budget-ui.js';

function fmtKg(kg) {
  if (kg == null || !isFinite(kg)) return '—';
  if (Math.abs(kg) >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  return `${kg.toFixed(0)} kg`;
}

function fmtC3(c3) {
  if (c3 == null || !isFinite(c3)) return '—';
  return `${(c3 / 1e6).toFixed(2)} km²/s²`;
}

/**
 * Build triad HTML for results panel.
 * @returns {{ html: string, need, capability, margin }}
 */
export function buildMeasurementCard(td) {
  const need = computeNeedNow(td);
  const request = {
    vehicleId: state.vehicleId,
    cargoMass_kg: state.cargoMass_kg ?? 0,
    starshipArch: state.starshipArch ?? 'legacy-demo',
    tankerCount: state.tankerCount ?? 0,
    falcon9Variant: state.falcon9Variant || 'expendable',
    abstractBudget_m_s: state.abstractBudget_m_s,
    originBody: td?.body1,
    solveTankers: state.starshipArch === 'tanker-n',
  };
  const capability = evaluateCapability(need, request);
  const margin = evaluateMargin(need, capability, request);

  const isLegacy = state.vehicleId === 'sh-starship'
    && (state.starshipArch === 'legacy-demo' || !state.starshipArch);
  const isSketch = !!(td?.body1?.waypointOf || td?.body2?.waypointOf);
  const fidelity = state.fidelityLevel === 'L2' ? 'L2' : 'L1';
  const fidelityLabel = fidelity === 'L2'
    ? 'L2 · Horizons compare (educational)'
    : 'L1 · JPL approx (offline default)';
  const classroomNote = state.classroomMode
    ? `<div class="info-row"><span class="key">Classroom</span><span class="val amber">Methodology-first · abstract Δv default · offline</span></div>`
    : '';

  let html = `
      <div class="measurement-card" data-fidelity="${fidelity}" id="measurement-card">
      <div class="result-subtitle">MISSION MEASUREMENT
        <span class="fidelity-badge fidelity-${fidelity}" title="L1 = offline JPL Approximate Positions. L2 = optional Horizons Δr compare only (planning still uses L1 ephemeris). L3 SPICE is out of product scope.">${fidelity}</span>
      </div>
      <div class="info-row"><span class="key">Ephemeris fidelity</span><span class="val">${fidelityLabel}</span></div>
      ${classroomNote}
      <div class="info-row"><span class="key">Vehicle</span><span class="val">${presetDisplayName(state.vehicleId)}</span></div>`;

  if (isLegacy) {
    html += `<div class="info-row"><span class="key">Architecture</span><span class="val amber">LEGACY DEMO — booster-only Δv, not cargo architecture</span></div>`;
  } else if (state.vehicleId === 'sh-starship') {
    html += `<div class="info-row"><span class="key">Architecture</span><span class="val">${state.starshipArch}${state.starshipArch === 'tanker-n' ? ` · N=${state.tankerCount}` : ''}</span></div>`;
  } else if (state.vehicleId === 'falcon9') {
    html += `<div class="info-row"><span class="key">Variant</span><span class="val">${state.falcon9Variant}</span></div>`;
  }

  if (state.vehicleId !== 'abstract' && state.vehicleId !== 'chem-medium'
      && state.vehicleId !== 'fh-class' && state.vehicleId !== 'high-energy') {
    html += `<div class="info-row"><span class="key">Cargo requested</span><span class="val">${fmtKg(state.cargoMass_kg)}</span></div>`;
  }

  html += `
      <div style="height:8px"></div>
      <div class="result-subtitle">NEED · phase ${need.phase}${need.multi_leg ? ' (multi-leg)' : ''}</div>
      <div class="info-row"><span class="key">Required Δv</span><span class="val amber">${need.need_dv_m_s != null && isFinite(need.need_dv_m_s) ? formatVelocity(need.need_dv_m_s) : '—'}</span></div>
      <div class="info-row"><span class="key">C₃ (departure)</span><span class="val">${fmtC3(need.c3_m2_s2)}</span></div>
      ${need.vinf_dep_m_s != null ? `<div class="info-row"><span class="key">V∞ dep</span><span class="val">${formatVelocity(need.vinf_dep_m_s)}</span></div>` : ''}
      ${need.aeroassist_factor > 0 ? `<div class="info-row"><span class="key">Aeroassist factor</span><span class="val">${need.aeroassist_factor.toFixed(2)}</span></div>` : ''}

      <div style="height:8px"></div>
      <div class="result-subtitle">CAPABILITY</div>`;

  if (!capability.applicable) {
    html += `<div class="info-row"><span class="key">Status</span><span class="val red-val">NOT APPLICABLE</span></div>
      <div class="info-row"><span class="key">Reason</span><span class="val">${capability.reason || '—'}</span></div>`;
  } else if (capability.primary_metric === 'cargo') {
    html += `<div class="info-row"><span class="key">Max cargo @ C₃</span><span class="val green">${fmtKg(capability.capability_cargo_kg)}</span></div>`;
  } else {
    html += `<div class="info-row"><span class="key">Usable Δv</span><span class="val green">${formatVelocity(capability.capability_dv_m_s)}</span></div>`;
    if (capability.capability_cargo_kg != null) {
      html += `<div class="info-row"><span class="key">Max cargo @ need</span><span class="val">${fmtKg(capability.capability_cargo_kg)}</span></div>`;
    }
    if (capability.tankers_needed != null) {
      html += `<div class="info-row"><span class="key">Tankers needed</span><span class="val amber">${capability.tankers_needed}</span></div>`;
    }
  }

  if (isLegacy && state.vehicleId === 'sh-starship') {
    html += `
      <div class="info-row"><span class="key">Super Heavy Δv</span><span class="val">${formatVelocity(superHeavyDeltaV())}</span></div>
      <div class="info-row"><span class="key">Starship Δv (reserved)</span><span class="val">${formatVelocity(starshipDeltaV())}</span></div>
      <div class="info-row"><span class="key">Total stack Δv</span><span class="val">${formatVelocity(totalMissionDeltaV())}</span></div>`;
  }

  html += `
      <div style="height:8px"></div>
      <div class="result-subtitle">MARGIN</div>
      <div class="info-row"><span class="key">Feasible</span><span class="val ${margin.feasible ? 'green' : 'red-val'}">${margin.feasible ? 'YES' : 'NO'}</span></div>
      <div class="info-row"><span class="key">Margin kind</span><span class="val">${margin.kind}</span></div>`;
  if (margin.margin_dv_m_s != null && isFinite(margin.margin_dv_m_s)) {
    html += `<div class="info-row"><span class="key">Δv margin</span><span class="val">${formatVelocity(margin.margin_dv_m_s)}</span></div>`;
  }
  if (margin.margin_cargo_kg != null && isFinite(margin.margin_cargo_kg)) {
    html += `<div class="info-row"><span class="key">Cargo margin</span><span class="val">${fmtKg(margin.margin_cargo_kg)}</span></div>`;
  }
  if (margin.tankers_needed != null) {
    html += `<div class="info-row"><span class="key">Tankers needed</span><span class="val">${margin.tankers_needed}</span></div>`;
  }
  if (margin.reason) {
    html += `<div class="info-row"><span class="key">Note</span><span class="val amber">${margin.reason}</span></div>`;
  }
  if (isSketch) {
    html += `<div class="info-row"><span class="key">Note</span><span class="val amber">Waypoint sketch — Δv geometric only</span></div>`;
  }

  html += `
      <div class="info-row"><span class="key" style="font-size:9px;opacity:0.75">Disclaimer</span><span class="val" style="font-size:9px;opacity:0.75">${capability.disclaimer || presetDisclaimer(state.vehicleId)}</span></div>
      </div>`;

  return { html, need, capability, margin, request };
}
