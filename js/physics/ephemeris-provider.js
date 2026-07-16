/**
 * Planning ephemeris provider (K4).
 * Animation continues to call kepler.js directly.
 * Planning (Lambert / Need) may use 'approx' or 'sample-de'.
 */

import {
  getBodyPosition3D as keplerPos,
  getBodyVelocity3D as keplerVel,
} from './kepler.js';
import {
  sampleAvailable, samplePosition3D, sampleVelocity3D, getSampleMeta,
} from './ephemeris-sample.js';

/**
 * @param {'approx'|'sample-de'|string|null|undefined} requested
 * @param {{ classroomMode?: boolean }} ctx
 * @returns {'approx'|'sample-de'}
 */
export function resolveBackend(requested, ctx = {}) {
  if (ctx.classroomMode) return 'approx';
  if (requested === 'sample-de') return 'sample-de';
  return 'approx';
}

/**
 * Effective backend for a body at time (falls back if sample OOR).
 * @returns {{ backend: 'approx'|'sample-de', sampleHit: boolean }}
 */
export function effectiveBackend(body, timeSec, requested, ctx = {}) {
  const want = resolveBackend(requested, ctx);
  if (want !== 'sample-de') return { backend: 'approx', sampleHit: false };
  if (!sampleAvailable(body, timeSec)) return { backend: 'approx', sampleHit: false };
  return { backend: 'sample-de', sampleHit: true };
}

/**
 * Planning position (heliocentric AU, physics axes — exaggerate false).
 */
export function getPlanningPosition3D(body, timeSec, opts = {}) {
  const requested = opts.backend || 'approx';
  const classroomMode = !!opts.classroomMode;
  const { backend } = effectiveBackend(body, timeSec, requested, { classroomMode });
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
  const requested = opts.backend || 'approx';
  const classroomMode = !!opts.classroomMode;
  const { backend } = effectiveBackend(body, timeSec, requested, { classroomMode });
  if (backend === 'sample-de') {
    const v = sampleVelocity3D(body, timeSec);
    if (v) return v;
  }
  return keplerVel(body, timeSec, false);
}

export function sampleMeta() {
  return getSampleMeta();
}
