/**
 * Pareto-ish ranking for window shortlist (Need vs TOF local non-dominated set).
 * Not a global optimizer.
 */

/**
 * @param {Array<object>} shortlist cells with dv_m_s, tof_days
 * @returns {{ pareto: object[], dominated: object[], note: string }}
 */
export function paretoWindowShortlist(shortlist) {
  const rows = (Array.isArray(shortlist) ? shortlist : [])
    .filter((c) => Number.isFinite(c.dv_m_s) && Number.isFinite(c.tof_days))
    .map((c, i) => ({ ...c, _i: i }));
  if (!rows.length) {
    return {
      pareto: [],
      dominated: [],
      product_class: 'preliminary-not-flight-certified',
      note: 'Empty shortlist — run porkchop first.',
    };
  }

  const pareto = [];
  const dominated = [];
  for (const a of rows) {
    const isDom = rows.some((b) =>
      b !== a
      && b.dv_m_s <= a.dv_m_s
      && b.tof_days <= a.tof_days
      && (b.dv_m_s < a.dv_m_s || b.tof_days < a.tof_days));
    if (isDom) dominated.push(a);
    else pareto.push(a);
  }
  pareto.sort((a, b) => a.dv_m_s - b.dv_m_s || a.tof_days - b.tof_days);
  return {
    pareto: pareto.map((c, i) => ({ ...c, pareto_rank: i + 1 })),
    dominated,
    n_pareto: pareto.length,
    n_total: rows.length,
    product_class: 'preliminary-not-flight-certified',
    note: 'Local non-dominated set on (Need, TOF) from shortlist only — not global tour optimum.',
  };
}
