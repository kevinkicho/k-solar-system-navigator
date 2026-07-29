/**
 * Firebase Auth + cloud plans + prefs/last-route UI.
 */
import { initFirebase, isFirebaseEnabled } from '../firebase/app.js';
import {
  watchAuth, signInWithGoogle, signOutUser, completeRedirectSignIn, currentUser,
} from '../firebase/auth.js';
import {
  savePlanToCloud, listCloudPlans, deleteCloudPlan,
} from '../firebase/plans.js';
import { loadUserPrefs, applyPrefsToState, saveUserPrefs } from '../firebase/prefs.js';
import { loadLastRoute, listWindowCampaigns } from '../firebase/rtdb.js';
import { state } from '../state.js';
import { notify } from './format.js';
import { activateRailTab } from './rail-ui.js';

let _menuEl = null;

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
  const about = document.getElementById('btn-about');
  if (about?.parentNode) about.parentNode.insertBefore(chip, about);
  else right.appendChild(chip);
  return chip;
}

function hideAccountMenu() {
  if (_menuEl) {
    _menuEl.remove();
    _menuEl = null;
  }
  document.removeEventListener('click', onDocClickClose, true);
}

function onDocClickClose(e) {
  if (!_menuEl) return;
  if (_menuEl.contains(e.target) || e.target?.id === 'firebase-auth-chip') return;
  hideAccountMenu();
}

function showAccountMenu(user, chip) {
  hideAccountMenu();
  const menu = document.createElement('div');
  menu.id = 'firebase-account-menu';
  menu.className = 'firebase-account-menu';
  menu.innerHTML = `
    <div class="fam-email">${escapeHtml(user.email || user.uid)}</div>
    <button type="button" data-act="plans">☁ Cloud plans</button>
    <button type="button" data-act="campaigns">▣ Window campaigns</button>
    <button type="button" data-act="last">↩ Load last route</button>
    <button type="button" data-act="prefs">💾 Save prefs</button>
    <button type="button" data-act="signout" class="fam-danger">Sign out</button>
  `;
  document.body.appendChild(menu);
  _menuEl = menu;

  const rect = chip.getBoundingClientRect();
  menu.style.top = `${Math.min(window.innerHeight - 200, rect.bottom + 6)}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;

  menu.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.onclick = async () => {
      const act = btn.dataset.act;
      hideAccountMenu();
      if (act === 'plans') {
        await showCloudPlansPanel();
      } else if (act === 'campaigns') {
        await showWindowCampaignsPanel();
      } else if (act === 'last') {
        await loadAndApplyLastRoute();
      } else if (act === 'prefs') {
        await saveUserPrefs();
        notify('PREFS SAVED TO CLOUD');
      } else if (act === 'signout') {
        await signOutUser();
        notify('SIGNED OUT');
      }
    };
  });

  setTimeout(() => document.addEventListener('click', onDocClickClose, true), 0);
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
    chip.title = `${user.email || user.uid} — account menu`;
    chip.onclick = (e) => {
      e.stopPropagation();
      if (_menuEl) hideAccountMenu();
      else showAccountMenu(user, chip);
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

async function showWindowCampaignsPanel() {
  try {
    const rows = await listWindowCampaigns(12);
    let panel = document.getElementById('window-campaigns-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'window-campaigns-panel';
      panel.className = 'cloud-plans recent-routes';
      panel.style.cssText = 'position:fixed;right:12px;top:56px;z-index:130;max-width:320px;max-height:50vh;overflow:auto;padding:10px;background:rgba(8,12,18,0.96);border:1px solid rgba(90,120,150,0.35);border-radius:4px;';
      document.body.appendChild(panel);
    }
    if (!rows.length) {
      panel.innerHTML = '<div class="recent-empty">No window campaigns saved yet. Run Search launch windows while signed in.</div>';
      notify('NO WINDOW CAMPAIGNS');
      return;
    }
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:11px">WINDOW CAMPAIGNS</strong>
        <button type="button" class="btn-tiny" id="wcp-close">CLOSE</button>
      </div>
      ${rows.map((r) => `
        <div class="cloud-plan-row" style="margin-bottom:6px;font-size:10px">
          <div><strong>${escapeHtml(r.label || `${r.origin}→${r.dest}`)}</strong></div>
          <div style="opacity:0.75">${r.shortlist?.length || 0} candidates · ${r.fidelity || '—'} · ${r.at ? new Date(r.at).toISOString().slice(0, 10) : ''}</div>
          <button type="button" class="btn-tiny wcp-apply" data-id="${r.id}">Show top</button>
        </div>`).join('')}`;
    panel.querySelector('#wcp-close')?.addEventListener('click', () => panel.remove());
    panel.querySelectorAll('.wcp-apply').forEach((btn) => {
      btn.onclick = () => {
        const row = rows.find((x) => x.id === btn.dataset.id);
        if (!row?.shortlist?.length) return;
        state.windowShortlist = row.shortlist;
        const top = row.shortlist[0];
        notify(`CAMPAIGN TOP: Δv ${((top.dv_m_s || 0) / 1000).toFixed(2)} km/s · ${String(top.dep_iso || '').slice(0, 10)}`);
      };
    });
    activateRailTab('plan');
  } catch (err) {
    console.warn(err);
    notify(`CAMPAIGNS FAILED: ${err?.message || 'error'}`);
  }
}

