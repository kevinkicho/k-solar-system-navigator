// Starship + Super Heavy architecture modes (cargo design K5/K21).
// Educational / concept-grade — not SpaceX performance.

import { VEHICLE_SPECS, starshipDeltaV } from './vehicles.js';

const G0 = 9.80665;

/** Full LEO propellant load for unrefueled mode (kg). */
export const SS_PROP_LEO_KG = 1_200_000;
/** Tanker-n baseline prop before tankers (kg). */
export const SS_PROP_BASE_KG = 0;
/** Propellant delivered per tanker (kg). */
export const M_TANKER_DELIVER_KG = 100_000;
/** Cap on propellant (kg). */
export const SS_PROP_MAX_KG = SS_PROP_LEO_KG;
/** Max tankers. */
export const MAX_TANKERS = 20;

export const SS_DISCLAIMER =
  'Illustrative Starship architecture model (rocket equation + tanker quanta) — not SpaceX performance guarantee or flight design.';

function isp() {
  return VEHICLE_SPECS.starship.isp;
}
function dryMass() {
  return VEHICLE_SPECS.starship.dryMass;
}

/**
 * Propellant mass for architecture (kg).
 * unrefueled: full LEO tanks (K21).
 * tanker-n: base + N×delivery, capped.
 */
export function propellantForArch(arch, tankerCount = 0) {
  if (arch === 'unrefueled') return SS_PROP_LEO_KG;
  if (arch === 'tanker-n') {
    const n = Math.max(0, Math.min(MAX_TANKERS, Math.floor(Number(tankerCount) || 0)));
    return Math.min(SS_PROP_MAX_KG, SS_PROP_BASE_KG + n * M_TANKER_DELIVER_KG);
  }
  return 0; // legacy uses SH budget elsewhere
}

/**
 * Available Starship Δv (m/s) with cargo mass competing for propellant budget.
 * m0 = dry + prop + cargo; mf = dry + cargo.
 */
export function starshipCapabilityDv(cargoMass_kg, arch, tankerCount = 0) {
  const cargo = Math.max(0, Number(cargoMass_kg) || 0);
  const prop = propellantForArch(arch, tankerCount);
  if (prop <= 0) return 0;
  const dry = dryMass();
  const m0 = dry + prop + cargo;
  const mf = dry + cargo;
  if (mf <= 0 || m0 <= mf) return 0;
  return isp() * G0 * Math.log(m0 / mf);
}

/**
 * Max cargo (kg) such that capability_dv >= need_dv.
 * Binary search; returns 0 if need exceeds zero-cargo capability.
 */
export function maxCargoForNeed(need_dv_m_s, arch, tankerCount = 0) {
  if (need_dv_m_s == null || !isFinite(need_dv_m_s) || need_dv_m_s < 0) return null;
  const zeroCargo = starshipCapabilityDv(0, arch, tankerCount);
  if (zeroCargo < need_dv_m_s) return 0;

  let lo = 0, hi = 500_000;
  // Expand hi if needed
  while (starshipCapabilityDv(hi, arch, tankerCount) >= need_dv_m_s && hi < 5e6) hi *= 2;
  for (let i = 0; i < 50; i++) {
    const mid = 0.5 * (lo + hi);
    if (starshipCapabilityDv(mid, arch, tankerCount) >= need_dv_m_s) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Minimum tankers N such that capability at cargo meets need.
 * Returns null if impossible within MAX_TANKERS.
 */
export function minTankersForNeed(need_dv_m_s, cargoMass_kg) {
  if (need_dv_m_s == null || !isFinite(need_dv_m_s)) return null;
  for (let n = 0; n <= MAX_TANKERS; n++) {
    if (starshipCapabilityDv(cargoMass_kg, 'tanker-n', n) >= need_dv_m_s) return n;
  }
  return null;
}

/** Sanity: zero-cargo unrefueled matches starshipDeltaV(). */
export function unrefueledZeroCargoDv() {
  return starshipCapabilityDv(0, 'unrefueled', 0);
}

export { starshipDeltaV };
