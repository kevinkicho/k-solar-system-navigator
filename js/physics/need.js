// Trajectory Need calculator — Need / Capability / Margin triad (cargo design K1).
// Need describes required energy; it never carries cargo mass (K19).

import { state } from '../state.js';
import { computeMissionBudget } from './mission-budget.js';
import { v3mag, v3sub } from './vec3.js';
import { getPlanningVelocity3D } from './ephemeris-provider.js';
import { BODIES } from '../data/bodies.js';

const AERO_MIN = 0;
const AERO_MAX = 0.9;

/**
 * Resolve mission phase for Need (K18 + K25).
 * - multi-leg → helio_leg
 * - falcon9 → injection
 * - sh-starship unrefueled|tanker-n → injection
 * - legacy-demo / abstract / missing arch → costBasis (helio|mission)
 */
export function autoPhase(opts = {}) {
  const vehicleId = opts.vehicleId ?? state.vehicleId;
  const arch = opts.starshipArch ?? state.starshipArch ?? 'legacy-demo';
  const costBasis = opts.costBasis ?? state.costBasis ?? 'helio';
  const isMulti = !!opts.isMultiLeg;

  if (isMulti) return 'helio_leg';
  if (vehicleId === 'falcon9') return 'injection';
  if (vehicleId === 'sh-starship' && (arch === 'unrefueled' || arch === 'tanker-n')) {
    return 'injection';
  }
  // legacy-demo, abstract, chem-*, high-energy, or missing arch
  return costBasis === 'mission' ? 'mission_parking' : 'helio_leg';
}

function clampAero(f) {
  const x = Number(f);
  if (!isFinite(x)) return 0;
  return Math.max(AERO_MIN, Math.min(AERO_MAX, x));
}

function getSOIParent(body) {
  if (body?.parent) return BODIES.find((b) => b.name === body.parent) || body;
  return body;
}

/** Planning-velocity opts from transferData (L2-plan consistent). */
function planningOpts(td) {
  return {
    backend: td?.ephemerisBackend || 'approx',
    classroomMode: !!td?.classroomMode,
  };
}

/** C3 = |V∞_dep|² in m²/s² from Lambert solution (same vectors as mission-budget). */
export function computeDepartureC3(td) {
  if (!td?.lambertOk || !td.v1_lambert) return null;
  const origin = td.body1;
  const parent = getSOIParent(origin);
  const vParent = getPlanningVelocity3D(parent, td.departureSimTime, planningOpts(td));
  const vInf = v3sub(td.v1_lambert, vParent);
  const mag = v3mag(vInf);
  return mag * mag;
}

/**
 * @param {object} td transferData
 * @param {object} [opts]
 * @param {'helio_leg'|'mission_parking'|'injection'} [opts.phase]
 * @param {number} [opts.aeroassistFactor] 0–0.9, applied only to arrival capture on mission_parking
 */
export function computeNeed(td, opts = {}) {
  if (!td) {
    return {
      phase: 'helio_leg',
      multi_leg: false,
      need_dv_m_s: Infinity,
      c3_m2_s2: null,
      vinf_dep_m_s: null,
      vinf_arr_m_s: null,
      applicable: false,
      reason: 'no transferData',
    };
  }

  const isMulti = !!td.isMultiLeg;
  const phase = opts.phase || autoPhase({
    vehicleId: opts.vehicleId,
    starshipArch: opts.starshipArch,
    costBasis: opts.costBasis,
    isMultiLeg: isMulti,
  });
  const aero = clampAero(opts.aeroassistFactor ?? state.aeroassistFactor ?? 0);

  if (isMulti) {
    return {
      phase: 'helio_leg',
      multi_leg: true,
      need_dv_m_s: td.dvTotalMultiLeg ?? Infinity,
      c3_m2_s2: null,
      vinf_dep_m_s: null,
      vinf_arr_m_s: null,
      applicable: isFinite(td.dvTotalMultiLeg),
      aeroassist_factor: 0,
      reason: isFinite(td.dvTotalMultiLeg) ? null : 'multi-leg incomplete',
    };
  }

  const lambertOk = !!td.lambertOk;
  const helio = lambertOk ? td.dvTotal_lambert : td.dvTotal;
  const budget = lambertOk ? computeMissionBudget(td) : null;
  const c3 = computeDepartureC3(td);
  const vInfDep = budget?.departure?.vInf ?? null;
  const vInfArr = budget?.arrival?.vInf ?? null;

  if (phase === 'injection') {
    // Aeroassist is no-op on injection (departure only).
    const inj = budget ? budget.departure.total : null;
    return {
      phase: 'injection',
      multi_leg: false,
      need_dv_m_s: inj != null && isFinite(inj) ? inj : null,
      c3_m2_s2: c3,
      vinf_dep_m_s: vInfDep,
      vinf_arr_m_s: vInfArr,
      applicable: inj != null && isFinite(inj),
      aeroassist_factor: 0,
      reason: inj == null ? 'injection requires Lambert-ok mission budget' : null,
    };
  }

  if (phase === 'mission_parking') {
    if (!budget) {
      return {
        phase: 'mission_parking',
        multi_leg: false,
        need_dv_m_s: null,
        c3_m2_s2: c3,
        vinf_dep_m_s: null,
        vinf_arr_m_s: null,
        applicable: false,
        aeroassist_factor: aero,
        reason: 'mission parking requires Lambert-ok budget',
      };
    }
    // Apply aeroassist only to arrival capture contribution (K11).
    const dep = budget.departure.total;
    const arr = budget.arrival.total * (1 - aero);
    const total = dep + arr;
    return {
      phase: 'mission_parking',
      multi_leg: false,
      need_dv_m_s: total,
      c3_m2_s2: c3,
      vinf_dep_m_s: vInfDep,
      vinf_arr_m_s: vInfArr,
      departure_dv_m_s: dep,
      arrival_dv_m_s: arr,
      arrival_dv_raw_m_s: budget.arrival.total,
      applicable: true,
      aeroassist_factor: aero,
      reason: null,
    };
  }

  // helio_leg
  return {
    phase: 'helio_leg',
    multi_leg: false,
    need_dv_m_s: helio,
    c3_m2_s2: c3,
    vinf_dep_m_s: vInfDep,
    vinf_arr_m_s: vInfArr,
    applicable: isFinite(helio),
    aeroassist_factor: 0,
    reason: isFinite(helio) ? null : 'helio Δv unavailable',
  };
}

/** Scalar required Δv for UI paths that still need a number (K25-safe). */
export function needDeltaV(td, opts = {}) {
  const n = computeNeed(td, opts);
  if (!n.applicable || n.need_dv_m_s == null || !isFinite(n.need_dv_m_s)) return Infinity;
  return n.need_dv_m_s;
}
