/**
 * Render quality tiers — bloom / pixel ratio for mobile & reduced motion.
 */
import { state } from '../state.js';
import { composer, renderer } from '../scene/setup.js';
import { prefersReducedMotion } from '../scene/gravity-field.js';

/** @returns {'high'|'low'} */
export function resolveQualityTier() {
  const q = state.qualityTier || 'auto';
  if (q === 'high' || q === 'low') return q;
  try {
    if (prefersReducedMotion()) return 'low';
    if (typeof matchMedia === 'function' && matchMedia('(max-width: 768px)').matches) {
      return 'low';
    }
  } catch { /* */ }
  return 'high';
}

/**
 * Apply bloom strength / pixel ratio for current tier.
 * UnrealBloomPass is typically composer.passes[1].
 */
export function applyQualityTier() {
  const tier = resolveQualityTier();
  const high = tier === 'high';

  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1));
  } catch { /* */ }

  try {
    const passes = composer?.passes || [];
    for (const p of passes) {
      // UnrealBloomPass has strength / radius / threshold
      if (p && typeof p.strength === 'number') {
        p.strength = high ? 0.8 : 0;
        p.enabled = high;
      }
    }
  } catch { /* */ }

  document.body.classList.toggle('quality-low', !high);
  document.body.classList.toggle('quality-high', high);

  const badge = document.getElementById('quality-tier-badge');
  if (badge) badge.textContent = high ? 'FX: HIGH' : 'FX: LOW';
}

export function wireQualityTier() {
  applyQualityTier();
  try {
    const mq = matchMedia('(max-width: 768px)');
    const on = () => applyQualityTier();
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', on);
    else if (typeof mq.addListener === 'function') mq.addListener(on);
  } catch { /* */ }
  try {
    const mq2 = matchMedia('(prefers-reduced-motion: reduce)');
    const on2 = () => applyQualityTier();
    if (typeof mq2.addEventListener === 'function') mq2.addEventListener('change', on2);
  } catch { /* */ }

  const btn = document.getElementById('btn-quality-tier');
  if (btn) {
    btn.onclick = () => {
      const cur = resolveQualityTier();
      state.qualityTier = cur === 'high' ? 'low' : 'high';
      applyQualityTier();
      import('./format.js').then(({ notify }) =>
        notify(state.qualityTier === 'low' || resolveQualityTier() === 'low'
          ? 'RENDER QUALITY: LOW (bloom off)'
          : 'RENDER QUALITY: HIGH'));
    };
  }
}
