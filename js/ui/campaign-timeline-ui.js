/**
 * Plan timeline strip — undo/redo + run plan flow CTA.
 */

import { state } from '../state.js';
import { notify } from './format.js';
import {
  getCampaign,
  listCampaignSteps,
  formatCampaignTimeline,
  pushCampaignStep,
  clearCampaign,
  snapshotCampaign,
  onCampaignChange,
} from '../agent/campaign-object.js';
import { dispatchPlanCommand } from '../domain/plan-commands.js';

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
        <button type="button" class="btn-tiny" id="ct-run" title="Plan flow DAG: compute, architecture matrix, optional recovery">RUN PLAN FLOW</button>
        <button type="button" class="btn-tiny" id="ct-undo" ${canUndo ? '' : 'disabled'}>UNDO</button>
        <button type="button" class="btn-tiny" id="ct-redo" ${canRedo ? '' : 'disabled'}>REDO</button>
        <button type="button" class="btn-tiny" id="ct-snap">SNAPSHOT</button>
        <button type="button" class="btn-tiny" id="ct-review-url" title="Copy URL that recomputes this plan">COPY REVIEW URL</button>
        <button type="button" class="btn-tiny" id="ct-clear" ${!steps.length ? 'disabled' : ''}>CLEAR</button>
      </span>
    </div>
    <ol class="ct-steps">
      ${steps.length
    ? lines.map((l, i) => `<li class="${i === camp?.cursor ? 'is-cur' : ''}" data-step="${i}">${esc(l)}</li>`).join('')
    : '<li class="ct-empty">No steps yet — compute or apply family/arch to log plan seeds.</li>'}
    </ol>
    <p class="ct-note">UNDO/REDO restores o/d, vehicle, dep/TOF, flybys from plan_request then recomputes. Not flight truth.</p>
  `;

  el.querySelector('#ct-undo')?.addEventListener('click', async () => {
    const r = await dispatchPlanCommand({ type: 'UNDO', source: 'timeline' });
    if (!r.ok) {
      notify('NOTHING TO UNDO');
      return;
    }
    notify(`UNDO → ${r.step?.label || 'prior'}`);
    renderCampaignTimeline(host);
  });
  el.querySelector('#ct-redo')?.addEventListener('click', async () => {
    const r = await dispatchPlanCommand({ type: 'REDO', source: 'timeline' });
    if (!r.ok) {
      notify('NOTHING TO REDO');
      return;
    }
    notify(`REDO → ${r.step?.label || 'next'}`);
    renderCampaignTimeline(host);
  });
  el.querySelector('#ct-snap')?.addEventListener('click', async () => {
    await dispatchPlanCommand({ type: 'SNAPSHOT', source: 'timeline' });
    notify('PLAN SNAPSHOT');
    renderCampaignTimeline(host);
  });
  el.querySelector('#ct-clear')?.addEventListener('click', async () => {
    await dispatchPlanCommand({ type: 'CLEAR_HISTORY' });
    notify('PLAN TIMELINE CLEARED');
    renderCampaignTimeline(host);
  });
  el.querySelector('#ct-review-url')?.addEventListener('click', async () => {
    try {
      const { buildReviewRecomputeUrl } = await import('./review-recompute.js');
      const url = await buildReviewRecomputeUrl();
      if (!url) {
        notify('SET ROUTE + COMPUTE FIRST');
        return;
      }
      await navigator.clipboard.writeText(url);
      notify('REVIEW URL COPIED · recompute=1');
    } catch (e) {
      notify(e.message || 'COPY FAILED');
    }
  });
  el.querySelector('#ct-run')?.addEventListener('click', async () => {
    const out = document.getElementById('studio-out')
      || document.querySelector('#helios-studio .studio-out');
    if (out) {
      out.hidden = false;
      out.textContent = 'Running plan flow…';
    }
    try {
      const r = await dispatchPlanCommand({
        type: 'RUN_WORKFLOW',
        workflow: 'dag',
        plan: {
          origin: state.routeOrigin?.name,
          destination: state.routeDestination?.name,
        },
        source: 'timeline',
      });
      const dag = r.result;
      if (out) {
        out.textContent = (dag?.nodes || [])
          .map((n) => `${n.status}: ${n.label}${n.detail ? ' — ' + n.detail : ''}`)
          .join('\n');
      }
      notify('PLAN FLOW COMPLETE');
      renderCampaignTimeline(host);
      import('./studio-panel.js').then((m) => m.renderStudioPanel?.(host)).catch(() => {});
    } catch (e) {
      notify(e.message || 'PLAN FLOW FAILED');
      if (out) out.textContent = e.message || String(e);
    }
  });

  // Click step to jump cursor + reapply via command bus
  el.querySelectorAll('[data-step]').forEach((li) => {
    li.style.cursor = 'pointer';
    li.addEventListener('click', async () => {
      const i = Number(li.getAttribute('data-step'));
      const r = await dispatchPlanCommand({ type: 'JUMP', index: i, source: 'timeline' });
      if (r.ok) notify(`JUMP → ${r.step?.label || i}`);
      renderCampaignTimeline(host);
    });
  });
}

export { snapshotCampaign };
