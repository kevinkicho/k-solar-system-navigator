/**
 * Dense neighborhood refine around porkchop shortlist candidates.
 * Re-evaluates Lambert at sub-grid spacing under the planning ephemeris.
 * Preliminary analysis — not a global mission optimizer.
 */
import { DAY } from '../constants.js';
import { evaluateCell } from './porkchop-grid.js';

/**
 * Score a window candidate (lower is better).
 * Blends Δv (primary) with mild C3 and mid-TOF preference for diversity.
 * @param {object} c
 * @param {{ dvRef?: number, tofMidDays?: number }} [ctx]
 */
export function scoreWindowCandidate(c, ctx = {}) {
  const dv = Number(c.dv_m_s);
  if (!Number.isFinite(dv)) return Infinity;
  let s = dv;
  const c3 = Number(c.c3_m2_s2);
  if (Number.isFinite(c3) && c3 > 0) {
    // Mild C3 pressure (~10% weight vs 1 km/s Δv scale)
    s += 0.05 * Math.sqrt(c3);
  }
  const tofD = Number(c.tof_days);
  const mid = ctx.tofMidDays;
  if (Number.isFinite(tofD) && Number.isFinite(mid) && mid > 0) {
    // Prefer windows near mid-TOF band of the search (soft)
    s += 80 * Math.abs(tofD - mid) / mid;
  }
  // Multi-rev solutions slightly penalized (more path risk educationally)
  if ((c.revolutions | 0) > 0) s += 150 * (c.revolutions | 0);
  return s;
}

/**
 * Re-rank shortlist with multi-objective score + optional dep-day diversity.
 * @param {Array<object>} shortlist
 * @param {object} [opts]
 * @param {number} [opts.topN=8]
 * @param {number} [opts.minDepDayGap=5] min days between shortlisted deps
 */
export function rankShortlistScored(shortlist, opts = {}) {
  const topN = Math.max(1, Math.min(20, opts.topN ?? 8));
  const minGap = Math.max(0, opts.minDepDayGap ?? 5);
  const tofs = (shortlist || []).map((c) => Number(c.tof_days)).filter(Number.isFinite);
  const tofMid = tofs.length ? tofs.reduce((a, b) => a + b, 0) / tofs.length : null;
  const scored = (shortlist || [])
    .map((c) => ({
      ...c,
      score: scoreWindowCandidate(c, { tofMidDays: tofMid }),
    }))
    .filter((c) => Number.isFinite(c.score))
    .sort((a, b) => a.score - b.score);

  const picked = [];
  for (const c of scored) {
    if (picked.length >= topN) break;
    const depDay = c.dep_sim != null
      ? c.dep_sim / DAY
      : (c.dep_iso ? Date.parse(c.dep_iso) / 86400000 : null);
    if (minGap > 0 && depDay != null && Number.isFinite(depDay)) {
      const clash = picked.some((p) => {
        const pd = p.dep_sim != null
          ? p.dep_sim / DAY
          : (p.dep_iso ? Date.parse(p.dep_iso) / 86400000 : null);
        return pd != null && Math.abs(pd - depDay) < minGap;
      });
      if (clash && picked.length >= 2) continue;
    }
    picked.push(c);
  }
  // Fill if diversity skipped too many
  if (picked.length < topN) {
    for (const c of scored) {
      if (picked.length >= topN) break;
      if (!picked.includes(c)) picked.push(c);
    }
  }
  return picked.map((c, i) => ({ ...c, rank: i + 1 }));
}

/**
 * Dense neighborhood refine: for each seed, search ±halfStep in dep/tof
 * at `subdiv` sub-steps using evaluateCell (planning ephemeris).
 *
 * @param {Array<object>} shortlist seeds (from buildWindowShortlist)
 * @param {object} body1
 * @param {object} body2
 * @param {object} gridSpec
 * @param {object} [opts]
 * @param {object} [opts.planOpts]
 * @param {number} [opts.subdiv=3] odd-ish neighborhood half-width in substeps
 * @param {number} [opts.topN=8]
 * @returns {{ shortlist: Array, refined: boolean, nEvals: number }}
 */
export function refineShortlistNeighborhood(shortlist, body1, body2, gridSpec, opts = {}) {
  const planOpts = opts.planOpts || { backend: 'approx' };
  const subdiv = Math.max(1, Math.min(5, opts.subdiv ?? 3));
  const topN = opts.topN ?? 8;
  const { nx, ny, departStart, departEnd, tofMin, tofMax } = gridSpec || {};
  if (!body1 || !body2 || !shortlist?.length || !(nx > 0) || !(ny > 0)) {
    return {
      shortlist: rankShortlistScored(shortlist || [], { topN }),
      refined: false,
      nEvals: 0,
    };
  }

  const depStep = (departEnd - departStart) / nx;
  const tofStep = (tofMax - tofMin) / ny;
  const dDep = depStep / (subdiv + 1);
  const dTof = tofStep / (subdiv + 1);
  const half = subdiv;

  const candidates = [];
  let nEvals = 0;

  for (const seed of shortlist) {
    const dep0 = seed.dep_sim ?? (departStart + ((seed.ix + 0.5) / nx) * (departEnd - departStart));
    const tof0 = seed.tof_s ?? (tofMin + ((seed.iy + 0.5) / ny) * (tofMax - tofMin));
    if (!Number.isFinite(dep0) || !Number.isFinite(tof0)) continue;

    let best = null;
    for (let di = -half; di <= half; di++) {
      for (let dj = -half; dj <= half; dj++) {
        const dep = dep0 + di * dDep;
        const tof = tof0 + dj * dTof;
        if (tof < tofMin * 0.5 || tof > tofMax * 1.5) continue;
        if (dep < departStart - depStep || dep > departEnd + depStep) continue;
        const cell = evaluateCell(body1, body2, dep, tof, planOpts);
        nEvals++;
        if (!cell || !Number.isFinite(cell.dv)) continue;
        const row = {
          rank: 0,
          ix: seed.ix,
          iy: seed.iy,
          dep_sim: dep,
          tof_s: tof,
          tof_days: tof / DAY,
          dep_iso: new Date(dep * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString(),
          arr_iso: new Date((dep + tof) * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString(),
          dv_m_s: cell.dv,
          c3_m2_s2: cell.c3,
          vinf_arr_m_s: cell.vinf,
          revolutions: cell.revolutions ?? 0,
          backend: planOpts.backend || 'sample-de',
          refined: di !== 0 || dj !== 0,
          seed_dv_m_s: seed.dv_m_s,
        };
        if (!best || row.dv_m_s < best.dv_m_s) best = row;
      }
    }
    if (best) candidates.push(best);
    else if (Number.isFinite(seed.dv_m_s)) candidates.push({ ...seed, refined: false });
  }

  const ranked = rankShortlistScored(candidates, { topN, minDepDayGap: opts.minDepDayGap ?? 5 });
  return {
    shortlist: ranked,
    refined: true,
    nEvals,
    note: 'Neighborhood Lambert re-eval under planning ephemeris — not global optimum, not certified.',
  };
}
