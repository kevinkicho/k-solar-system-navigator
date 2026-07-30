/**
 * Product chrome: fidelity chip, product-class footers, theme.
 */
import { state } from '../state.js';

export function syncFidelityChip() {
  const el = document.getElementById('fidelity-chip');
  if (!el) return;
  const f = state.fidelityLevel || 'L2-plan';
  el.textContent = f;
  el.className = `fidelity-chip fidelity-${f}`;
  el.title = `Planning ephemeris: ${f}${state.flightOpsMode ? ' · OPS review' : ''}`;
}

export function syncProductClassFooters() {
  const f = state.fidelityLevel || 'L2-plan';
  const line = `HELIOS · Industrial preliminary design · Not flight-certified · Not range safety · Eph: ${f}`;
  for (const id of ['product-class-footer-plan', 'product-class-footer-results']) {
    const el = document.getElementById(id);
    if (el) el.textContent = line;
  }
}

/** Apply theme: industrial default; ?theme=classic for neon HUD. */
export function applyProductTheme() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('theme') === 'classic') {
      document.body.classList.add('theme-classic');
    } else {
      document.body.classList.remove('theme-classic');
    }
  } catch { /* */ }
  syncFidelityChip();
  syncProductClassFooters();
}
