/**
 * Firebase Auth + cloud plans UI (topbar + plan list hooks).
 */
import { initFirebase, isFirebaseEnabled } from '../firebase/app.js';
import {
  watchAuth, signInWithGoogle, signOutUser, completeRedirectSignIn, currentUser,
} from '../firebase/auth.js';
import {
  savePlanToCloud, listCloudPlans, deleteCloudPlan,
} from '../firebase/plans.js';
import { state } from '../state.js';
import { notify } from './format.js';
import { activateRailTab } from './rail-ui.js';

function ensureAuthChip() {
  let chip = document.getElementById('firebase-auth-chip');
  if (chip) return chip;
  const right = document.querySelector('.right-info') || document.getElementById('top-bar');
  if (!right) return null;
  chip = document.createElement('button');
  chip.type = 'button';
  chip.id = 'firebase-auth-chip';
  chip.className = 'firebase-auth-chip';
  chip.title = 'Cloud account (Firebase Auth)';
  chip.textContent = '☁ SIGN IN';
  // Insert before ABOUT if possible
  const about = document.getElementById('btn-about');
  if (about?.parentNode) about.parentNode.insertBefore(chip, about);
  else right.appendChild(chip);
  return chip;
}

function renderAuthChip(user) {
  const chip = ensureAuthChip();
  if (!chip) return;
  if (!isFirebaseEnabled()) {
    chip.hidden = true;
    return;
  }
  chip.hidden = false;
  if (user) {
    const name = user.displayName || user.email || 'User';
    chip.textContent = `☁ ${name.split(' ')[0]}`;
    chip.title = `${user.email || user.uid} — click to sign out or manage cloud plans`;
    chip.onclick = async () => {
      const action = window.confirm(
        `Signed in as ${user.email || user.uid}\n\nOK = Cloud plans\nCancel = Sign out`,
      );
      if (action) {
        await showCloudPlansPanel();
      } else {
        await signOutUser();
        notify('SIGNED OUT');
      }
    };
  } else {
    chip.textContent = '☁ SIGN IN';
    chip.title = 'Sign in with Google to save plans to the cloud';
    chip.onclick = async () => {
      try {
        await signInWithGoogle();
        notify('SIGNED IN');
      } catch (err) {
        console.warn(err);
        notify(`SIGN-IN FAILED: ${err?.code || err?.message || 'error'}`);
      }
    };
  }
}

async function showCloudPlansPanel() {
  activateRailTab('plan');
  const host = document.getElementById('cloud-plans');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = '<div class="recent-empty">Loading cloud plans…</div>';
  try {
    const plans = await listCloudPlans(15);
    if (!plans.length) {
      host.innerHTML = '<div class="recent-empty">No cloud plans yet — compute a transfer, then Save to cloud</div>';
      return;
    }
    host.innerHTML = plans.map((p) => `
      <div class="cloud-plan-row" data-id="${escapeAttr(p.id)}">
        <button type="button" class="recent-item cloud-plan-open" title="Load route">
          ${escapeHtml(p.title || p.label || p.id)}
          ${p.departure_utc ? ` · ${String(p.departure_utc).slice(0, 10)}` : ''}
        </button>
        <button type="button" class="btn-tiny cloud-plan-del" title="Delete">✕</button>
      </div>
    `).join('');
    host.querySelectorAll('.cloud-plan-open').forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest('[data-id]');
        const id = row?.dataset?.id;
        const plan = plans.find((x) => x.id === id);
        if (!plan) return;
        const { applyPlanRequest } = await import('./share.js');
        const { parseDateUTC } = await import('./share-codec.js');
        applyPlanRequest({
          originId: plan.originId,
          destId: plan.destId,
          depDate: plan.departure_utc ? parseDateUTC(String(plan.departure_utc).slice(0, 10)) : new Date(),
          tofDays: plan.tof_days ?? null,
          flybys: [],
          vehicleId: plan.vehicleId || 'sh-starship',
          abstractBudget_m_s: 8000,
          costBasis: 'helio',
          view: plan.display_mode === 'schematic' ? 'schematic' : 'cinematic',
          tofIgnoredMulti: !!plan.isMultiLeg,
        });
        notify(`LOADED CLOUD PLAN: ${(plan.title || plan.label || '').toUpperCase()}`);
      };
    });
    host.querySelectorAll('.cloud-plan-del').forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest('[data-id]');
        const id = row?.dataset?.id;
        if (!id || !window.confirm('Delete this cloud plan?')) return;
        await deleteCloudPlan(id);
        notify('CLOUD PLAN DELETED');
        showCloudPlansPanel();
      };
    });
  } catch (err) {
    console.warn(err);
    host.innerHTML = `<div class="recent-empty">Cloud error: ${escapeHtml(err?.message || 'failed')}</div>`;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

/** Wire Save-to-cloud on results actions (call after results HTML render). */
export function wireSavePlanButton(td) {
  const btn = document.getElementById('btn-save-cloud');
  if (!btn) return;
  if (!isFirebaseEnabled()) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.onclick = async () => {
    if (!currentUser()) {
      try {
        await signInWithGoogle();
      } catch (err) {
        notify(`SIGN-IN REQUIRED: ${err?.message || 'failed'}`);
        return;
      }
    }
    try {
      const id = await savePlanToCloud(td);
      notify(`SAVED TO CLOUD · ${id}`);
      const host = document.getElementById('cloud-plans');
      if (host && !host.hidden) showCloudPlansPanel();
    } catch (err) {
      console.warn(err);
      notify(`SAVE FAILED: ${err?.message || 'error'}`);
    }
  };
}

export async function wireFirebaseUi() {
  if (state.classroomMode) {
    ensureAuthChip();
    const chip = document.getElementById('firebase-auth-chip');
    if (chip) chip.hidden = true;
    return;
  }
  initFirebase();
  ensureAuthChip();
  await completeRedirectSignIn();
  watchAuth((user) => {
    renderAuthChip(user);
    const host = document.getElementById('cloud-plans');
    if (!host) return;
    if (!isFirebaseEnabled()) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    if (user) {
      showCloudPlansPanel();
    } else {
      host.innerHTML = '<div class="recent-empty">Sign in to sync plans across devices</div>';
    }
  });
}
