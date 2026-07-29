/**
 * Educational flight-ops mode UI — ops workflow training surface.
 */
import { state } from '../state.js';
import {
  lightTimeSummary, lightTimeAberrationAnalysis, buildFlightOpsGates,
  buildEducationalOem, opsDisclaimer,
} from '../physics/flight-ops.js';
import {
  getSampleMeta, transferSampleCoverage, sampleCoverageReport,
} from '../physics/ephemeris-sample.js';
import { computeAccuracyBudget } from '../physics/accuracy-budget.js';
import { denseSpkCoverageSummary } from '../physics/dense-spk-pack.js';
import { notify } from './format.js';
import { buildTransferPathSamples } from '../physics/transfer-path.js';
import { needOptsFromTransfer } from '../physics/need-geometry.js';
import { computeNeed } from '../physics/need.js';

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
    // Default LT Need compare on in OPS (analysis alternate — geometric Need remains primary)
    state.lightTimeNeedCompare = true;
    import('./physics-view.js').then((m) => m.setPhysicsAccurateView?.(true, { silent: true })).catch(() => {});
  } else if (!state.flightOpsMode) {
    // Leave lightTimeNeedCompare as user left it when turning OPS off
  }
  syncFlightOpsUi();
  if (!opts.silent) {
    notify(state.flightOpsMode
      ? 'OPS REVIEW ON — LT/aberration rows + sample coverage · not certified / not range safety'
      : 'OPS REVIEW OFF');
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
  const lt = lightTimeAberrationAnalysis(td) || lightTimeSummary(td);
  const cov = transferSampleCoverage(td) || { note: sampleCoverageReport().note };
  const gates = buildFlightOpsGates(td, {
    sampleMeta: meta,
    horizonsInject: !!state.horizonsEndpointInject,
  });
  const src = meta?.source || meta?.bake_source || state.fidelityLevel || '—';
  const step = meta?.step_days != null ? `${meta.step_days} d` : '—';
  const span = meta?.span_years != null ? `${meta.span_years.toFixed(1)} y` : '—';

  let launchRows = '';
  let ltNeedRow = '';
  try {
    if (td?.lambertOk) {
      const need = computeNeed(td, needOptsFromTransfer(td, {
        launchSiteId: state.launchSiteId || 'any',
        lightTimeCompare: true,
      }));
      const L = need.launch_geometry_sketch;
      if (L) {
        launchRows = `
          <div class="result-subtitle" style="margin-top:8px">Launch geometry (edu)</div>
          <div class="info-row"><span class="key">Az from N</span><span class="val">${L.azimuth_from_north_deg != null ? `${L.azimuth_from_north_deg.toFixed(1)}°` : '—'}</span></div>
          <div class="info-row"><span class="key">i_des / i_min</span><span class="val">${L.i_des_deg?.toFixed?.(1) ?? '—'}° / ${L.i_min_deg?.toFixed?.(1) ?? '—'}°</span></div>
          <div class="info-row"><span class="key">Dogleg</span><span class="val ${L.dogleg_needed ? 'amber' : 'green'}">${L.dogleg_needed ? `yes · +${((L.dogleg_dv_m_s || 0) / 1000).toFixed(2)} km/s` : 'not required'}</span></div>
          <div class="surface-hint">${escapeHtml(L.note || '')}</div>`;
      }
      if (need.light_time_compare) {
        const ltc = need.light_time_compare;
        ltNeedRow = `
          <div class="info-row"><span class="key">LT-adj TOF</span><span class="val">${ltc.tof_adj_days != null ? `${ltc.tof_adj_days.toFixed(3)} d` : '—'}</span></div>
          <div class="info-row"><span class="key">LT / TOF</span><span class="val">${ltc.frac_tof != null ? `${(ltc.frac_tof * 100).toFixed(4)}%` : '—'}</span></div>`;
      }
    }
  } catch { /* keep panel resilient */ }

  const abDep = lt?.aberration_dep_arcsec != null ? `${lt.aberration_dep_arcsec.toFixed(1)}″` : '—';
  const abArr = lt?.aberration_arr_arcsec != null ? `${lt.aberration_arr_arcsec.toFixed(1)}″` : '—';
  const acc = computeAccuracyBudget(td);
  const denseSum = denseSpkCoverageSummary();
  const denseLine = denseSum.n_packs
    ? denseSum.packs.map((p) =>
      `${p.pack_id} ${p.step_min}min ${String(p.t0 || '').slice(0, 10)}→${String(p.t1 || '').slice(0, 10)}`,
    ).join(' · ')
    : 'No dense SPICE packs — continuous Kepler / DE table fallback';

  host.innerHTML = `
    <p class="surface-hint">${opsDisclaimer()}</p>
    <div class="info-row"><span class="key">Kernel / table</span><span class="val">${escapeHtml(String(src))}</span></div>
    <div class="info-row"><span class="key">Fidelity</span><span class="val">${escapeHtml(state.fidelityLevel || '—')}</span></div>
    <div class="info-row"><span class="key">Sample step / span</span><span class="val">${escapeHtml(step)} · ${escapeHtml(span)}</span></div>
    <div class="info-row"><span class="key">Mars moons</span><span class="val">${escapeHtml(denseLine)}</span></div>
    <div class="info-row"><span class="key">Coverage</span><span class="val ${cov.any_oor ? 'amber' : 'green'}">${escapeHtml(cov.note || '—')}</span></div>
    <div class="result-subtitle" style="margin-top:8px">Accuracy budget (soft targets)</div>
    <div class="info-row"><span class="key">Domain</span><span class="val">${escapeHtml(acc.domain)}</span></div>
    <div class="info-row"><span class="key">Est time res</span><span class="val ${acc.meets_time ? 'green' : 'amber'}">${acc.est_time_res_s != null ? `${acc.est_time_res_s.toFixed(0)} s` : '—'} (target ≤${acc.targets.time_s}s)</span></div>
    <div class="info-row"><span class="key">Est distance</span><span class="val ${acc.meets_dist ? 'green' : 'amber'}">${acc.est_dist_km != null ? `${acc.est_dist_km.toFixed(2)} km` : '—'} (target ≤${acc.targets.dist_km} km)</span></div>
    <div class="surface-hint">${escapeHtml(acc.summary || '')}</div>
    <div class="result-subtitle" style="margin-top:8px">Light time · aberration (analysis)</div>
    <div class="info-row"><span class="key">LT (dep r)</span><span class="val">${lt?.lt_dep_label || '—'}</span></div>
    <div class="info-row"><span class="key">LT (arr r)</span><span class="val">${lt?.lt_arr_label || '—'}</span></div>
    <div class="info-row"><span class="key">Aberration dep</span><span class="val">${abDep} class</span></div>
    <div class="info-row"><span class="key">Aberration arr</span><span class="val">${abArr} class</span></div>
    ${ltNeedRow}
    <div class="surface-hint">${escapeHtml(lt?.note || 'Geometric LT only — not applied to primary Need unless LT compare enabled.')}</div>
    ${launchRows}
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
      <div class="panel-title" style="font-size:11px;margin-top:8px">Ops review (analysis)</div>
      <div id="flight-ops-panel-body" class="route-section"></div>
    `;
    const plan = document.getElementById('rail-pane-plan') || document.getElementById('right-panel');
    if (plan) plan.appendChild(wrap);
  }
  syncFlightOpsUi();
}
