import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side window shortlist stub for App Hosting.
 * Full Lambert grid remains client-side (Workers); this endpoint accepts a
 * client-computed shortlist for validation / future Cloud persistence.
 *
 * POST body: { origin, dest, candidates: [{ dep_iso, tof_days, dv_m_s, c3? }] }
 */
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
    candidates?: Array<Record<string, unknown>>;
    fidelity?: string;
  };

  const candidates = Array.isArray(b.candidates) ? b.candidates.slice(0, 20) : [];
  if (!b.origin || !b.dest || candidates.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'need origin, dest, candidates[]' },
      { status: 400 },
    );
  }

  // Rank by dv_m_s when present
  const ranked = [...candidates].sort((a, c) => {
    const da = Number(a.dv_m_s);
    const db = Number(c.dv_m_s);
    if (!Number.isFinite(da)) return 1;
    if (!Number.isFinite(db)) return -1;
    return da - db;
  });

  return NextResponse.json({
    ok: true,
    origin: b.origin,
    dest: b.dest,
    fidelity: b.fidelity || 'client',
    n: ranked.length,
    shortlist: ranked.slice(0, 10),
    product_class: 'preliminary-not-flight-certified',
    note: 'Server ranked client candidates — not a global mission optimizer; not range safety.',
    stored: false,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/planning/window-shortlist',
    method: 'POST',
    usage: 'Send client-computed window candidates for server ranking / future RTDB store.',
  });
}