async function loadAndApplyLastRoute() {
  try {
    const lr = await loadLastRoute();
    if (!lr?.o || !lr?.d) {
      notify('NO LAST ROUTE IN CLOUD');
      return;
    }
    const { applyPlanRequest } = await import('./share.js');
    const { parseDateUTC } = await import('./share-codec.js');
    applyPlanRequest({
      originId: lr.o,
      destId: lr.d,
      depDate: lr.dep ? parseDateUTC(String(lr.dep).slice(0, 10)) : new Date(),
      tofDays: lr.tof ?? null,
      flybys: [],
      vehicleId: lr.veh || 'sh-starship',
      abstractBudget_m_s: 8000,
      costBasis: 'helio',
      view: 'cinematic',
      tofIgnoredMulti: false,
    });
    notify(`LOADED LAST ROUTE: ${(lr.label || `${lr.o}→${lr.d}`).toUpperCase()}`);
  } catch (err) {
    console.warn(err);
    notify(`LAST ROUTE FAILED: ${err?.message || 'error'}`);
  }
}

async function applyCloudPrefsOnSignIn() {
  const prefs = await loadUserPrefs();
  if (!prefs) return;
  applyPrefsToState(prefs);

  // Side-effectful display/map
  try {
    if (prefs.map_mode) {
      const { setMapMode } = await import('./map-mode.js');
      setMapMode(true, { silent: true });
    } else if (prefs.display_mode === 'schematic' || prefs.display_mode === 'cinematic') {
      const { setDisplayMode } = await import('../display-scale.js');
      setDisplayMode(prefs.display_mode);
    }
  } catch { /* */ }

  try {
    const { applyQualityTier } = await import('./quality-tier.js');
    applyQualityTier();
  } catch { /* */ }

  // Sync a few common selects if present
  const veh = document.getElementById('vehicle-select');
  if (veh && state.vehicleId) veh.value = state.vehicleId;
  const basis = document.getElementById('cost-basis');
  if (basis && state.costBasis) basis.value = state.costBasis;
  const disp = document.getElementById('display-mode-select');
  if (disp) disp.value = state.display?.mode || 'cinematic';
  const geom = document.getElementById('path-geometry-select');
  if (geom) geom.value = state.pathGeometry || 'visual';
  const eph = document.getElementById('ephemeris-backend');
  if (eph && state.ephemerisBackend) eph.value = state.ephemerisBackend;

  notify('CLOUD PREFS LOADED');
}

