/**
 * Shared planning defaults for factual multi-rev / TOF policy.
 * Keeps route-planner, porkchop grid, and workers aligned.
 */

import { DAY } from '../constants.js';

/** TOF above this allows N=1 multi-rev automatically (outer / Type-II class). */
export const AUTO_MULTI_REV_TOF_SEC = 400 * DAY;

/**
 * Product default planning ephemeris backend when callers omit a stamp.
 * Prefer sample-de (L2/L3) over silent L1 approx regression.
 */
export const PRODUCT_PLANNING_BACKEND = 'sample-de';

/**
 * Resolve planning ephemeris backend from opts / route record.
 * @param {object} [opts]
 * @returns {'sample-de'|'approx'|string}
 */
export function resolvePlanningBackend(opts = {}) {
  const b = opts.ephemerisBackend || opts.backend || opts.ephemeris_backend;
  if (b === 'approx' || b === 'sample-de' || b === 'horizons-inject') return b;
  if (typeof b === 'string' && b.length) return b;
  return PRODUCT_PLANNING_BACKEND;
}

/**
 * Resolve Lambert max revolutions for a transfer time of flight.
 *
 * Priority:
 * 1. multiRevLambert flag → multiRevMax (≤2)
 * 2. explicit maxRevolutions > 0 → that value
 * 3. TOF > 400 d → 1 (auto outer/long windows)
 * 4. else 0
 *
 * @param {number|null|undefined} tofSec transfer time (s)
 * @param {object} [opts]
 * @param {boolean} [opts.multiRevLambert]
 * @param {number} [opts.multiRevMax]
 * @param {number|null} [opts.maxRevolutions] legacy / forced max when > 0
 * @returns {number} 0..2
 */
export function resolveMaxRevolutionsForTof(tofSec, opts = {}) {
  if (opts.multiRevLambert) {
    const n = opts.multiRevMax ?? opts.maxRevolutions ?? 1;
    return Math.min(2, Math.max(0, Math.floor(Number(n) || 0)));
  }

  const explicit = opts.maxRevolutions;
  if (explicit != null && Number.isFinite(Number(explicit)) && Number(explicit) > 0) {
    return Math.min(2, Math.floor(Number(explicit)));
  }

  if (tofSec != null && Number.isFinite(tofSec) && tofSec > AUTO_MULTI_REV_TOF_SEC) {
    return 1;
  }

  return 0;
}
