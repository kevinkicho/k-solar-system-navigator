/**
 * Mobile / map-first companion mode — denser campaign review surface.
 * Enable with ?companion=1 or Studio toggle.
 */

import { state } from '../state.js';

export function isCompanionQuery() {
  try {
    return /[?&]companion=1(?:&|$)/.test(location.search || '');
  } catch {
    return false;
  }
}

export function applyCompanionMode(on) {
  state.companionMode = !!on;
  try {
    document.documentElement.classList.toggle('helios-companion', !!on);
    document.body?.classList.toggle('helios-companion', !!on);
  } catch { /* */ }
  try {
    localStorage.setItem('helios-companion', on ? '1' : '0');
  } catch { /* */ }
  try {
    window.dispatchEvent(new CustomEvent('helios-companion', { detail: { on: !!on } }));
  } catch { /* */ }
  return { ok: true, companionMode: state.companionMode };
}

export function wireCompanionMode() {
  let on = isCompanionQuery();
  if (!on) {
    try {
      on = localStorage.getItem('helios-companion') === '1';
    } catch { /* */ }
  }
  if (on) applyCompanionMode(true);

  // Chip in top bar
  try {
    const right = document.querySelector('#top-bar .right-info') || document.getElementById('top-bar');
    if (right && !document.getElementById('btn-companion')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-companion';
      btn.className = 'btn-tiny';
      btn.textContent = state.companionMode ? 'FULL' : 'COMPANION';
      btn.title = 'Toggle mobile companion mode (dense Results / studio)';
      btn.onclick = () => {
        applyCompanionMode(!state.companionMode);
        btn.textContent = state.companionMode ? 'FULL' : 'COMPANION';
      };
      const about = document.getElementById('btn-about');
      if (about) right.insertBefore(btn, about);
      else right.appendChild(btn);
    }
  } catch { /* */ }
}
