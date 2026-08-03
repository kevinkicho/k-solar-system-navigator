/**
 * Continuous readiness / fidelity / path-honesty watchdogs for AI core.
 */

import { state, PRODUCT_PATH_GEOMETRY, effectivePathGeometry } from '../state.js';
import { getMissionAiBundle } from './ai-core.js';

/**
 * Snapshot of agent "always-on" advice.
 */
export function runWatchdogs() {
  const { ctx, next } = getMissionAiBundle();
  const alerts = [];

  // Path honesty
  const geom = effectivePathGeometry();
  if (geom === 'visual') {
    alerts.push({
      id: 'path_visual',
      level: 'warn',
      title: 'Path geometry is visual',
      detail: 'Need still uses physical Lambert; restore product physical path for ship≡line honesty.',
      action: { type: 'set_path_geometry', value: PRODUCT_PATH_GEOMETRY },
    });
  }

  // Fidelity
  if (state.ephemerisBackend === 'approx') {
    alerts.push({
      id: 'fidelity_approx',
      level: 'warn',
      title: 'Planning on L1 approx',
      detail: 'Product pipeline prefers sample-DE / L3-plan offline table.',
      action: { type: 'set_ephemeris', value: 'sample-de' },
    });
  }
  if (ctx.transfer && !state.horizonsEndpointInject && (ctx.route?.destination)) {
    const a = state.routeDestination?.a ?? 1;
    if (a > 3) {
      alerts.push({
        id: 'fidelity_horizons',
        level: 'info',
        title: 'Optional live Horizons inject',
        detail: 'Outer destination: consider Horizons VECTORS at dep/arr (network · analysis).',
        action: { type: 'enable_horizons', value: true },
      });
    }
  }

  // Readiness
  if (ctx.route?.origin && ctx.route?.destination && !ctx.transfer) {
    alerts.push({
      id: 'ready_compute',
      level: 'info',
      title: 'Endpoints set — not computed',
      detail: 'Run compute to obtain Need / dossier.',
      action: { type: 'compute' },
    });
  }
  if (ctx.dossier && !ctx.dossier.mission_ready) {
    alerts.push({
      id: 'ready_nogo',
      level: 'fail',
      title: `Plan ${ctx.dossier.status || 'NO-GO'}`,
      detail: `${ctx.dossier.fail_count || 0} fail gate(s) · open recovery`,
      action: { type: 'recover' },
    });
  }
  if (ctx.dossier?.mission_ready) {
    alerts.push({
      id: 'ready_go',
      level: 'ok',
      title: 'Analysis-ready',
      detail: 'Fly study available (animation only · not flight release).',
      action: null,
    });
  }

  // Personality note
  const personality = state.ai?.personality || 'industrial';

  return {
    product_class: 'preliminary-not-flight-certified',
    personality,
    alerts,
    next_actions: next.slice(0, 4),
    readiness: ctx.dossier?.mission_ready
      ? 'ready'
      : (ctx.transfer ? 'blocked' : 'incomplete'),
  };
}

/**
 * Apply a watchdog action (deterministic).
 */
export async function applyWatchdogAction(action) {
  if (!action?.type) return { ok: false };
  switch (action.type) {
    case 'set_path_geometry':
      state.pathGeometry = action.value || PRODUCT_PATH_GEOMETRY;
      try {
        const sel = document.getElementById('path-geometry-select');
        if (sel) sel.value = state.pathGeometry;
        window.dispatchEvent(new CustomEvent('helios-path-geometry'));
      } catch { /* */ }
      return { ok: true, pathGeometry: state.pathGeometry };
    case 'set_ephemeris':
      state.ephemerisBackend = action.value || 'sample-de';
      if (state.ephemerisBackend === 'sample-de' && state.fidelityLevel === 'L1') {
        state.fidelityLevel = 'L2-plan';
      }
      try {
        const sel = document.getElementById('ephemeris-backend');
        if (sel) sel.value = state.ephemerisBackend;
      } catch { /* */ }
      return { ok: true, ephemerisBackend: state.ephemerisBackend };
    case 'enable_horizons':
      state.horizonsEndpointInject = !!action.value;
      try {
        const cb = document.getElementById('flag-horizons-inject');
        if (cb) cb.checked = state.horizonsEndpointInject;
      } catch { /* */ }
      return { ok: true, horizonsEndpointInject: state.horizonsEndpointInject };
    case 'compute': {
      const { computeRoute } = await import('../ui/route-planner.js');
      computeRoute();
      return { ok: true };
    }
    case 'recover': {
      const { proposeGateRecovery, applyGateRecovery } = await import('./recovery.js');
      const pack = proposeGateRecovery();
      if (!pack.proposals?.[0]) return { ok: false, error: 'no proposals' };
      return applyGateRecovery(pack.proposals[0].id);
    }
    default:
      return { ok: false, error: `unknown action ${action.type}` };
  }
}
