/**
 * Deep-space maneuver (DSM) nodes — educational patched-conic add-on budget.
 * Does NOT re-solve Lambert; sums user DSM Δv into a mission Need sketch.
 * Not a global tour optimizer; not flight-certified.
 */

/**
 * @typedef {{ id: string, label?: string, epoch_frac?: number, dv_m_s: number, note?: string }} DsmNode
 */

/**
 * Validate and normalize DSM list.
 * @param {DsmNode[]} nodes
 * @returns {DsmNode[]}
 */
export function normalizeDsmNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map((n, i) => ({
      id: String(n.id || `dsm-${i}`),
      label: n.label || `DSM ${i + 1}`,
      epoch_frac: clamp01(n.epoch_frac != null ? Number(n.epoch_frac) : (i + 1) / (nodes.length + 1)),
      dv_m_s: Math.max(0, Number(n.dv_m_s) || 0),
      note: n.note || null,
    }))
    .filter((n) => n.dv_m_s > 0 || n.note);
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0.5;
  return Math.min(1, Math.max(0, x));
}

/**
 * Sum DSM Δv (m/s).
 */
export function sumDsmDv_m_s(nodes) {
  return normalizeDsmNodes(nodes).reduce((s, n) => s + (n.dv_m_s || 0), 0);
}

/**
 * Build Need sketch: Lambert need + DSM sum.
 * Analysis sketch only — does not mutate transferData.
 * @param {number|null} lambertNeed_m_s
 * @param {DsmNode[]} nodes
 */
export function needWithDsmSketch(lambertNeed_m_s, nodes) {
  const dsm = sumDsmDv_m_s(nodes);
  const base = Number.isFinite(lambertNeed_m_s) ? lambertNeed_m_s : null;
  return {
    lambert_need_m_s: base,
    dsm_total_m_s: dsm,
    combined_need_m_s: base != null ? base + dsm : null,
    nodes: normalizeDsmNodes(nodes),
    product_class: 'preliminary-not-flight-certified',
    note: 'DSM add-on is an educational Need sketch — not re-optimized Lambert legs, not flight-certified.',
  };
}

/**
 * Suggest a single mid-course DSM seed (placeholder magnitude from residual class).
 */
export function suggestMidcourseDsmSeed(opts = {}) {
  const frac = opts.epoch_frac ?? 0.45;
  const dv = opts.dv_m_s ?? 50; // m/s class placeholder — user edits
  return normalizeDsmNodes([{
    id: 'dsm-mid',
    label: 'Mid-course DSM (seed)',
    epoch_frac: frac,
    dv_m_s: dv,
    note: 'User-editable seed · not optimized',
  }]);
}
