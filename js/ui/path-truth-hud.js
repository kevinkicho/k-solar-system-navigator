/**
 * Always-on path truth strip in Results (and optional scene coach toast once).
 */

import { state, scenePathGeometry } from '../state.js';
import { buildPathTruth, formatPathTruthLine } from '../physics/path-truth.js';
import { timeState } from './time-system.js';

let _coachShown = false;

/**
 * Inject / refresh path truth HUD into Results host.
 * @param {HTMLElement|null} host
 */
export function renderPathTruthHud(host) {
  if (!host) return;
  let el = document.getElementById('path-truth-hud');
  if (!el) {
    el = document.createElement('div');
    el.id = 'path-truth-hud';
    el.className = 'path-truth-hud';
    // Prefer top of results
    const hero = document.getElementById('results-hero');
    if (hero && hero.parentNode === host) host.insertBefore(el, hero);
    else host.prepend(el);
  }

  const td = state.transferData;
  if (!td) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }

  const simT = timeState?.simTime ?? td.arrivalSimTime;
  const truth = buildPathTruth(td, state, simT);
  el.hidden = false;
  const line = formatPathTruthLine(truth);
  const detail = (truth.lines || []).map((l) => `<li>${escapeHtml(l)}</li>`).join('');
  el.innerHTML = `
    <div class="path-truth-title">PATH TRUTH · scene vs Need</div>
    <div class="path-truth-line">${escapeHtml(line)}</div>
    <ul class="path-truth-list">${detail}</ul>
    <p class="path-truth-note">${escapeHtml(truth.note || '')}</p>
  `;

  // Live residual vs scrub time
  if (truth.ok && simT != null && td.arrivalSimTime != null) {
    const frac = Math.max(0, Math.min(1,
      (simT - (td.departureSimTime || 0))
      / Math.max(1e-9, td.arrivalSimTime - (td.departureSimTime || 0))));
    const liveLine = document.createElement('div');
    liveLine.className = 'path-truth-scrub';
    liveLine.textContent = `Scrub ${(frac * 100).toFixed(0)}% · path-end vs live ${truth.destName || 'dest'}: ${
      truth.pathEndVsLive_AU != null ? truth.pathEndVsLive_AU.toExponential(2) + ' AU' : '—'
    } (grows as you leave ARR epoch — expected)`;
    el.appendChild(liveLine);
  }

  // First-compute coach (once per session)
  if (!_coachShown && truth.ok && scenePathGeometry() === 'visual') {
    _coachShown = true;
    try {
      import('./format.js').then(({ notify }) => {
        notify('PATH: cinematic arc matches planet tilts · Need stays physical · ARR ghost = endpoint');
      }).catch(() => {});
    } catch { /* */ }
  }
}

/** Refresh path truth when fly-study scrub moves (cheap). */
export function refreshPathTruthHud() {
  const host = document.getElementById('transfer-results')
    || document.getElementById('path-truth-hud')?.parentElement;
  if (host) renderPathTruthHud(host);
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
