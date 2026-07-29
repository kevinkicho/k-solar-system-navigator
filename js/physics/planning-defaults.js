/**
 * Shared planning defaults for factual multi-rev / TOF policy.
 * Keeps route-planner, porkchop grid, and workers aligned.
 */

import { DAY } from '../constants.js';

/** TOF above this allows N=1 multi-rev automatically (outer / Type-II class). */
export const AUTO_MULTI_REV_TOF_SEC = 400 * DAY;

/**
 * Resolve Lambert max revolutions for a transfer time of flight.
 *
 * Priority:
 * 1. classroom → 0
 * 2. multiRevLambert flag → multiRevMax (≤2)
 * 3. explicit maxRevolutions > 0 → that value
 * 4. TOF > 400 d → 1 (auto outer/long windows)
 * 5. else 0
 *
 * @param {number|null|undefined} tofSec transfer time (s)
 * @param {object} [opts]
 * @param {boolean} [opts.classroomMode]
 * @param {boolean} [opts.multiRevLambert]
 * @param {number} [opts.multiRevMax]
 * @param {number|null} [opts.maxRevolutions] legacy / forced max when > 0
 * @returns {number} 0..2
 */
export function resolveMaxRevolutionsForTof(tofSec, opts = {}) {
  if (opts.classroomMode) return 0;

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
