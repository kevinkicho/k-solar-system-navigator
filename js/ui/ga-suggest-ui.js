/**
 * Gravity-assist suggestion UI — recommend paths; user Accept or Keep current.
 * Manual flyby picker remains in Plan rail.
 */
import { state } from '../state.js';
import { DAY } from '../constants.js';
import { bodyId, findByIdOrName } from '../data/catalog.js';
import { suggestAssistPaths } from '../physics/ga-suggest.js';
import { isPlanetRelativeRoute } from '../physics/planet-relative.js';
import { dateToInputValue, dateToSimTime, inputValueToDate, notify, simTimeToDate } from './format.js';
import { timeState } from './time-system.js';
import { renderFlybyList, computeRoute } from './route-planner.js';
import { activateRailTab } from './rail-ui.js';

function formatDv(m_s) {
  if (m_s == null || !isFinite(m_s)) return '—';
  return `${(m_s / 1000).toFixed(2)} km/s`;
}

function formatDays(d) {
  if (d == null || !isFinite(d)) return '—';
  return `${d.toFixed(0)} d`;
}

function formatIsoDay(simT) {
  try {
    return simTimeToDate(simT).toISOString().slice(0, 10);
  } catch {
    return '—';
  }
}

function ensurePanel() {
  let panel = document.getElementById('ga-suggest-panel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'ga-suggest-panel';
  panel.className = 'ga-suggest-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="ga-suggest-head">
      <strong>GRAVITY-ASSIST SUGGESTIONS</strong>
      <button type="button" class="btn-tiny" id="ga-suggest-close" title="Close">✕</button>
    </div>
    <p class="ga-suggest-note">Coarse local seeds · patched-conic · not global tour design · not flight-certified. Accept applies flybys; Keep leaves your plan unchanged. Manual +FLYBY still available.</p>
    <div id="ga-suggest-list" class="ga-suggest-list"></div>
    <div class="ga-suggest-actions">
      <button type="button" class="btn-tiny" id="ga-suggest-keep">KEEP CURRENT</button>
    </div>
  `;
  const host = document.querySelector('.flyby-section') || document.getElementById('rail-pane-plan') || document.body;
  host.appendChild(panel);
  panel.querySelector('#ga-suggest-close')?.addEventListener('click', () => hideGaSuggestions());
  panel.querySelector('#ga-suggest-keep')?.addEventListener('click', () => {
    hideGaSuggestions();
    notify('KEEPING CURRENT ROUTE · no suggestion applied');
  });
  return panel;
}

export function hideGaSuggestions() {
  const panel = document.getElementById('ga-suggest-panel');
  if (panel) panel.hidden = true;
  state.gaSuggestions = null;
}

/**
 * Apply a suggestion: set flybys + departure, recompute.
 * @param {object} s suggestion from suggestAssistPaths
 */
export function applyGaSuggestion(s) {
  if (!s || !state.routeOrigin || !state.routeDestination) {
    notify('SET ORIGIN AND DESTINATION FIRST');
    return;
  }
  if (s.kind === 'direct') {
    state.flybys = [];
  } else {
    const times = s.flybyTimes || [];
    state.flybys = (s.flybyBodyIds || []).map((id, i) => {
      const b = findByIdOrName(id);
      return {
        bodyId: bodyId(b) || id,
        bodyName: b?.name || id,
        simTime: times[i] ?? (s.departureSimTime + (i + 1) * 120 * DAY),
      };
    });
  }
  const depInput = document.getElementById('depart-date');
  if (depInput && s.departureSimTime != null) {
    depInput.value = dateToInputValue(simTimeToDate(s.departureSimTime));
    timeState.simTime = s.departureSimTime;
    timeState.updateDisplay();
  }
  renderFlybyList();
  hideGaSuggestions();
  notify(`APPLIED: ${s.label.toUpperCase()} · recomputing…`);
  try { activateRailTab('plan'); } catch { /* */ }
  computeRoute();
}

function renderSuggestionList(pack) {
  const list = document.getElementById('ga-suggest-list');
  if (!list) return;
  if (!pack?.suggestions?.length) {
    list.innerHTML = '<div class="ga-suggest-empty">No feasible assist seeds in this coarse search. Try different dates, or add a flyby manually.</div>';
    return;
  }
  list.innerHTML = pack.suggestions.map((s, i) => {
    const rec = s.recommended ? '<span class="ga-badge rec">RECOMMENDED</span>' : '';
    const kind = s.kind === 'direct' ? 'DIRECT' : 'ASSIST';
    const fb = s.flybyNames?.length ? s.flybyNames.join(' · ') : '—';
    return `
      <div class="ga-suggest-card ${s.recommended ? 'is-rec' : ''}" data-idx="${i}">
        <div class="ga-card-top">
          <span class="ga-badge kind">${kind}</span>
          ${rec}
        </div>
        <div class="ga-card-title">${escapeHtml(s.label)}</div>
        <div class="ga-card-meta">
          Need (helio multi/single) <strong>${formatDv(s.dvTotal_m_s)}</strong>
          · TOF ${formatDays(s.tof_days)}
          · Dep ${formatIsoDay(s.departureSimTime)}
        </div>
        <div class="ga-card-meta">Flyby: ${escapeHtml(fb)}</div>
        <div class="ga-card-note">${escapeHtml(s.summary || s.note || '')}</div>
        <button type="button" class="btn-tiny ga-accept" data-idx="${i}">
          ${s.recommended ? 'ACCEPT RECOMMENDED' : 'ACCEPT THIS PATH'}
        </button>
      </div>`;
  }).join('');

  list.querySelectorAll('.ga-accept').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.getAttribute('data-idx'));
      const s = pack.suggestions[idx];
      if (s) applyGaSuggestion(s);
    };
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Run suggestion search and show panel.
 */
export async function runGaSuggestions() {
  const origin = state.routeOrigin;
  const dest = state.routeDestination;
  if (!origin || !dest) {
    notify('SET ORIGIN AND DESTINATION FIRST');
    return;
  }
  if (isPlanetRelativeRoute(origin, dest)) {
    notify('PLANET-RELATIVE ROUTES ARE SINGLE-LEG — gravity-assist N/A');
    return;
  }

  const dateInput = document.getElementById('depart-date');
  const inputDate = inputValueToDate(dateInput?.value);
  const depHint = (inputDate && !isNaN(inputDate.getTime()))
    ? dateToSimTime(inputDate)
    : timeState.simTime;

  const panel = ensurePanel();
  panel.hidden = false;
  const list = document.getElementById('ga-suggest-list');
  if (list) {
    list.innerHTML = '<div class="ga-suggest-empty">Searching assist seeds (coarse local grid)…</div>';
  }
  notify('SUGGESTING GRAVITY-ASSIST PATHS…');

  // Yield so UI paints
  await new Promise((r) => setTimeout(r, 20));

  const routeOpts = {
    ephemerisBackend: state.ephemerisBackend === 'sample-de' ? 'sample-de' : 'approx',
    maxRevolutions: state.pathAccuracy?.multiRevLambert
      ? Math.min(2, state.pathAccuracy.multiRevMax ?? 1)
      : 0,
  };

  let pack;
  try {
    pack = suggestAssistPaths(origin, dest, depHint, routeOpts, {});
  } catch (err) {
    console.warn('[HELIOS] GA suggest', err);
    notify(`GA SUGGEST FAILED: ${err?.message || 'error'}`);
    if (list) list.innerHTML = '<div class="ga-suggest-empty">Search failed. Use +FLYBY manually.</div>';
    return;
  }

  state.gaSuggestions = pack;
  renderSuggestionList(pack);
  const n = pack.suggestions?.length || 0;
  const rec = pack.suggestions?.find((s) => s.recommended);
  notify(rec
    ? `GA SUGGEST · ${n} path(s) · recommended: ${rec.label}`
    : `GA SUGGEST · ${n} path(s)`);
  try { activateRailTab('plan'); } catch { /* */ }
}

export function wireGaSuggestUi() {
  const btn = document.getElementById('btn-ga-suggest');
  if (btn) {
    btn.onclick = () => {
      runGaSuggestions().catch((e) => console.warn(e));
    };
  }
  // Panel created lazily on first open
}
