/**
 * HELIOS Studio panel — window families, architecture matrix, pins,
 * fidelity wizard, residual dashboard, DSM sketch, playbooks, DAG.
 * Injected into Results after AI strips.
 */

import { state } from '../state.js';
import { notify } from './format.js';
import { clusterWindowFamilies, formatFamilyCalendar } from '../physics/window-families.js';
import { buildArchitectureMatrix } from '../physics/architecture-matrix.js';
import { pinPlan, getPlanPins, clearPlanPins, removePlanPin, diffPlanPins } from '../physics/plan-pins.js';
import { listFidelityPresets, applyFidelityPreset } from '../physics/fidelity-presets.js';
import { buildResidualDashboard } from '../physics/residual-dashboard.js';
import { suggestMidcourseDsmSeed, needWithDsmSketch, normalizeDsmNodes } from '../physics/dsm-nodes.js';
import { moonSystemTemplates } from '../physics/moon-system-sketch.js';
import { listPlaybooks } from '../agent/playbooks.js';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtKmS(m_s) {
  if (m_s == null || !isFinite(m_s)) return '—';
  return `${(m_s / 1000).toFixed(2)} km/s`;
}

/**
 * Render / refresh studio into host (Results).
 */
export function renderStudioPanel(host) {
  if (!host) return;
  let el = document.getElementById('helios-studio');
  if (!el) {
    el = document.createElement('div');
    el.id = 'helios-studio';
    el.className = 'helios-studio';
    host.appendChild(el);
  }

  const td = state.transferData;
  const pins = getPlanPins();
  const presets = listFidelityPresets();
  const playbooks = listPlaybooks();
  const residual = td ? buildResidualDashboard(td, state) : null;
  const fam = state.windowFamilies
    || (state.windowShortlist ? clusterWindowFamilies(state.windowShortlist) : null);
  const matrix = state.architectureMatrix
    || (td?.dossier?.need
      ? buildArchitectureMatrix(td.dossier.need, {
        cargoMass_kg: state.cargoMass_kg,
        originBody: state.routeOrigin,
      })
      : null);

  const moonPack = state.routeOrigin && state.routeDestination
    ? moonSystemTemplates(state.routeOrigin, state.routeDestination)
    : null;

  el.innerHTML = `
    <div class="ai-next-title">HELIOS STUDIO · campaign depth</div>
    <p class="studio-note">Window families · architecture matrix · compare pins · fidelity wizard · residuals · DSM sketch · playbooks. Preliminary only — not flight-certified.</p>
    <div class="studio-actions">
      <button type="button" class="btn-tiny" data-act="families">Window families</button>
      <button type="button" class="btn-tiny" data-act="matrix">Architecture matrix</button>
      <button type="button" class="btn-tiny" data-act="pin">Pin plan</button>
      <button type="button" class="btn-tiny" data-act="diff">Diff pins</button>
      <button type="button" class="btn-tiny" data-act="clear-pins">Clear pins</button>
      <button type="button" class="btn-tiny" data-act="residual">Residuals</button>
      <button type="button" class="btn-tiny" data-act="dsm">Add DSM seed</button>
      <button type="button" class="btn-tiny" data-act="dag">Run campaign DAG</button>
      <button type="button" class="btn-tiny" data-act="review">Save review link</button>
      <button type="button" class="btn-tiny" data-act="stakeholder">Stakeholder package</button>
    </div>
    <div class="studio-row">
      <label>Fidelity wizard
        <select id="studio-fidelity">
          ${presets.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="btn-tiny" data-act="fidelity">Apply</button>
    </div>
    <div class="studio-row">
      <label>Playbook
        <select id="studio-playbook">
          ${playbooks.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="btn-tiny" data-act="playbook">Run playbook</button>
    </div>
    <div id="studio-out" class="ai-brief-out studio-out"></div>
    <div class="studio-sections">
      ${renderPinsHtml(pins)}
      ${renderFamiliesHtml(fam)}
      ${renderMatrixHtml(matrix)}
      ${renderResidualHtml(residual)}
      ${renderMoonHtml(moonPack)}
      ${renderDsmHtml()}
    </div>
  `;

  el.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => handleAct(btn.getAttribute('data-act'), el, host));
  });
  el.querySelectorAll('[data-rm-pin]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removePlanPin(btn.getAttribute('data-rm-pin'));
      state.planPins = getPlanPins();
      renderStudioPanel(host);
    });
  });
}

