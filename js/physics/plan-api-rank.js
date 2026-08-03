/**
 * Headless plan / shortlist ranking helpers (shared client + server API).
 * Does not run Lambert — ranks provided candidates only.
 * Preliminary analysis — not flight-certified.
 */

/**
 * Multi-objective score for window/plan candidates (mirrors App Hosting shortlist).
 */
export function scorePlanCandidate(c, tofMid = null) {
  const dv = Number(c.dv_m_s ?? c.need_m_s);
  if (!Number.isFinite(dv)) return Infinity;
  let s = dv;
  const c3 = Number(c.c3_m2_s2);
  if (Number.isFinite(c3) && c3 > 0) s += 0.05 * Math.sqrt(c3);
  const tofD = Number(c.tof_days);
  if (Number.isFinite(tofD) && tofMid != null && tofMid > 0) {
    s += 80 * Math.abs(tofD - tofMid) / tofMid;
  }
  if ((c.revolutions ?? 0) > 0) s += 150 * (c.revolutions ?? 0);
  if (c.feasible === false) s += 5000;
  return s;
}

/**
 * Rank candidates for headless API / studio.
 * @param {object[]} candidates
 * @param {{ topN?: number, minDepDayGap?: number }} [opts]
 */
export function rankPlanCandidates(candidates, opts = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const topN = Math.max(1, Math.min(30, opts.topN ?? 10));
  const minDepDayGap = opts.minDepDayGap ?? 5;
  const tofs = list.map((c) => Number(c.tof_days)).filter(Number.isFinite);
  const tofMid = tofs.length ? tofs.reduce((a, b) => a + b, 0) / tofs.length : null;

  const scored = list
    .map((c) => ({ ...c, score: scorePlanCandidate(c, tofMid) }))
    .filter((c) => Number.isFinite(c.score))
    .sort((a, b) => a.score - b.score);

  const picked = [];
  for (const c of scored) {
    if (picked.length >= topN) break;
    const depDay = c.dep_iso ? Date.parse(String(c.dep_iso)) / 86400000 : null;
    if (minDepDayGap > 0 && depDay != null && Number.isFinite(depDay)) {
      const clash = picked.some((p) => {
        const pd = p.dep_iso ? Date.parse(String(p.dep_iso)) / 86400000 : null;
        return pd != null && Math.abs(pd - depDay) < minDepDayGap;
      });
      if (clash && picked.length >= 2) continue;
    }
    picked.push(c);
  }
  for (const c of scored) {
    if (picked.length >= topN) break;
    if (!picked.includes(c)) picked.push(c);
  }

  return {
    ok: true,
    ranked: picked.map((c, i) => ({ ...c, rank: i + 1 })),
    n_in: list.length,
    n_out: picked.length,
    product_class: 'preliminary-not-flight-certified',
    note: 'Headless rank of provided candidates only — no Lambert recompute, not flight-certified.',
  };
}
