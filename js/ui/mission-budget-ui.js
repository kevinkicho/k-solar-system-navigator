/**
 * Shared Δv budget helpers for route UI + mission plan export.
 * Kept separate so mission-export can import without a route-display cycle.
 */
import { getTransferBudget } from '../physics/vehicles.js';
import { state } from '../state.js';
import { computeMissionBudget } from '../physics/mission-budget.js';

/** Required Δv for feasibility under selected cost basis (design K6). */
export function requiredDeltaV(td) {
  if (!td) return Infinity;
  if (td.isMultiLeg) {
    // Mission parking budget is single-leg only.
    return td.dvTotalMultiLeg ?? Infinity;
  }
  const lambertOk = !!td.lambertOk;
  const helio = lambertOk ? td.dvTotal_lambert : td.dvTotal;
  if (state.costBasis === 'mission' && lambertOk) {
    const budget = computeMissionBudget(td);
    if (budget) return budget.totalMission;
  }
  return helio;
}

export function transferBudgetNow() {
  return getTransferBudget(state.vehicleId, state.abstractBudget_m_s);
}
