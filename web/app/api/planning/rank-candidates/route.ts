import { NextRequest, NextResponse } from 'next/server';

/**
 * Headless multi-objective rank of user-supplied plan/window candidates.
 * Does NOT run Lambert — clients must supply dv_m_s / need. Preliminary only.
 *
 * POST { candidates: [...], topN?: number }
 */

type Cand = {
  rank?: number;
  dep_iso?: string;
  tof_days?: number;
  dv_m_s?: number;
  need_m_s?: number;
  c3_m2_s2?: number | null;
  revolutions?: number;
  feasible?: boolean;
  score?: number;
  [key: string]: unknown;
};

function scorePlanCandidate(c: Cand, tofMid: number | null): number {
  const dv = Number(c.dv_m_s ?? c.need_m_s);
  if (!Number.isFinite(dv)) return Infinity;
  let s = dv;
  const c3 = Number(c.c3_m2_s2);
  if (Number.isFinite(c3) && c3 > 0) s += 0.05 * Math.sqrt(c3);
  const tofD = Number(c.tof_days);
  if (Number.isFinite(tofD) && tofMid != null && tofMid > 0) {
    s += (80 * Math.abs(tofD - tofMid)) / tofMid;
  }
  if ((c.revolutions ?? 0) > 0) s += 150 * (c.revolutions ?? 0);
  if (c.feasible === false) s += 5000;
  return s;
}

function rankPlanCandidates(candidates: Cand[], topN = 10, minDepDayGap = 5) {
  const tofs = candidates.map((c) => Number(c.tof_days)).filter(Number.isFinite);
  const tofMid = tofs.length ? tofs.reduce((a, b) => a + b, 0) / tofs.length : null;
  const scored = candidates
    .map((c) => ({ ...c, score: scorePlanCandidate(c, tofMid) }))
    .filter((c) => Number.isFinite(c.score as number))
    .sort((a, b) => (a.score as number) - (b.score as number));

  const picked: Cand[] = [];
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
  return picked.map((c, i) => ({ ...c, rank: i + 1 }));
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const b = body as { candidates?: Cand[]; topN?: number };
  const candidates = Array.isArray(b.candidates) ? b.candidates : [];
  if (!candidates.length) {
    return NextResponse.json(
      { ok: false, error: 'candidates required', product_class: 'preliminary-not-flight-certified' },
      { status: 400 },
    );
  }
  if (candidates.length > 200) {
    return NextResponse.json({ ok: false, error: 'max 200 candidates' }, { status: 400 });
  }
  const topN = Math.max(1, Math.min(30, Number(b.topN) || 10));
  const ranked = rankPlanCandidates(candidates, topN);
  return NextResponse.json({
    ok: true,
    ranked,
    n_in: candidates.length,
    n_out: ranked.length,
    product_class: 'preliminary-not-flight-certified',
    note: 'Headless rank only — no Lambert recompute, not flight-certified.',
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/planning/rank-candidates',
    method: 'POST',
    body: { candidates: [{ dep_iso: '2031-01-01', tof_days: 200, dv_m_s: 6000 }], topN: 10 },
    product_class: 'preliminary-not-flight-certified',
  });
}
