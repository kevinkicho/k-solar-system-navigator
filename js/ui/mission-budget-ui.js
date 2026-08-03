/**
 * Shared Need / budget helpers for route UI + mission plan export.
 * Need always receives asymptote DLA when Lambert is solved so site
 * plane-change sketches are factually tied to the transfer.
 */
import { getTransferBudget } from '../physics/vehicles.js';
import { state } from '../state.js';
import { computeNeed, needDeltaV, autoPhase } from '../physics/need.js';
import { needOptsFromTransfer } from '../physics/need-geometry.js';

function baseNeedOpts() {
  return {
    vehicleId: state.vehicleId,
    starshipArch: state.starshipArch ?? 'unrefueled',
    costBasis: state.costBasis,
    aeroassistFactor: state.aeroassistFactor ?? 0,
    launchSiteId: state.launchSiteId || 'any',
    lightTimeCompare: !!state.lightTimeNeedCompare,
  };
}

/** Required Δv via Need calculator (K18/K25-safe). */
export function requiredDeltaV(td) {
  if (!td) return Infinity;
  return needDeltaV(td, needOptsFromTransfer(td, baseNeedOpts()));
}

export function transferBudgetNow() {
  return getTransferBudget(state.vehicleId, state.abstractBudget_m_s, {
    starshipArch: state.starshipArch ?? 'unrefueled',
    cargoMass_kg: state.cargoMass_kg ?? 0,
    tankerCount: state.tankerCount ?? 0,
  });
}

/** Full Need object for Measurement Card / export. */
export function computeNeedNow(td) {
  return computeNeed(td, needOptsFromTransfer(td, baseNeedOpts()));
}

export { autoPhase, computeNeed, needDeltaV };
