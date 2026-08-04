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

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
