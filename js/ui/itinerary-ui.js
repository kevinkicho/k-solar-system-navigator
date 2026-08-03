/**
 * Intelligent itinerary suggestion panel (Accept / Keep).
 */
import { state } from '../state.js';
import { DAY } from '../constants.js';
import { bodyId, findByIdOrName } from '../data/catalog.js';
import { suggestItineraries } from '../physics/itinerary-suggest.js';
import { isPlanetRelativeRoute } from '../physics/planet-relative.js';
import {
  dateToInputValue, dateToSimTime, inputValueToDate, notify, simTimeToDate,
} from './format.js';
import { timeState } from './time-system.js';
import { renderFlybyList, computeRoute } from './route-planner.js';
import { activateRailTab } from './rail-ui.js';

function formatDv(m_s) {
  if (m_s == null || !isFinite(m_s)) return '—';
  return `${(m_s / 1000).toFixed(2)} km/s`;
}

function ensurePanel() {
  let panel = document.getElementById('itinerary-panel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'itinerary-panel';
  panel.className = 'ga-suggest-panel itinerary-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="ga-suggest-head">
      <strong>INTELLIGENT ITINERARIES</strong>
      <button type="button" class="btn-tiny" id="itin-close" title="Close">✕</button>
    </div>
    <p class="ga-suggest-note"><strong>Local multi-leg seeds</strong> — intelligent templates + patched-conic evaluation · not a global tour optimizer · not flight-certified. Accept applies stops; Keep leaves plan.</p>
    <label class="ga-thorough-row" style="display:flex;align-items:center;gap:6px;font-size:10px;margin-bottom:8px">
      <input type="checkbox" id="itin-thorough" /> Thorough local grid (slower)
    </label>
    <div id="itin-list" class="ga-suggest-list"></div>
    <div class="ga-suggest-actions">
      <button type="button" class="btn-tiny" id="itin-keep">KEEP CURRENT</button>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('#itin-close')?.addEventListener('click', () => { panel.hidden = true; });
  panel.querySelector('#itin-keep')?.addEventListener('click', () => {
    panel.hidden = true;
    notify('KEEPING CURRENT ITINERARY');
  });
  return panel;
}

export function applyItinerary(s) {
  if (!s || !state.routeOrigin || !state.routeDestination) {
    notify('SET ORIGIN AND DESTINATION FIRST');
    return;
  }
  if (s.kind === 'itinerary-direct' || s.kind === 'direct') {
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
  const panel = document.getElementById('itinerary-panel');
  if (panel) panel.hidden = true;
  notify(`ITINERARY APPLIED: ${(s.itineraryLabel || s.label || '').toUpperCase()}`);
  try { activateRailTab('plan'); } catch { /* */ }
  computeRoute();
}

export async function runItinerarySuggest() {
  const origin = state.routeOrigin;
  const dest = state.routeDestination;
  if (!origin || !dest) {
    notify('SET ORIGIN AND DESTINATION FIRST');
    return null;
  }
  if (isPlanetRelativeRoute(origin, dest)) {
    notify('PLANET-RELATIVE: single-leg only — itinerary N/A');
    return null;
  }
  const dateInput = document.getElementById('depart-date');
  const inputDate = inputValueToDate(dateInput?.value);
  const depHint = (inputDate && !isNaN(inputDate.getTime()))
    ? dateToSimTime(inputDate)
    : timeState.simTime;

  const panel = ensurePanel();
  panel.hidden = false;
  const list = document.getElementById('itin-list');
  const thorough = !!document.getElementById('itin-thorough')?.checked;
  if (list) list.innerHTML = '<div class="ga-suggest-empty">Building intelligent itineraries…</div>';
  notify(thorough ? 'ITINERARIES (THOROUGH)…' : 'SUGGESTING ITINERARIES…');
  await new Promise((r) => setTimeout(r, 20));

  const routeOpts = {
    ephemerisBackend: state.ephemerisBackend === 'sample-de' ? 'sample-de' : 'approx',
    maxRevolutions: state.pathAccuracy?.multiRevLambert
      ? Math.min(2, state.pathAccuracy.multiRevMax ?? 1)
      : 0,
  };

  let pack;
  try {
    pack = suggestItineraries(origin, dest, depHint, routeOpts, { thorough });
  } catch (e) {
    notify(`ITINERARY FAILED: ${e.message || e}`);
    if (list) list.innerHTML = '<div class="ga-suggest-empty">Search failed.</div>';
    return null;
  }

  state.itinerarySuggestions = pack;
  renderList(pack);
  const n = pack.suggestions?.length || 0;
  const rec = pack.suggestions?.find((s) => s.recommended);
  notify(rec
    ? `ITINERARIES · ${n} · recommended: ${rec.itineraryLabel || rec.label}`
    : `ITINERARIES · ${n}`);

  // AI itinerary coach (non-blocking)
  try {
    let coach = document.getElementById('itin-ai-coach');
    if (!coach && panel) {
      coach = document.createElement('div');
      coach.id = 'itin-ai-coach';
      coach.className = 'ai-brief-out';
      coach.style.margin = '8px 0';
      panel.appendChild(coach);
    }
    if (coach) {
      coach.hidden = false;
      coach.textContent = 'AI itinerary coach: generating…';
      import('../agent/narratives.js').then(({ itineraryCoach }) =>
        itineraryCoach().then((r) => {
          coach.textContent = r.narrative;
        }).catch((e) => {
          coach.textContent = e.message || 'Itinerary coach unavailable (AI key / network)';
        }));
    }
  } catch { /* */ }

  return pack;
}

function renderList(pack) {
  const list = document.getElementById('itin-list');
  if (!list) return;
  if (!pack?.suggestions?.length) {
    list.innerHTML = '<div class="ga-suggest-empty">No itinerary seeds found. Try different dates.</div>';
    return;
  }
  list.innerHTML = pack.suggestions.map((s, i) => {
    const rec = s.recommended ? '<span class="ga-badge rec">RECOMMENDED</span>' : '';
    const stops = (s.stops || []).join(' → ');
    let vs = '';
    if (s.delta_vs_direct_m_s != null && isFinite(s.delta_vs_direct_m_s) && s.kind !== 'itinerary-direct') {
      const d = s.delta_vs_direct_m_s / 1000;
      vs = d < 0
        ? `<span class="ga-vs-better">${d.toFixed(2)} km/s vs direct</span>`
        : `<span class="ga-vs-worse">+${d.toFixed(2)} km/s vs direct</span>`;
    }
    return `
      <div class="ga-suggest-card ${s.recommended ? 'is-rec' : ''}" data-idx="${i}">
        <div class="ga-card-top">
          <span class="ga-badge kind">ITINERARY</span>
          ${rec}
        </div>
        <div class="ga-card-title">${escapeHtml(s.itineraryLabel || s.label)}</div>
        <div class="ga-card-meta">Stops: ${escapeHtml(stops)}</div>
        <div class="ga-card-meta">Need <strong>${formatDv(s.dvTotal_m_s)}</strong> ${vs}
          · TOF ${s.tof_days != null ? s.tof_days.toFixed(0) : '—'} d</div>
        <div class="ga-card-note">${escapeHtml(s.rationale || s.summary || '')}</div>
        <button type="button" class="btn-tiny ga-accept" data-idx="${i}">
          ${s.recommended ? 'ACCEPT RECOMMENDED ITINERARY' : 'ACCEPT ITINERARY'}
        </button>
      </div>`;
  }).join('');

  list.querySelectorAll('.ga-accept').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.getAttribute('data-idx'));
      const s = pack.suggestions[idx];
      if (s) applyItinerary(s);
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

export function wireItineraryUi() {
  const btn = document.getElementById('btn-itinerary-suggest');
  if (btn) {
    btn.onclick = () => {
      runItinerarySuggest().catch((e) => console.warn(e));
    };
  }
}
