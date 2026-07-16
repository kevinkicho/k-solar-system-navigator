/**
 * Shared Need / budget helpers for route UI + mission plan export.
 */
import { getTransferBudget } from '../physics/vehicles.js';
import { state } from '../state.js';
import { computeNeed, needDeltaV, autoPhase } from '../physics/need.js';

/** Required Δv via Need calculator (K18/K25-safe). */
export function requiredDeltaV(td) {
  if (!td) return Infinity;
  return needDeltaV(td, {
    vehicleId: state.vehicleId,
    starshipArch: state.starshipArch ?? 'legacy-demo',
    costBasis: state.costBasis,
    aeroassistFactor: state.aeroassistFactor ?? 0,
  });
}

export function transferBudgetNow() {
  return getTransferBudget(state.vehicleId, state.abstractBudget_m_s, {
    starshipArch: state.starshipArch ?? 'legacy-demo',
    cargoMass_kg: state.cargoMass_kg ?? 0,
    tankerCount: state.tankerCount ?? 0,
  });
}

/** Full Need object for Measurement Card / export. */
export function computeNeedNow(td) {
  return computeNeed(td, {
    vehicleId: state.vehicleId,
    starshipArch: state.starshipArch ?? 'legacy-demo',
    costBasis: state.costBasis,
    aeroassistFactor: state.aeroassistFactor ?? 0,
  });
}

export { autoPhase, computeNeed, needDeltaV };