function renderPinsHtml(pins) {
  if (!pins?.length) return '<div class="studio-block"><strong>Compare pins</strong><p class="studio-muted">None pinned (max 3).</p></div>';
  return `<div class="studio-block"><strong>Compare pins (${pins.length}/3)</strong>
    <ul class="studio-list">${pins.map((p) => `
      <li>
        <strong>${esc(p.label)}</strong>
        · Need ${fmtKmS(p.triad?.need_m_s)} · margin ${fmtKmS(p.triad?.margin_m_s)}
        · ${p.dossier?.mission_ready ? 'READY' : 'NO-GO'}
        <button type="button" class="btn-tiny" data-rm-pin="${esc(p.id)}">×</button>
      </li>`).join('')}</ul></div>`;
}

function renderFamiliesHtml(fam) {
  if (!fam?.families?.length) {
    return '<div class="studio-block"><strong>Window families</strong><p class="studio-muted">Run porkchop / open windows, then Window families.</p></div>';
  }
  const lines = formatFamilyCalendar(fam);
  return `<div class="studio-block"><strong>Window families</strong>
    <ul class="studio-list">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <p class="studio-muted">${esc(fam.note)}</p></div>`;
}

function renderMatrixHtml(matrix) {
  if (!matrix?.rows?.length) {
    return '<div class="studio-block"><strong>Architecture matrix</strong><p class="studio-muted">Compute a transfer first.</p></div>';
  }
  return `<div class="studio-block"><strong>Architecture matrix</strong>
    <table class="studio-table"><thead><tr><th>Arch</th><th>Cap</th><th>Margin</th><th>OK?</th></tr></thead>
    <tbody>${matrix.rows.map((r) => `
      <tr class="${r.recommended ? 'is-rec' : ''} ${r.feasible ? 'is-ok' : 'is-no'}">
        <td>${esc(r.label)}${r.recommended ? ' ★' : ''}</td>
        <td>${fmtKmS(r.capability_dv_m_s)}${r.capability_cargo_kg != null ? ` / ${Math.round(r.capability_cargo_kg)} kg` : ''}</td>
        <td>${fmtKmS(r.margin_dv_m_s)}</td>
        <td>${r.feasible ? 'YES' : 'no'}</td>
      </tr>`).join('')}</tbody></table>
    <p class="studio-muted">${esc(matrix.note)}</p></div>`;
}

function renderResidualHtml(residual) {
  if (!residual?.items?.length) {
    return '<div class="studio-block"><strong>Residual / trust</strong><p class="studio-muted">Compute a plan to populate.</p></div>';
  }
  return `<div class="studio-block"><strong>Residual / trust · ${esc(residual.readiness)}</strong>
    <ul class="studio-list">${residual.items.map((it) => `
      <li class="level-${esc(it.level)}"><strong>${esc(it.title)}</strong> — ${esc(it.detail)}</li>`).join('')}</ul>
    <p class="studio-muted">${esc(residual.note)}</p></div>`;
}

function renderMoonHtml(pack) {
  if (!pack?.templates?.length) {
    return '<div class="studio-block"><strong>Moon-system sketch</strong><p class="studio-muted">Same-SOI pairs only (e.g. Europa→Io). Not CR3BP.</p></div>';
  }
  return `<div class="studio-block"><strong>Moon-system sketch · ${esc(pack.parent || '')}</strong>
    <ul class="studio-list">${pack.templates.map((t) => `<li>${esc(t.label)} — ${esc(t.rationale)}</li>`).join('')}</ul>
    <p class="studio-muted">${esc(pack.note)}</p></div>`;
}

