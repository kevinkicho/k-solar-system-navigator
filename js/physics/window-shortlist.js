/**
 * Multi-candidate launch-window shortlist from a porkchop grid.
 * Ranks top-N cells by Δv (or C3) under the planning ephemeris backend.
 * Preliminary analysis — not a global mission optimizer.
 */
import { DAY } from '../constants.js';
import { evaluateCell } from './porkchop-grid.js';

/**
 * @param {Float64Array|number[]} data dv grid
 * @param {object} gridSpec
 * @param {object} body1
 * @param {object} body2
 * @param {object} [opts]
 * @param {number} [opts.topN=8]
 * @param {object} [opts.planOpts] backend opts for re-eval
 * @param {boolean} [opts.reevaluate=true] re-run Lambert with planOpts
 * @returns {Array<object>}
 */
export function buildWindowShortlist(data, gridSpec, body1, body2, opts = {}) {
  const topN = Math.max(1, Math.min(20, opts.topN ?? 8));
  const { nx, ny, departStart, departEnd, tofMin, tofMax } = gridSpec;
  const planOpts = opts.planOpts || { backend: 'approx' };
  const reevaluate = opts.reevaluate !== false;

  const cells = [];
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const idx = iy * nx + ix;
      const dv = data[idx];
      if (!Number.isFinite(dv)) continue;
      cells.push({ ix, iy, idx, dvGrid: dv });
    }
  }
  cells.sort((a, b) => a.dvGrid - b.dvGrid);
  const picked = cells.slice(0, Math.min(topN * 3, cells.length)); // oversample then re-rank

  const out = [];
  for (const c of picked) {
    const dep = departStart + ((c.ix + 0.5) / nx) * (departEnd - departStart);
    const tof = tofMin + ((c.iy + 0.5) / ny) * (tofMax - tofMin);
    let dv = c.dvGrid;
    let c3 = null;
    let vinf = null;
    let revolutions = 0;
    if (reevaluate && body1 && body2) {
      const cell = evaluateCell(body1, body2, dep, tof, planOpts);
      if (!cell) continue;
      dv = cell.dv;
      c3 = cell.c3;
      vinf = cell.vinf;
      revolutions = cell.revolutions ?? 0;
    }
    out.push({
      rank: 0,
      ix: c.ix,
      iy: c.iy,
      dep_sim: dep,
      tof_s: tof,
      tof_days: tof / DAY,
      dep_iso: new Date(dep * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString(),
      arr_iso: new Date((dep + tof) * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString(),
      dv_m_s: dv,
      c3_m2_s2: c3,
      vinf_arr_m_s: vinf,
      revolutions,
      backend: planOpts.backend || 'approx',
    });
  }
  out.sort((a, b) => a.dv_m_s - b.dv_m_s);
  const shortlist = out.slice(0, topN).map((row, i) => ({ ...row, rank: i + 1 }));
  return shortlist;
}

/**
 * Human-readable lines for UI.
 */
export function formatShortlistLines(shortlist) {
  return (shortlist || []).map((s) =>
    `#${s.rank}  ${String(s.dep_iso).slice(0, 10)}  TOF ${s.tof_days.toFixed(0)}d  `
    + `Δv ${(s.dv_m_s / 1000).toFixed(2)} km/s`
    + (s.c3_m2_s2 != null ? `  C3 ${(s.c3_m2_s2 / 1e6).toFixed(2)}` : '')
    + (s.revolutions ? `  N=${s.revolutions}` : ''),
  );
}
