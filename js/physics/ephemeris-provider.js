/**
 * Planning ephemeris provider (K4).
 * Animation continues to call kepler.js directly.
 * Planning (Lambert / Need) may use:
 *   - 'approx' (L1)
 *   - 'sample-de' (L2-plan offline table)
 *   - Horizons inject cache (opt-in network, overrides sample when present)
 */

import {
  getBodyPosition3D as keplerPos,
  getBodyVelocity3D as keplerVel,
} from './kepler.js';
import {
  sampleAvailable, samplePosition3D, sampleVelocity3D, getSampleMeta,
} from './ephemeris-sample.js';
import { getHorizonsInjected } from './ephemeris-horizons-inject.js';

/**
 * @param {'approx'|'sample-de'|string|null|undefined} requested
 * @param {object} [_ctx] reserved
 * @returns {'approx'|'sample-de'}
 */
export function resolveBackend(requested, _ctx = {}) {
  if (requested === 'sample-de') return 'sample-de';
  return 'approx';
}

/**
 * Effective backend for a body at time (falls back if sample OOR).
 * @returns {{ backend: 'approx'|'sample-de'|'horizons-inject', sampleHit: boolean, horizonsHit: boolean }}
 */
export function effectiveBackend(body, timeSec, requested, ctx = {}) {
  // Injected Horizons endpoints win when present (explicit opt-in populated cache)
  if (ctx.allowHorizonsInject !== false) {
    const inj = getHorizonsInjected(body, timeSec);
    if (inj) return { backend: 'horizons-inject', sampleHit: false, horizonsHit: true };
  }
  const want = resolveBackend(requested, ctx);
  if (want !== 'sample-de') return { backend: 'approx', sampleHit: false, horizonsHit: false };
  if (!sampleAvailable(body, timeSec)) return { backend: 'approx', sampleHit: false, horizonsHit: false };
  return { backend: 'sample-de', sampleHit: true, horizonsHit: false };
}

/**
 * Planning position (heliocentric AU, physics/scene axes — exaggerate false).
 */
export function getPlanningPosition3D(body, timeSec, opts = {}) {
  const requested = opts.backend || opts.ephemerisBackend || 'sample-de';
  const { backend } = effectiveBackend(body, timeSec, requested, {
    allowHorizonsInject: opts.allowHorizonsInject,
  });
  if (backend === 'horizons-inject') {
    const inj = getHorizonsInjected(body, timeSec);
    if (inj) return { x: inj.x, y: inj.y, z: inj.z, r: Math.hypot(inj.x, inj.y, inj.z) };
  }
  if (backend === 'sample-de') {
    const p = samplePosition3D(body, timeSec);
    if (p) return p;
  }
  return keplerPos(body, timeSec, false);
}

/**
 * Planning velocity (m/s, HELIOS scene axes matching kepler velocity).
 */
export function getPlanningVelocity3D(body, timeSec, opts = {}) {
  const requested = opts.backend || opts.ephemerisBackend || 'sample-de';
  const { backend } = effectiveBackend(body, timeSec, requested, {
    allowHorizonsInject: opts.allowHorizonsInject,
  });
  if (backend === 'horizons-inject') {
    const inj = getHorizonsInjected(body, timeSec);
    if (inj?.v) return inj.v;
  }
  if (backend === 'sample-de') {
    const v = sampleVelocity3D(body, timeSec);
    if (v) return v;
  }
  return keplerVel(body, timeSec, false);
}

export function sampleMeta() {
  return getSampleMeta();
}
