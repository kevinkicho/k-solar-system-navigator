/**
 * Campaign timeline strip — undo/redo + run campaign CTA.
 */

import { state } from '../state.js';
import { notify } from './format.js';
import {
  getCampaign,
  listCampaignSteps,
  formatCampaignTimeline,
  undoCampaignStep,
  redoCampaignStep,
  pushCampaignStep,
  clearCampaign,
  snapshotCampaign,
  onCampaignChange,
} from '../agent/campaign-object.js';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {HTMLElement|null} host
 */
export function renderCampaignTimeline(host) {
  if (!host) return;
  let el = document.getElementById('campaign-timeline');
  if (!el) {
    el = document.createElement('div');
    el.id = 'campaign-timeline';
    el.className = 'campaign-timeline';
    const pathHud = document.getElementById('path-truth-hud');
    if (pathHud && pathHud.parentNode === host) pathHud.after(el);
    else host.prepend(el);
    if (!host.dataset.campaignTimelineBound) {
      host.dataset.campaignTimelineBound = '1';
      onCampaignChange(() => renderCampaignTimeline(host));
    }
  }

  const camp = getCampaign();
  const steps = listCampaignSteps();
  const lines = formatCampaignTimeline(camp);

  const canUndo = (camp?.cursor ?? 0) > 0;
  const canRedo = camp && camp.cursor < steps.length - 1;
  el.innerHTML = `
    <div class="ct-head">
      <span class="ct-title">PLAN TIMELINE · recompute seeds</span>
      <span class="ct-actions">
        <button type="button" class="btn-tiny" id="ct-run" title="Branching plan run: compute, architecture matrix, optional recovery (not flight ops)">RUN PLAN FLOW</button>
        <button type="button" class="btn-tiny" id="ct-undo" ${canUndo ? '' : 'disabled'}>UNDO</button>
        <button type="button" class="btn-tiny" id="ct-redo" ${canRedo ? '' : 'disabled'}>REDO</button>
        <button type="button" class="btn-tiny" id="ct-snap">SNAPSHOT</button>
        <button type="button" class="btn-tiny" id="ct-clear" ${!steps.length ? 'disabled' : ''}>CLEAR</button>
      </span>
    </div>
    <ol class="ct-steps">
      ${steps.length
    ? lines.map((l, i) => `<li class="${i === camp?.cursor ? 'is-cur' : ''}">${esc(l)}</li>`).join('')
    : '<li class="ct-empty">No steps yet — compute or apply family/arch to log plan seeds.</li>'}
    </ol>
    <p class="ct-note">Partial restore only: vehicle / cargo / dep / TOF from plan_request, then recompute. Does not restore flybys, origin/dest changes, or fidelity flags. Not flight truth.</p>
  `;

  el.querySelector('#ct-undo')?.addEventListener('click', async () => {
    const step = undoCampaignStep();
    if (!step) {
      notify('NOTHING TO UNDO');
      return;
    }
    await reapplyStep(step);
    notify(`UNDO → ${step.label}`);
    renderCampaignTimeline(host);
  });
  el.querySelector('#ct-redo')?.addEventListener('click', async () => {
    const step = redoCampaignStep();
    if (!step) {
      notify('NOTHING TO REDO');
      return;
    }
    await reapplyStep(step);
    notify(`REDO → ${step.label}`);
    renderCampaignTimeline(host);
  });
  el.querySelector('#ct-snap')?.addEventListener('click', () => {
    pushCampaignStep({
      kind: 'snapshot',
      label: 'Manual snapshot',
      source: 'timeline',
    });
    notify('CAMPAIGN SNAPSHOT');
    renderCampaignTimeline(host);
  });
  el.querySelector('#ct-clear')?.addEventListener('click', () => {
    clearCampaign();
    notify('CAMPAIGN CLEARED');
    renderCampaignTimeline(host);
  });
  el.querySelector('#ct-run')?.addEventListener('click', async () => {
    const out = document.getElementById('studio-out')
      || document.querySelector('#helios-studio .studio-out');
    if (out) {
      out.hidden = false;
      out.textContent = 'Running campaign…';
    }
    try {
      const { runCampaignDag } = await import('../agent/campaign-dag.js');
      pushCampaignStep({ kind: 'dag', label: 'Run campaign DAG', source: 'timeline' });
      const dag = await runCampaignDag({
        origin: state.routeOrigin?.name,
        destination: state.routeDestination?.name,
        compute: true,
        autoRecover: true,
        suggestItineraries: false,
      });
      pushCampaignStep({
        kind: 'dag_done',
        label: `DAG ${dag?.status || 'done'}`,
        detail: `${dag?.nodes?.length || 0} nodes`,
        source: 'timeline',
      });
      if (out) {
        out.textContent = (dag?.nodes || [])
          .map((n) => `${n.status}: ${n.label}${n.detail ? ' — ' + n.detail : ''}`)
          .join('\n');
      }
      notify('PLAN FLOW COMPLETE · review Studio / path truth');
      renderCampaignTimeline(host);
      import('./studio-panel.js').then((m) => m.renderStudioPanel?.(host)).catch(() => {});
    } catch (e) {
      notify(e.message || 'PLAN FLOW FAILED');
      if (out) out.textContent = e.message || String(e);
    }
  });
}

/**
 * Partial restore from plan_request seed (vehicle/dates/TOF only) + recompute.
 * Does not restore flybys or route endpoints.
 */
async function reapplyStep(step) {
  const pr = step?.plan_request;
  if (!pr) {
    notify('STEP HAS NO SEED — cannot restore');
    return;
  }
  // Apply vehicle fields from seed
  // Restore origin/dest when seed has them (partial — no surface points)
  if (pr.o || pr.d) {
    try {
      const { findByIdOrName } = await import('../data/catalog.js');
      const { setRouteOrigin, setRouteDestination } = await import('./route-planner.js');
      if (pr.o) {
        const b = findByIdOrName(pr.o);
        if (b) setRouteOrigin(b);
      }
      if (pr.d) {
        const b = findByIdOrName(pr.d);
        if (b) setRouteDestination(b);
      }
    } catch { /* */ }
  }
  if (pr.veh) {
    state.vehicleId = pr.veh;
    const sel = document.getElementById('vehicle-select');
    if (sel) {
      sel.value = pr.veh;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  if (pr.arch) state.starshipArch = pr.arch;
  if (pr.tankers != null) state.tankerCount = Number(pr.tankers) || 0;
  if (pr.cargo != null) {
    state.cargoMass_kg = Number(pr.cargo) || 0;
    const c = document.getElementById('cargo-mass');
    if (c) {
      c.value = String(state.cargoMass_kg);
      c.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (pr.dep) {
    const { dateToSimTime, dateToInputValue } = await import('./format.js');
    const { timeState } = await import('./time-system.js');
    const d = new Date(pr.dep + 'T00:00:00Z');
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
  if (pr.tof != null) {
    state.userTofDays = Number(pr.tof);
    const tofInput = document.getElementById('tof-days');
    if (tofInput) {
      tofInput.value = String(pr.tof);
      tofInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (state.routeOrigin && state.routeDestination) {
    const { computeRoute } = await import('./route-planner.js');
    computeRoute();
  }
}

export { snapshotCampaign };
