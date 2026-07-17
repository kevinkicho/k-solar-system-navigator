// Mission Measurement Card — Need / Capability / Margin triad UI.

import { state } from '../state.js';
import {
  evaluateCapability, evaluateMargin, presetDisplayName, presetDisclaimer,
  superHeavyDeltaV, starshipDeltaV, totalMissionDeltaV,
} from '../physics/vehicles.js';
import { formatApproxErrorSummary } from '../data/approx-ephemeris-errors.js';
import { formatVelocity } from './format.js';
import { computeNeedNow } from './mission-budget-ui.js';
import { vehicleEngineeringHtml } from './vehicle-engineering-ui.js';

/** Normalize legacy 'L2' → 'L2-compare'. */
export function normalizeFidelity(level) {
  if (level === 'L2-plan') return 'L2-plan';
  if (level === 'L2' || level === 'L2-compare') return 'L2-compare';
  return 'L1';
}

export function fidelityBadgeLabel(level) {
  const f = normalizeFidelity(level);
  if (f === 'L2-plan') return 'L2-plan · offline sample table (not DE/SPICE)';
  if (f === 'L2-compare') return 'L2-compare · Horizons Δr check (planning still L1)';
  return 'L1 · JPL approx (offline default)';
}

export function fidelityCssClass(level) {
  const f = normalizeFidelity(level);
  if (f === 'L2-plan') return 'L2-plan';
  if (f === 'L2-compare') return 'L2-compare';
  return 'L1';
}

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

  const fidelity = normalizeFidelity(state.fidelityLevel);
  const backend = state.ephemerisBackend === 'sample-de' ? 'sample-de' : 'approx';
  const fidelityLabel = fidelityBadgeLabel(fidelity);
  const cssFid = fidelityCssClass(fidelity);

  // Design residual: ?debug=1 logs triad objects for classroom / developers.
  if (typeof location !== 'undefined' && /[?&]debug=1(?:&|$)/.test(location.search || '')) {
    console.log('[HELIOS debug] measurement triad', {
      fidelity,
      ephemerisBackend: backend,
      request,
      need,
      capability,
      margin,
    });
  }

  const isLegacy = state.vehicleId === 'sh-starship'
    && (state.starshipArch === 'legacy-demo' || !state.starshipArch);
  const isSketch = !!(td?.body1?.waypointOf || td?.body2?.waypointOf);
  const classroomNote = state.classroomMode
    ? `<div class="info-row"><span class="key">Classroom</span><span class="val amber">Methodology-first · abstract Δv default · offline L1</span></div>`
    : '';

  // PR1: nominal Approximate Positions error class (when planning on approx).
  let errorRows = '';
  if (backend === 'approx') {
    const e1 = formatApproxErrorSummary(td?.body1);
    const e2 = formatApproxErrorSummary(td?.body2);
    errorRows = `
      <div class="info-row"><span class="key">Approx error (origin)</span><span class="val" style="font-size:10px">${e1}</span></div>
      <div class="info-row"><span class="key">Approx error (dest)</span><span class="val" style="font-size:10px">${e2}</span></div>
      <div class="info-row"><span class="key">Error note</span><span class="val" style="font-size:9px;opacity:0.8">JPL nominal table 1800–2050 — not 1σ covariance, not DE/SPICE</span></div>`;
  } else {
    errorRows = `
      <div class="info-row"><span class="key">Planning backend</span><span class="val amber">offline sample table (educational) — not DE/SPICE kernels</span></div>`;
  }

  let html = `
      <div class="measurement-card" data-fidelity="${cssFid}" data-backend="${backend}" id="measurement-card">
      <div class="result-subtitle">MISSION MEASUREMENT
        <span class="fidelity-badge fidelity-${cssFid}" title="L1 = offline JPL Approximate Positions. L2-compare = Horizons Δr check only (planning still L1). L2-plan = offline educational sample table (not DE/SPICE). L3 SPICE is out of product scope.">${cssFid}</span>
      </div>
      <div class="info-row"><span class="key">Ephemeris fidelity</span><span class="val">${fidelityLabel}</span></div>
      <div class="info-row"><span class="key">Planning backend</span><span class="val">${backend}</span></div>
      ${errorRows}
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
      ${(state.ascentLossBudget_m_s > 0) ? `<div class="info-row"><span class="key">Ascent loss budget (edu)</span><span class="val amber">${formatVelocity(state.ascentLossBudget_m_s)} <span style="font-size:9px;opacity:0.7">not in Lambert Need</span></span></div>` : ''}

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

  // Sample vehicle engineering sheet (SH / Starship / F9)
  html += vehicleEngineeringHtml({
    vehicleId: state.vehicleId,
    starshipArch: state.starshipArch,
    tankerCount: state.tankerCount,
    cargoMass_kg: state.cargoMass_kg,
    falcon9Variant: state.falcon9Variant,
  });

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
