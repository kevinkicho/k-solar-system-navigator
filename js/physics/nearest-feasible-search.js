/**
 * Pure nearest-feasible window search (pathological recovery).
 * ~N_DEP × N_TOF Lambert cells. Sync + chunked async for UI / worker use.
 */

import { AU, DAY, PI, G_CONST } from '../constants.js';
import { SUN_DATA } from '../data/bodies.js';
import { solveLambertBestBranch } from './lambert.js';
import {
  getPlanningPosition3D,
  getPlanningVelocity3D,
} from './ephemeris-provider.js';

export const MIN_PERIHELION_AU = 0.3;
export const DEFAULT_N_DEP = 40;
export const DEFAULT_N_TOF = 35;

function synodicPeriod(b1, b2) {
  const TWO_PI = 2 * PI;
  const n1 = TWO_PI / b1.period;
  const n2 = TWO_PI / b2.period;
  const dn = Math.abs(n1 - n2);
  return dn > 1e-20 ? TWO_PI / dn : b1.period;
}

/**
 * Build grid bounds for the search.
 */
export function buildNearestFeasibleGrid(body1, body2, depHint, tofHint, opts = {}) {
  const N_DEP = opts.nDep || DEFAULT_N_DEP;
  const N_TOF = opts.nTof || DEFAULT_N_TOF;
  const synodic = synodicPeriod(body1, body2);
  const allowPast = !!opts.allowPast;
  const lookBack = allowPast ? synodic : 30 * DAY;
  const lookForward = Math.max(
    2 * 365.25 * DAY,
    Math.min(3 * synodic, 10 * 365.25 * DAY),
  );
  const departStart = depHint - lookBack;
  const departEnd = depHint + lookForward;
  const tofMin = 0.35 * tofHint;
  const tofMax = 2.2 * tofHint;
  return {
    N_DEP,
    N_TOF,
    departStart,
    departEnd,
    tofMin,
    tofMax,
    pOpts: {
      backend: opts.backend || 'approx',
      classroomMode: !!opts.classroomMode,
    },
    mu: G_CONST * SUN_DATA.mass,
  };
}

/**
 * Evaluate one (dep, tof) cell. Returns candidate or null.
 */
export function evaluateNearestFeasibleCell(body1, body2, dep, tof, pOpts, mu) {
  const arr = dep + tof;
  const p1 = getPlanningPosition3D(body1, dep, pOpts);
  const p2 = getPlanningPosition3D(body2, arr, pOpts);
  const r1 = [p1.x * AU, p1.y * AU, p1.z * AU];
  const r2 = [p2.x * AU, p2.y * AU, p2.z * AU];
  const vb1 = getPlanningVelocity3D(body1, dep, pOpts);
  const vb2 = getPlanningVelocity3D(body2, arr, pOpts);
  const sol = solveLambertBestBranch(r1, r2, tof, mu, vb1, vb2);
  if (!sol) return null;
  const periAU = (sol.orb.a * (1 - sol.orb.e)) / AU;
  if (!isFinite(periAU) || periAU < MIN_PERIHELION_AU) return null;
  return {
    departureSimTime: dep,
    transferTime: tof,
    arrivalSimTime: arr,
    dvTotal: sol.cost,
    perihelionAU: periAU,
  };
}

function yieldTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Synchronous full grid search (Node tests, worker, share import).
 * @returns {{ departureSimTime, transferTime, arrivalSimTime, dvTotal, perihelionAU } | null}
 */
export function findNearestFeasibleTransfer(body1, body2, depHint, tofHint, opts = {}) {
  if (!body1 || !body2 || !isFinite(depHint) || !isFinite(tofHint) || tofHint <= 0) {
    return null;
  }
  const grid = buildNearestFeasibleGrid(body1, body2, depHint, tofHint, opts);
  const { N_DEP, N_TOF, departStart, departEnd, tofMin, tofMax, pOpts, mu } = grid;
  let best = null;

  for (let i = 0; i < N_DEP; i++) {
    if (opts.shouldCancel?.()) return null;
    const dep = departStart + ((i + 0.5) / N_DEP) * (departEnd - departStart);
    for (let j = 0; j < N_TOF; j++) {
      const tof = tofMin + ((j + 0.5) / N_TOF) * (tofMax - tofMin);
      const cell = evaluateNearestFeasibleCell(body1, body2, dep, tof, pOpts, mu);
      if (!cell) continue;
      if (!best || cell.dvTotal < best.dvTotal) best = cell;
    }
    opts.onProgress?.({ i: i + 1, n: N_DEP, best });
  }
  return best;
}

/**
 * Async chunked search (main-thread fallback): yields between departure columns
 * so the UI can paint / cancel.
 */
export async function findNearestFeasibleTransferChunked(
  body1,
  body2,
  depHint,
  tofHint,
  opts = {},
) {
  if (!body1 || !body2 || !isFinite(depHint) || !isFinite(tofHint) || tofHint <= 0) {
    return null;
  }
  const grid = buildNearestFeasibleGrid(body1, body2, depHint, tofHint, opts);
  const { N_DEP, N_TOF, departStart, departEnd, tofMin, tofMax, pOpts, mu } = grid;
  let best = null;

  for (let i = 0; i < N_DEP; i++) {
    if (opts.shouldCancel?.()) return null;
    const dep = departStart + ((i + 0.5) / N_DEP) * (departEnd - departStart);
    for (let j = 0; j < N_TOF; j++) {
      const tof = tofMin + ((j + 0.5) / N_TOF) * (tofMax - tofMin);
      const cell = evaluateNearestFeasibleCell(body1, body2, dep, tof, pOpts, mu);
      if (!cell) continue;
      if (!best || cell.dvTotal < best.dvTotal) best = cell;
    }
    opts.onProgress?.({ i: i + 1, n: N_DEP, best });
    // Yield every column so the event loop can run (~40 yields for full grid).
    await yieldTick();
  }
  return best;
}