function renderDsmHtml() {
  const nodes = normalizeDsmNodes(state.dsmNodes || []);
  if (!nodes.length) {
    return '<div class="studio-block"><strong>DSM sketch</strong><p class="studio-muted">No DSM nodes — Add DSM seed for educational Need add-on.</p></div>';
  }
  const sketch = needWithDsmSketch(
    state.transferData?.dossier?.need?.need_dv_m_s
      ?? state.transferData?.dvTotal_lambert
      ?? null,
    nodes,
  );
  return `<div class="studio-block"><strong>DSM sketch</strong>
    <ul class="studio-list">${nodes.map((n) => `<li>${esc(n.label)} · ${fmtKmS(n.dv_m_s)} @ f=${n.epoch_frac}</li>`).join('')}</ul>
    <p>Lambert ${fmtKmS(sketch.lambert_need_m_s)} + DSM ${fmtKmS(sketch.dsm_total_m_s)} → combined ${fmtKmS(sketch.combined_need_m_s)}</p>
    <p class="studio-muted">${esc(sketch.note)}</p></div>`;
}

async function handleAct(act, el, host) {
  const out = el.querySelector('#studio-out');
  try {
    if (act === 'families') {
      if (!state.windowShortlist?.length) {
        notify('RUN PORKCHOP / OPEN WINDOWS FIRST');
        if (out) out.textContent = 'No shortlist. Open Windows or run porkchop.';
        return;
      }
      state.windowFamilies = clusterWindowFamilies(state.windowShortlist);
      renderStudioPanel(host);
      notify(`WINDOW FAMILIES · ${state.windowFamilies.families.length}`);
      return;
    }
    if (act === 'matrix') {
      const need = state.transferData?.dossier?.need;
      if (!need?.need_dv_m_s && need?.need_dv_m_s !== 0) {
        notify('COMPUTE TRANSFER FIRST');
        return;
      }
      state.architectureMatrix = buildArchitectureMatrix(need, {
        cargoMass_kg: state.cargoMass_kg,
        originBody: state.routeOrigin,
      });
      renderStudioPanel(host);
      notify('ARCHITECTURE MATRIX READY');
      return;
    }
    if (act === 'pin') {
      if (!state.transferData) {
        notify('COMPUTE FIRST');
        return;
      }
      const p = pinPlan(state);
      state.planPins = getPlanPins();
      renderStudioPanel(host);
      notify(`PINNED: ${p.label}`);
      return;
    }
    if (act === 'diff') {
      const pins = getPlanPins();
      if (pins.length < 2) {
        notify('PIN AT LEAST 2 PLANS');
        return;
      }
      const d = diffPlanPins(pins[0], pins[1]);
      if (out) {
        out.hidden = false;
        out.textContent = `Diff ${d.a_label} vs ${d.b_label}\nNeed Δ: ${fmtKmS(d.need_delta_m_s)}\nMargin Δ: ${fmtKmS(d.margin_delta_m_s)}\nReady: ${d.ready_a} vs ${d.ready_b}\n${d.note}`;
      }
      return;
    }
    if (act === 'clear-pins') {
      clearPlanPins();
      state.planPins = [];
      renderStudioPanel(host);
      notify('PINS CLEARED');
      return;
    }
    if (act === 'residual') {
      const dash = buildResidualDashboard(state.transferData, state);
      if (out) {
        out.hidden = false;
        out.textContent = dash.items.map((i) => `· ${i.title}: ${i.detail}`).join('\n') + `\n\n${dash.note}`;
      }
      return;
    }
    if (act === 'dsm') {
      const seed = suggestMidcourseDsmSeed({ dv_m_s: 80 });
      state.dsmNodes = normalizeDsmNodes([...(state.dsmNodes || []), ...seed]);
      renderStudioPanel(host);
      notify('DSM SEED ADDED (EDIT MAGNITUDE IN STATE / FUTURE UI)');
      return;
    }
    if (act === 'fidelity') {
      const id = el.querySelector('#studio-fidelity')?.value;
      const r = applyFidelityPreset(state, id);
      if (!r.ok) {
        notify(r.error || 'PRESET FAILED');
        return;
      }
      syncFidelityDom();
      if (r.preset?.warmDenseSpk) {
        try {
          const { ensureDenseSpkPacksLoaded } = await import('../physics/dense-spk-pack.js');
          await ensureDenseSpkPacksLoaded();
        } catch { /* */ }
      }
      renderStudioPanel(host);
      notify(`FIDELITY: ${r.preset.label}`);
      return;
    }
    if (act === 'playbook') {
      const id = el.querySelector('#studio-playbook')?.value;
      if (out) {
        out.hidden = false;
        out.textContent = 'Running playbook…';
      }
      const { runPlaybook } = await import('../agent/playbook-runner.js');
      const result = await runPlaybook(id);
      if (out) out.textContent = JSON.stringify(result, null, 2).slice(0, 4000);
      notify(`PLAYBOOK ${result.status || 'done'}`);
      return;
    }
    if (act === 'dag') {
      if (out) {
        out.hidden = false;
        out.textContent = 'Running campaign DAG…';
      }
      const { runCampaignDag } = await import('../agent/campaign-dag.js');
      const dag = await runCampaignDag({
        origin: state.routeOrigin?.name,
        destination: state.routeDestination?.name,
        compute: true,
        autoRecover: true,
        suggestItineraries: false,
      });
      if (out) {
        out.textContent = (dag.nodes || []).map((n) => `${n.status}: ${n.label}${n.detail ? ' — ' + n.detail : ''}`).join('\n');
      }
      renderStudioPanel(host);
      return;
    }
    if (act === 'review') {
      if (!state.transferData) {
        notify('COMPUTE FIRST');
        return;
      }
      const { saveSharedReview } = await import('../firebase/shared-plans.js');
      const r = await saveSharedReview(state.transferData, { title: 'Studio review' });
      if (out) {
        out.hidden = false;
        out.textContent = r.ok
          ? `Review saved ${r.local ? '(local)' : ''} id=${r.id}`
          : `Failed: ${r.error}`;
      }
      notify(r.ok ? 'REVIEW SAVED' : 'REVIEW FAILED');
      return;
    }
    if (act === 'stakeholder') {
      if (!state.transferData) {
        notify('COMPUTE FIRST');
        return;
      }
      const { exportStakeholderPackage } = await import('./mission-package.js');
      await exportStakeholderPackage(state.transferData);
      notify('STAKEHOLDER PACKAGE DOWNLOADED');
      return;
    }
  } catch (e) {
    console.warn(e);
    notify(e.message || 'Studio action failed');
    if (out) {
      out.hidden = false;
      out.textContent = e.message || String(e);
    }
  }
}

function syncFidelityDom() {
  try {
    const eph = document.getElementById('ephemeris-backend');
    if (eph) eph.value = state.ephemerisBackend;
    const geom = document.getElementById('path-geometry-select');
    if (geom) geom.value = state.pathGeometry;
    const ops = document.getElementById('flag-flight-ops');
    if (ops) ops.checked = !!state.flightOpsMode;
    const hi = document.getElementById('flag-horizons-inject');
    if (hi) hi.checked = !!state.horizonsEndpointInject;
    const nb = document.getElementById('flag-nbody');
    if (nb) nb.checked = !!state.pathAccuracy?.nbodyOverlay;
  } catch { /* */ }
}

export function wireStudioPanel() {
  // Lazy: re-rendered from route-display / ai-chrome
}