async function showCloudPlansPanel() {
  activateRailTab('plan');
  // Expand advanced if needed so cloud list is visible
  const adv = document.getElementById('plan-advanced');
  if (adv && !adv.open) adv.open = true;

  const host = document.getElementById('cloud-plans');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = '<div class="recent-empty">Loading cloud plans…</div>';
  try {
    const plans = await listCloudPlans(20);
    const lr = await loadLastRoute().catch(() => null);
    let html = '';
    if (lr?.o && lr?.d) {
      html += `<button type="button" class="recent-item" id="cloud-last-route" title="RTDB last route">
        ↩ Last: ${escapeHtml(lr.label || `${lr.o} → ${lr.d}`)}${lr.dep ? ` · ${lr.dep}` : ''}
      </button>`;
    }
    if (!plans.length) {
      html += '<div class="recent-empty">No cloud plans yet — compute a transfer, then Save to cloud</div>';
      host.innerHTML = html;
      const lastBtn = document.getElementById('cloud-last-route');
      if (lastBtn) lastBtn.onclick = () => loadAndApplyLastRoute();
      return;
    }
    html += plans.map((p) => `
      <div class="cloud-plan-row" data-id="${escapeAttr(p.id)}">
        <button type="button" class="recent-item cloud-plan-open" title="Load route">
          ${escapeHtml(p.title || p.label || p.id)}
          ${p.departure_utc ? ` · ${String(p.departure_utc).slice(0, 10)}` : ''}
          ${p.has_mission_blob ? ' · 📦' : ''}
        </button>
        <button type="button" class="btn-tiny cloud-plan-del" title="Delete">✕</button>
      </div>
    `).join('');
    host.innerHTML = html;

    const lastBtn = document.getElementById('cloud-last-route');
    if (lastBtn) lastBtn.onclick = () => loadAndApplyLastRoute();

    host.querySelectorAll('.cloud-plan-open').forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest('[data-id]');
        const id = row?.dataset?.id;
        const plan = plans.find((x) => x.id === id);
        if (!plan) return;
        await applyCloudPlan(plan);
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

async function applyCloudPlan(plan) {
  if (plan.plan_request) {
    const { planJsonToRequest } = await import('./mission-import.js');
    const { applyPlanRequest } = await import('./share.js');
    const req = planJsonToRequest(plan.plan_request)
      || planJsonToRequest({ plan_request: plan.plan_request });
    if (req) {
      applyPlanRequest(req);
      if (plan.map_mode || plan.plan_request.map) {
        const { setMapMode } = await import('./map-mode.js');
        setMapMode(true, { silent: true });
      }
      notify(`LOADED CLOUD PLAN v2: ${(plan.title || plan.label || '').toUpperCase()}`);
      return;
    }
  }
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
    view: plan.display_mode === 'schematic' || plan.map_mode ? 'schematic' : 'cinematic',
    tofIgnoredMulti: !!plan.isMultiLeg,
  });
  if (plan.map_mode) {
    const { setMapMode } = await import('./map-mode.js');
    setMapMode(true, { silent: true });
  }
  notify(`LOADED CLOUD PLAN: ${(plan.title || plan.label || '').toUpperCase()}`);
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

  // Plan-tab refresh button
  const refreshBtn = document.getElementById('btn-refresh-cloud-plans');
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      if (!currentUser()) {
        try { await signInWithGoogle(); } catch { notify('SIGN IN REQUIRED'); return; }
      }
      await showCloudPlansPanel();
    };
  }

  let prefsLoadedFor = null;
  watchAuth(async (user) => {
    renderAuthChip(user);
    const host = document.getElementById('cloud-plans');
    if (!host) return;
    if (!isFirebaseEnabled()) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    if (user) {
      if (prefsLoadedFor !== user.uid) {
        prefsLoadedFor = user.uid;
        await applyCloudPrefsOnSignIn();
      }
      showCloudPlansPanel();
    } else {
      prefsLoadedFor = null;
      host.innerHTML = '<div class="recent-empty">Sign in to sync plans across devices</div>';
    }
  });
}
