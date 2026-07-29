/**
 * Educational flight-ops mode UI — ops workflow training surface.
 */
import { state } from '../state.js';
import {
  lightTimeSummary, buildFlightOpsGates, buildEducationalOem, opsDisclaimer,
} from '../physics/flight-ops.js';
import { getSampleMeta } from '../physics/ephemeris-sample.js';
import { notify } from './format.js';
import { buildTransferPathSamples } from '../physics/transfer-path.js';

export function setFlightOpsMode(on, opts = {}) {
  state.flightOpsMode = !!on;
  if (state.flightOpsMode && !state.classroomMode) {
    // Prefer highest offline fidelity table (L3 if spice-baked, else L2-plan)
    state.ephemerisBackend = 'sample-de';
    const meta = getSampleMeta();
    if (meta && (/spice|de440/i.test(meta.source || '') || meta.bake_source === 'spice-de440s')) {
      state.fidelityLevel = 'L3-plan';
    } else {
      state.fidelityLevel = state.fidelityLevel === 'L2-horizons' ? 'L2-horizons' : 'L2-plan';
    }
    state.physicsAccurate = true;
    import('./physics-view.js').then((m) => m.setPhysicsAccurateView?.(true, { silent: true })).catch(() => {});
  }
  syncFlightOpsUi();
  if (!opts.silent) {
    notify(state.flightOpsMode
      ? 'FLIGHT-OPS MODE (EDUCATIONAL) — not certified / not range safety'
      : 'FLIGHT-OPS MODE OFF');
  }
  // Refresh results if any
  if (state.transferData) {
    import('./route-display.js').then((m) => m.renderRouteUI?.()).catch(() => {});
  }
}

export function syncFlightOpsUi() {
  const btn = document.getElementById('btn-flight-ops');
  if (btn) {
    btn.classList.toggle('active', !!state.flightOpsMode);
    btn.setAttribute('aria-pressed', state.flightOpsMode ? 'true' : 'false');
  }
  const panel = document.getElementById('flight-ops-panel');
  if (panel) panel.hidden = !state.flightOpsMode;
  refreshFlightOpsPanel();
}

export function refreshFlightOpsPanel() {
  const host = document.getElementById('flight-ops-panel-body');
  if (!host || !state.flightOpsMode) return;
  const td = state.transferData;
  const meta = getSampleMeta();
  const lt = lightTimeSummary(td);
  const gates = buildFlightOpsGates(td, {
    sampleMeta: meta,
    horizonsInject: !!state.horizonsEndpointInject,
  });
  const src = meta?.source || meta?.bake_source || state.fidelityLevel || '—';
  host.innerHTML = `
    <p class="surface-hint">${opsDisclaimer()}</p>
    <div class="info-row"><span class="key">Kernel / table</span><span class="val">${escapeHtml(String(src))}</span></div>
    <div class="info-row"><span class="key">Fidelity</span><span class="val">${escapeHtml(state.fidelityLevel || '—')}</span></div>
    <div class="info-row"><span class="key">LT (dep r)</span><span class="val">${lt?.lt_dep_label || '—'}</span></div>
    <div class="info-row"><span class="key">LT (arr r)</span><span class="val">${lt?.lt_arr_label || '—'}</span></div>
    <div class="result-subtitle" style="margin-top:8px">Ops gates (educational)</div>
    ${gates.map((g) => `
      <div class="info-row">
        <span class="key">${escapeHtml(g.code)}</span>
        <span class="val ${g.level === 'pass' ? 'green' : 'amber'}">${escapeHtml(g.title)}</span>
      </div>
      <div class="surface-hint">${escapeHtml(g.detail)}</div>
    `).join('')}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
      <button type="button" class="btn-tiny" id="btn-export-oem">Export OEM-like</button>
    </div>
  `;
  const exp = document.getElementById('btn-export-oem');
  if (exp) exp.onclick = () => exportOemLike();
}

function exportOemLike() {
  const td = state.transferData;
  if (!td) {
    notify('COMPUTE A TRANSFER FIRST');
    return;
  }
  let samples = [];
  try {
    const built = buildTransferPathSamples(td, {
      geometry: 'physical',
      exaggerate: false,
      nSamples: 121,
      offsetPolicy: state.pathOffsetPolicy || 'time_varying',
    });
    samples = (built.points || []).map((p, i, arr) => ({
      t: td.departureSimTime + (td.transferTime || 0) * (arr.length > 1 ? i / (arr.length - 1) : 0),
      x: p.x, y: p.y, z: p.z,
    }));
  } catch { /* */ }
  const text = buildEducationalOem(td, samples);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `helios-edu-oem-${td.body1?.name || 'o'}-${td.body2?.name || 'd'}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify('EDUCATIONAL OEM-LIKE EXPORTED — NOT CCSDS FLIGHT PRODUCT');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wireFlightOpsUi() {
  const btn = document.getElementById('btn-flight-ops');
  if (btn) {
    btn.onclick = () => setFlightOpsMode(!state.flightOpsMode);
  }
  // Ensure panel exists
  if (!document.getElementById('flight-ops-panel')) {
    const wrap = document.createElement('div');
    wrap.id = 'flight-ops-panel';
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="panel-title" style="font-size:11px;margin-top:8px">Flight ops (educational)</div>
      <div id="flight-ops-panel-body" class="route-section"></div>
    `;
    const plan = document.getElementById('rail-pane-plan') || document.getElementById('right-panel');
    if (plan) plan.appendChild(wrap);
  }
  syncFlightOpsUi();
}
