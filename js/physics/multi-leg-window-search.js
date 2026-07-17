/**
 * Coarse multi-leg launch-window search (local seed — not global optimum).
 * Uses solveMultiLegRoute via bind (avoids circular import with routing.js).
 */

import { AU, DAY, G_CONST } from '../constants.js';
import { SUN_DATA } from '../data/bodies.js';

export const ML_N_DEP = 36;
export const ML_N_FB = 20;

/** @type {((waypoints: object[], routeOpts?: object) => object) | null} */
let _solveMultiLegRoute = null;

/** Called once from routing.js after solveMultiLegRoute is defined. */
export function bindSolveMultiLegRoute(fn) {
  _solveMultiLegRoute = fn;
}

function yieldTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Evaluate one multi-leg seed candidate.
 * @returns {{ departureSimTime, flybyTimes, arrivalSimTime, dvTotal } | null}
 */
export function evaluateMultiLegWindowCandidate(
  origin,
  dest,
  flybyHints,
  dep,
  lag0,
  scale,
  routeOpts = {},
) {
  if (!_solveMultiLegRoute) {
    throw new Error('solveMultiLegRoute not bound — import routing.js first');
  }
  const nFb = flybyHints.length;
  const flybyTimes = [dep + lag0];
  for (let k = 1; k < nFb; k++) {
    const gap = 180 * DAY * k;
    flybyTimes.push(flybyTimes[k - 1] + gap);
  }
  const lastBody = flybyHints[nFb - 1].body;
  const a1 = lastBody.a || 1.5;
  const a2 = dest.a || 5.2;
  const aT = (a1 + a2) / 2;
  const mu = G_CONST * SUN_DATA.mass;
  const tofTail = Math.PI * Math.sqrt(Math.pow(aT * AU, 3) / mu);
  const arr = flybyTimes[nFb - 1] + tofTail * scale;
  const wps = [
    { body: origin, simTime: dep },
    ...flybyHints.map((f, idx) => ({ body: f.body, simTime: flybyTimes[idx] })),
    { body: dest, simTime: arr },
  ];
  const td = _solveMultiLegRoute(wps, routeOpts);
  if (!td.allLegsOk) return null;
  if ((td.flybys || []).some((fb) => !fb.achievable)) return null;
  return {
    departureSimTime: dep,
    flybyTimes: flybyTimes.slice(),
    arrivalSimTime: arr,
    dvTotal: td.dvTotalMultiLeg,
  };
}

/**
 * Synchronous multi-leg window search (Node tests / worker).
 */
export function findMultiLegWindow(origin, dest, flybyHints, depHint, routeOpts = {}, opts = {}) {
  if (!flybyHints || flybyHints.length === 0) return null;
  if (!origin || !dest || !isFinite(depHint)) return null;

  const N_DEP = opts.nDep || ML_N_DEP;
  const N_FB = opts.nFb || ML_N_FB;
  const lookForward = 6 * 365.25 * DAY;
  const lookBack = 90 * DAY;
  let best = null;

  for (let i = 0; i < N_DEP; i++) {
    if (opts.shouldCancel?.()) return null;
    const dep = depHint - lookBack + ((i + 0.5) / N_DEP) * (lookForward + lookBack);
    for (let j = 0; j < N_FB; j++) {
      const lag0 = (40 + (500 - 40) * (j + 0.5) / N_FB) * DAY;
      for (const scale of [0.7, 1.0, 1.3]) {
        const cand = evaluateMultiLegWindowCandidate(
          origin, dest, flybyHints, dep, lag0, scale, routeOpts,
        );
        if (!cand) continue;
        if (!best || cand.dvTotal < best.dvTotal) best = cand;
      }
    }
    opts.onProgress?.({ i: i + 1, n: N_DEP, best });
  }
  return best;
}

/**
 * Chunked async search — yields between departure columns.
 */
export async function findMultiLegWindowChunked(
  origin,
  dest,
  flybyHints,
  depHint,
  routeOpts = {},
  opts = {},
) {
  if (!flybyHints || flybyHints.length === 0) return null;
  if (!origin || !dest || !isFinite(depHint)) return null;

  const N_DEP = opts.nDep || ML_N_DEP;
  const N_FB = opts.nFb || ML_N_FB;
  const lookForward = 6 * 365.25 * DAY;
  const lookBack = 90 * DAY;
  let best = null;

  for (let i = 0; i < N_DEP; i++) {
    if (opts.shouldCancel?.()) return null;
    const dep = depHint - lookBack + ((i + 0.5) / N_DEP) * (lookForward + lookBack);
    for (let j = 0; j < N_FB; j++) {
      const lag0 = (40 + (500 - 40) * (j + 0.5) / N_FB) * DAY;
      for (const scale of [0.7, 1.0, 1.3]) {
        const cand = evaluateMultiLegWindowCandidate(
          origin, dest, flybyHints, dep, lag0, scale, routeOpts,
        );
        if (!cand) continue;
        if (!best || cand.dvTotal < best.dvTotal) best = cand;
      }
    }
    opts.onProgress?.({ i: i + 1, n: N_DEP, best });
    await yieldTick();
  }
  return best;
}
