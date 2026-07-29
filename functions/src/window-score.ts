/**
 * Server-side multi-objective window scoring (mirrors client window-refine score).
 * Educational — not a global mission optimizer.
 */

export type WindowCandidate = {
  rank?: number;
  dep_iso?: string;
  tof_days?: number;
  dv_m_s?: number;
  c3_m2_s2?: number | null;
  revolutions?: number;
  dep_sim?: number;
  score?: number;
  [key: string]: unknown;
};

export function scoreWindowCandidate(
  c: WindowCandidate,
  ctx: {toFMidDays?: number | null} = {},
): number {
  const dv = Number(c.dv_m_s);
  if (!Number.isFinite(dv)) return Infinity;
  let s = dv;
  const c3 = Number(c.c3_m2_s2);
  if (Number.isFinite(c3) && c3 > 0) {
    s += 0.05 * Math.sqrt(c3);
  }
  const tofD = Number(c.tof_days);
  const mid = ctx.toFMidDays;
  if (Number.isFinite(tofD) && mid != null && Number.isFinite(mid) && mid > 0) {
    s += 80 * Math.abs(tofD - mid) / mid;
  }
  if ((c.revolutions ?? 0) > 0) s += 150 * (c.revolutions ?? 0);
  return s;
}

/**
 * Re-rank with score + soft departure-day diversity.
 */
export function rankShortlistScored(
  shortlist: WindowCandidate[],
  opts: {topN?: number; minDepDayGap?: number} = {},
): WindowCandidate[] {
  const topN = Math.max(1, Math.min(20, opts.topN ?? 12));
  const minGap = Math.max(0, opts.minDepDayGap ?? 5);
  const tofs = shortlist
    .map((c) => Number(c.tof_days))
    .filter((x) => Number.isFinite(x));
  const tofMid = tofs.length
    ? tofs.reduce((a, b) => a + b, 0) / tofs.length
    : null;

  const scored = shortlist
    .map((c) => ({
      ...c,
      score: scoreWindowCandidate(c, {toFMidDays: tofMid}),
    }))
    .filter((c) => Number.isFinite(c.score as number))
    .sort((a, b) => (a.score as number) - (b.score as number));

  const picked: WindowCandidate[] = [];
  for (const c of scored) {
    if (picked.length >= topN) break;
    const depDay = c.dep_iso ? Date.parse(String(c.dep_iso)) / 86400000 : null;
    if (minGap > 0 && depDay != null && Number.isFinite(depDay)) {
      const clash = picked.some((p) => {
        const pd = p.dep_iso ? Date.parse(String(p.dep_iso)) / 86400000 : null;
        return pd != null && Math.abs(pd - depDay) < minGap;
      });
      if (clash && picked.length >= 2) continue;
    }
    picked.push(c);
  }
  if (picked.length < topN) {
    for (const c of scored) {
      if (picked.length >= topN) break;
      if (!picked.includes(c)) picked.push(c);
    }
  }
  return picked.map((c, i) => ({...c, rank: i + 1}));
}
