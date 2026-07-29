import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side window shortlist scoring for App Hosting.
 * Mirrors Cloud Function multi-objective rank (Δv + mild C3 + TOF mid + diversity).
 * Full Lambert recompute stays client-side (Workers + neighborhood refine).
 *
 * POST body: { origin, dest, candidates: [{ dep_iso, tof_days, dv_m_s, c3? }] }
 */

type Cand = {
  rank?: number;
  dep_iso?: string;
  tof_days?: number;
  dv_m_s?: number;
  c3_m2_s2?: number | null;
  revolutions?: number;
  score?: number;
  [key: string]: unknown;
};

function scoreWindowCandidate(c: Cand, tofMid: number | null): number {
  const dv = Number(c.dv_m_s);
  if (!Number.isFinite(dv)) return Infinity;
  let s = dv;
  const c3 = Number(c.c3_m2_s2);
  if (Number.isFinite(c3) && c3 > 0) s += 0.05 * Math.sqrt(c3);
  const tofD = Number(c.tof_days);
  if (Number.isFinite(tofD) && tofMid != null && tofMid > 0) {
    s += 80 * Math.abs(tofD - tofMid) / tofMid;
  }
  if ((c.revolutions ?? 0) > 0) s += 150 * (c.revolutions ?? 0);
  return s;
}

function rankScored(candidates: Cand[], topN = 10, minDepDayGap = 5): Cand[] {
  const tofs = candidates.map((c) => Number(c.tof_days)).filter(Number.isFinite);
  const tofMid = tofs.length ? tofs.reduce((a, b) => a + b, 0) / tofs.length : null;
  const scored = candidates
    .map((c) => ({ ...c, score: scoreWindowCandidate(c, tofMid) }))
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
  if (picked.length < topN) {
    for (const c of scored) {
      if (picked.length >= topN) break;
      if (!picked.includes(c)) picked.push(c);
    }
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

  const b = body as {
    origin?: string;
    dest?: string;
    candidates?: Cand[];
    fidelity?: string;
    topN?: number;
  };

  const candidates = Array.isArray(b.candidates) ? b.candidates.slice(0, 24) : [];
  if (!b.origin || !b.dest || candidates.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'need origin, dest, candidates[]' },
      { status: 400 },
    );
  }

  const ranked = rankScored(candidates, b.topN ?? 10, 5);

  return NextResponse.json({
    ok: true,
    origin: b.origin,
    dest: b.dest,
    fidelity: b.fidelity || 'client',
    n: ranked.length,
    shortlist: ranked,
    refine_mode: 'multi-objective-score+diversity',
    product_class: 'preliminary-not-flight-certified',
    note:
      'Server scored client candidates — neighborhood Lambert refine is client-side; not range safety.',
    stored: false,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/planning/window-shortlist',
    method: 'POST',
    usage:
      'Send client-computed (optionally neighborhood-refined) window candidates for multi-objective server ranking.',
    refine_mode: 'multi-objective-score+diversity',
  });
}
