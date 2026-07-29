// Trajectory Need calculator — Need / Capability / Margin triad (cargo design K1).
// Need describes required energy; it never carries cargo mass (K19).

import { state } from '../state.js';
import { computeMissionBudget } from './mission-budget.js';
import { v3mag, v3sub } from './vec3.js';
import { getPlanningVelocity3D } from './ephemeris-provider.js';
import { BODIES } from '../data/bodies.js';
import { lightTimeAlternateSketch } from './flight-ops.js';
import { planeChangeNeedAddon_m_s, planeChangeSketchForSite } from './launch-site-plane.js';

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
  // Planet-relative: Lambert is parent-centered; body-relative V∞ ≈ dv1.
  if (td.planetRelative) {
    const vInf = td.dv1_lambert;
    if (vInf == null || !isFinite(vInf)) return null;
    return vInf * vInf;
  }
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
    const helioMulti = td.dvTotalMultiLeg ?? Infinity;
    // Optional multi-leg mission Need: helio legs + terminal escape/capture sketch
    // when costBasis is mission or phase is multi_leg_mission.
    const wantMission = (opts.phase === 'multi_leg_mission')
      || (opts.costBasis ?? state.costBasis) === 'mission';
    let terminalDep = null;
    let terminalArr = null;
    let c3ml = null;
    let vInfDepMl = null;
    let vInfArrMl = null;
    if (wantMission && isFinite(helioMulti) && td.body1 && td.body2 && td.legs?.length) {
      try {
        // Build a synthetic single-leg-like shell for mission-budget terminals
        const L0 = td.legs[0];
        const L1 = td.legs[td.legs.length - 1];
        if (L0?.ok && L0.v1 && L1?.ok && L1.v2) {
          const shell = {
            body1: td.body1,
            body2: td.body2,
            lambertOk: true,
            v1_lambert: L0.v1,
            v2_lambert: L1.v2,
            departureSimTime: L0.departSimTime,
            arrivalSimTime: L1.arriveSimTime,
            ephemerisBackend: td.ephemerisBackend,
            classroomMode: td.classroomMode,
            surfaceOriginPoint: td.surfaceOriginPoint,
            surfaceDestPoint: td.surfaceDestPoint,
            planetRelative: false,
          };
          const budget = computeMissionBudget(shell);
          if (budget) {
            // Terminal parking/injection only (do not re-count heliocentric leg Δv)
            terminalDep = budget.departure?.total ?? null;
            terminalArr = budget.arrival?.total ?? null;
            vInfDepMl = budget.departure?.vInf ?? null;
            vInfArrMl = budget.arrival?.vInf ?? null;
            c3ml = vInfDepMl != null ? vInfDepMl * vInfDepMl : null;
          }
        }
      } catch { /* keep helio-only */ }
    }
    if (wantMission && terminalDep != null && terminalArr != null && isFinite(helioMulti)) {
      // Helio multi-leg already includes dep/arr hyperbolic burns vs planet vel;
      // mission_parking adds parking→escape and capture→parking. Avoid double-count
      // of V∞ by using (terminal parking totals − V∞ legs) ≈ parking overhead only.
      // Practical sketch: Need = helio multi + (dep parking overhead) + (arr parking overhead)
      // where overhead ≈ terminal - vInf when vInf known.
      const depOver = (vInfDepMl != null && terminalDep > vInfDepMl)
        ? terminalDep - vInfDepMl
        : 0;
      const arrOver = (vInfArrMl != null && terminalArr > vInfArrMl)
        ? terminalArr - vInfArrMl
        : 0;
      const aero = clampAero(opts.aeroassistFactor ?? state.aeroassistFactor ?? 0);
      const arrAdj = arrOver * (1 - aero);
      const need = helioMulti + depOver + arrAdj;
      return {
        phase: 'multi_leg_mission',
        multi_leg: true,
        need_dv_m_s: need,
        c3_m2_s2: c3ml,
        vinf_dep_m_s: vInfDepMl,
        vinf_arr_m_s: vInfArrMl,
        helio_legs_m_s: helioMulti,
        terminal_dep_overhead_m_s: depOver,
        terminal_arr_overhead_m_s: arrAdj,
        applicable: isFinite(need),
        aeroassist_factor: aero,
        reason: null,
        note: 'Multi-leg mission Need = heliocentric legs + terminal parking overhead (patched-conic sketch).',
      };
    }
    return {
      phase: 'helio_leg',
      multi_leg: true,
      need_dv_m_s: helioMulti,
      c3_m2_s2: null,
      vinf_dep_m_s: null,
      vinf_arr_m_s: null,
      applicable: isFinite(helioMulti),
      aeroassist_factor: 0,
      reason: isFinite(helioMulti) ? null : 'multi-leg incomplete',
      note: wantMission
        ? 'Multi-leg terminal parking unavailable — helio legs only.'
        : 'Multi-leg Need = heliocentric leg sum (set cost basis → Mission for terminal parking sketch).',
    };
  }

  const lambertOk = !!td.lambertOk;
  const helio = lambertOk ? td.dvTotal_lambert : td.dvTotal;
  const budget = lambertOk ? computeMissionBudget(td) : null;
  const c3 = computeDepartureC3(td);
  const vInfDep = budget?.departure?.vInf ?? null;
  const vInfArr = budget?.arrival?.vInf ?? null;

  // Educational plane-change sketch vs site DLA (Earth dep only)
  const dlaEq = opts.dla_eq_deg
    ?? td.dossier?.geometry?.dla_eq_deg
    ?? null;
  const siteId = opts.launchSiteId ?? state.launchSiteId ?? 'any';
  const planeSk = planeChangeSketchForSite(dlaEq, siteId);
  const planeAddon = (opts.includePlaneChange !== false && state.planeChangeNeedAddon !== false)
    ? planeChangeNeedAddon_m_s(td, siteId, dlaEq)
    : 0;

  if (phase === 'injection') {
    // Aeroassist is no-op on injection (departure only).
    const inj = budget ? budget.departure.total : null;
    const needDv = inj != null && isFinite(inj) ? inj + planeAddon : null;
    return {
      phase: 'injection',
      multi_leg: false,
      need_dv_m_s: needDv,
      c3_m2_s2: c3,
      vinf_dep_m_s: vInfDep,
      vinf_arr_m_s: vInfArr,
      plane_change_sketch: planeSk,
      plane_change_addon_m_s: planeAddon,
      applicable: needDv != null && isFinite(needDv),
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
    const total = dep + arr + planeAddon;
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
      plane_change_sketch: planeSk,
      plane_change_addon_m_s: planeAddon,
      applicable: true,
      aeroassist_factor: aero,
      reason: null,
    };
  }

  // helio_leg — optional plane-change addon for Earth dep educational honesty
  const helioNeed = isFinite(helio) ? helio + planeAddon : helio;
  const base = {
    phase: 'helio_leg',
    multi_leg: false,
    need_dv_m_s: helioNeed,
    c3_m2_s2: c3,
    vinf_dep_m_s: vInfDep,
    vinf_arr_m_s: vInfArr,
    plane_change_sketch: planeSk,
    plane_change_addon_m_s: planeAddon,
    applicable: isFinite(helioNeed),
    aeroassist_factor: 0,
    reason: isFinite(helio) ? null : 'helio Δv unavailable',
  };

  // Optional light-time compare (analysis only — does not replace geometric Need)
  if (opts.lightTimeCompare || state.lightTimeNeedCompare) {
    const lt = lightTimeAlternateSketch(td);
    if (lt) {
      base.light_time_compare = {
        ...lt,
        geometric_need_dv_m_s: helio,
        note: lt.note,
      };
    }
  }
  return base;
}

/** Scalar required Δv for UI paths that still need a number (K25-safe). */
export function needDeltaV(td, opts = {}) {
  const n = computeNeed(td, opts);
  if (!n.applicable || n.need_dv_m_s == null || !isFinite(n.need_dv_m_s)) return Infinity;
  return n.need_dv_m_s;
}
