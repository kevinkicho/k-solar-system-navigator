/**
 * Need stack waterfall — ascent class + Lambert inject + DSM + optional capture sketch.
 * Educational separation of budgets; Lambert Need remains the planning authority
 * unless the UI explicitly labels a "combined stack" view.
 */

import { estimateAscentLossForVehicle } from './ascent-loss-model.js';
import { sumDsmDv_m_s, normalizeDsmNodes } from './dsm-nodes.js';

/**
 * @param {object} opts
 * @param {object|null} opts.need dossier need or { need_dv_m_s }
 * @param {string} [opts.vehicleId]
 * @param {number} [opts.ascentBudget_m_s] optional override (state.ascentLossBudget_m_s)
 * @param {Array} [opts.dsmNodes]
 * @param {number|null} [opts.captureBudget_m_s] optional arrival capture class (user sketch)
 * @param {number|null} [opts.planeChange_m_s] optional site plane-change sketch already in Need
 */
export function buildNeedWaterfall(opts = {}) {
  const needDv = opts.need?.need_dv_m_s ?? opts.need?.need ?? null;
  const vehicleId = opts.vehicleId || 'sh-starship';
  const ascentEst = estimateAscentLossForVehicle(vehicleId);
  const ascentOverride = opts.ascentBudget_m_s != null && Number(opts.ascentBudget_m_s) > 0
    ? Number(opts.ascentBudget_m_s)
    : null;
  const ascent_m_s = ascentOverride ?? ascentEst.total_m_s;
  const dsmNodes = normalizeDsmNodes(opts.dsmNodes || []);
  const dsm_m_s = sumDsmDv_m_s(dsmNodes);
  const capture_m_s = Number.isFinite(opts.captureBudget_m_s) ? Math.max(0, opts.captureBudget_m_s) : 0;
  const plane_m_s = Number.isFinite(opts.planeChange_m_s) ? Math.max(0, opts.planeChange_m_s) : 0;

  // Lambert Need is already "injection / transfer" class; plane may be mixed into need by product flag
  const lambert_m_s = needDv != null && isFinite(needDv) ? needDv : null;

  const rows = [
    {
      id: 'ascent',
      label: 'Ascent loss class (LEO-class sketch)',
      dv_m_s: ascent_m_s,
      in_lambert_need: false,
      note: ascentEst.disclaimer,
    },
    {
      id: 'lambert',
      label: 'Lambert / multi-leg Need (planning authority)',
      dv_m_s: lambert_m_s,
      in_lambert_need: true,
      note: 'Authoritative for Capability/Margin / dossier gates',
    },
    {
      id: 'plane',
      label: 'Site plane-change sketch',
      dv_m_s: plane_m_s || null,
      in_lambert_need: plane_m_s > 0,
      note: plane_m_s > 0
        ? 'May already be included in Need when planeChangeNeedAddon is on'
        : 'None / site any',
    },
    {
      id: 'dsm',
      label: 'DSM midcourse sketch',
      dv_m_s: dsm_m_s || null,
      in_lambert_need: false,
      note: 'Educational add-on — not re-optimized Lambert',
    },
    {
      id: 'capture',
      label: 'Arrival capture class (optional sketch)',
      dv_m_s: capture_m_s || null,
      in_lambert_need: false,
      note: 'User sketch — not aeroassist / EDL design',
    },
  ];

  const stack_outside_lambert = ascent_m_s + dsm_m_s + capture_m_s;
  const combined_if_stack =
    lambert_m_s != null ? lambert_m_s + dsm_m_s + capture_m_s + (ascentOverride != null ? ascent_m_s : 0) : null;

  return {
    rows,
    lambert_need_m_s: lambert_m_s,
    stack_outside_lambert_m_s: stack_outside_lambert,
    /** Combined educational stack — NOT used by dossier unless user opts in later */
    combined_stack_m_s: combined_if_stack,
    ascent: ascentEst,
    dsm_nodes: dsmNodes,
    product_class: 'preliminary-not-flight-certified',
    note: 'Waterfall separates educational budgets. Dossier Capability/Margin uses Lambert Need (and documented plane addon), not full stack, unless labeled otherwise.',
    generated_at: new Date().toISOString(),
  };
}
