/**
 * Multi-step campaign run log with optional human approve gates.
 */

import { state } from '../state.js';
import { runMissionCampaign } from './campaign.js';
import { applyGateRecovery, proposeGateRecovery } from './recovery.js';
import { notify } from '../ui/format.js';

/** @type {{ id: string, steps: object[], status: string }|null} */
let _run = null;
const listeners = new Set();

export function getCampaignRun() {
  return _run;
}

export function onCampaignRunChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(_run); } catch { /* */ }
  }
  try {
    window.dispatchEvent(new CustomEvent('helios-campaign-run', { detail: _run }));
  } catch { /* */ }
}

function pushStep(step) {
  if (!_run) return;
  _run.steps.push({
    ...step,
    at: new Date().toISOString(),
  });
  _run.updated_at = new Date().toISOString();
  emit();
}

/**
 * @param {object} plan steps config
 * @param {{ requireApproval?: boolean, onApprove?: (step) => Promise<boolean> }} [opts]
 */
export async function runCampaignWithLog(plan = {}, opts = {}) {
  const requireApproval = !!opts.requireApproval;
  _run = {
    id: `run-${Date.now()}`,
    status: 'running',
    requireApproval,
    intent: plan.intent || null,
    steps: [],
    started_at: new Date().toISOString(),
  };
  emit();

  const steps = [
    { id: 'campaign', label: 'Apply route / vehicle / departure', kind: 'campaign' },
    { id: 'gates', label: 'Check dossier gates', kind: 'gates' },
    { id: 'recover', label: 'Auto-recover if NO-GO', kind: 'recover', optional: true },
    { id: 'ga', label: 'Optional SUGGEST GA', kind: 'ga', optional: true },
    { id: 'done', label: 'Campaign complete', kind: 'done' },
  ];

  let campaignResult = null;

  for (const s of steps) {
    if (s.kind === 'ga' && !plan.suggestGa) {
      pushStep({ id: s.id, label: s.label, status: 'skipped', detail: 'suggestGa not requested' });
      continue;
    }
    if (s.kind === 'recover' && plan.autoRecover === false) {
      pushStep({ id: s.id, label: s.label, status: 'skipped', detail: 'autoRecover off' });
      continue;
    }

    if (requireApproval && s.kind !== 'done' && s.kind !== 'gates') {
      pushStep({ id: s.id, label: s.label, status: 'awaiting_approval' });
      const ok = opts.onApprove
        ? await opts.onApprove(s)
        : await defaultApprove(s);
      if (!ok) {
        pushStep({ id: s.id, label: s.label, status: 'rejected' });
        _run.status = 'cancelled';
        emit();
        return _run;
      }
    }

    pushStep({ id: s.id, label: s.label, status: 'running' });

    try {
      if (s.kind === 'campaign') {
        campaignResult = await runMissionCampaign({
          ...plan,
          compute: plan.compute !== false,
          suggestGa: false, // GA step separate
        });
        pushStep({
          id: s.id,
          label: s.label,
          status: 'done',
          detail: campaignResult.steps?.map((x) => x.step).join(' → '),
          result: {
            missionReady: campaignResult.dossier?.mission_ready,
            triad: campaignResult.triad,
          },
        });
      } else if (s.kind === 'gates') {
        const ready = !!state.transferData?.dossier?.mission_ready
          || campaignResult?.dossier?.mission_ready;
        const status = state.transferData?.dossier?.status || campaignResult?.dossier?.status;
        pushStep({
          id: s.id,
          label: s.label,
          status: ready ? 'done' : 'warn',
          detail: `status=${status} mission_ready=${ready}`,
        });
      } else if (s.kind === 'recover') {
        const pack = proposeGateRecovery();
        if (!pack.proposals?.length) {
          pushStep({ id: s.id, label: s.label, status: 'skipped', detail: 'no proposals' });
        } else {
          const first = pack.proposals[0];
          if (requireApproval) {
            const ok = opts.onApprove
              ? await opts.onApprove({ ...s, recovery: first })
              : await defaultApprove({ ...s, label: `Recover: ${first.label}` });
            if (!ok) {
              pushStep({ id: s.id, label: s.label, status: 'skipped', detail: 'user rejected recovery' });
              continue;
            }
          }
          const r = await applyGateRecovery(first.id);
          pushStep({
            id: s.id,
            label: s.label,
            status: 'done',
            detail: `applied ${r.applied}`,
            result: { remaining_fails: r.remaining?.fails?.length },
          });
        }
      } else if (s.kind === 'ga') {
        const { runGaSuggestions } = await import('../ui/ga-suggest-ui.js');
        await runGaSuggestions();
        pushStep({
          id: s.id,
          label: s.label,
          status: 'done',
          detail: `n=${state.gaSuggestions?.suggestions?.length ?? 0}`,
        });
      } else if (s.kind === 'done') {
        pushStep({ id: s.id, label: s.label, status: 'done' });
      }
    } catch (e) {
      pushStep({ id: s.id, label: s.label, status: 'error', detail: e.message || String(e) });
      _run.status = 'failed';
      emit();
      return _run;
    }
  }

  _run.status = 'completed';
  _run.finished_at = new Date().toISOString();
  notify('PLAN FLOW LOG COMPLETE · review Results strip');
  emit();
  return _run;
}

function defaultApprove(step) {
  // Auto-approve in headless; UI overrides with modal
  if (typeof document === 'undefined') return Promise.resolve(true);
  return new Promise((resolve) => {
    const host = document.getElementById('ai-campaign-log') || document.body;
    const bar = document.createElement('div');
    bar.className = 'ai-approve-bar';
    bar.innerHTML = `
      <span>Approve step: <strong>${escapeHtml(step.label || step.id)}</strong>?</span>
      <button type="button" class="btn-tiny ai-approve-yes">APPROVE</button>
      <button type="button" class="btn-tiny ai-approve-no">SKIP</button>
    `;
    host.appendChild(bar);
    bar.querySelector('.ai-approve-yes').onclick = () => { bar.remove(); resolve(true); };
    bar.querySelector('.ai-approve-no').onclick = () => { bar.remove(); resolve(false); };
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderCampaignLog(host) {
  if (!host) return;
  let el = document.getElementById('ai-campaign-log');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ai-campaign-log';
    el.className = 'ai-campaign-log';
    host.prepend(el);
  }
  if (!_run) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  const steps = _run.steps || [];
  el.innerHTML = `
    <div class="ai-next-title">PLAN FLOW LOG · ${_run.status}</div>
    <ol class="ai-run-steps">
      ${steps.map((s) => `
        <li class="ai-run-step status-${s.status || 'done'}">
          <span class="ai-run-status">${s.status || 'done'}</span>
          <span class="ai-run-label">${escapeHtml(s.label || s.id)}</span>
          ${s.detail ? `<span class="ai-run-detail">${escapeHtml(s.detail)}</span>` : ''}
        </li>`).join('')}
    </ol>
  `;
}
