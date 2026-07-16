// Vehicle / Δv capability for trip-planning (cargo-aware platform).
// Educational / concept-grade — not SpaceX performance.

import {
  falcon9MaxPayloadKg, falcon9EarthDepartureOnly, F9_DISCLAIMER, F9_ASDS_DERATE,
} from '../data/falcon9-c3-table.js';
import {
  starshipCapabilityDv, maxCargoForNeed, minTankersForNeed,
  SS_DISCLAIMER, MAX_TANKERS, unrefueledZeroCargoDv,
} from './starship-architecture.js';

export const VEHICLE_SPECS = {
  superHeavy: {
    name: 'Super Heavy Booster',
    dryMass: 200000,
    propellantMass: 3400000,
    thrust: 74400000,
    isp: 327,
    numEngines: 33,
    burnDurationMax: 180,
  },
  // Starship: used for architecture modes (unrefueled / tanker-n).
  starship: {
    name: 'Starship',
    dryMass: 120000,
    propellantMass: 1200000,
    thrust: 13536000,
    isp: 350,
    numEngines: 6,
  },
  combined: { name: 'Super Heavy + Starship Stack' },
};

const G0 = 9.80665;

/** Super Heavy Δv with fully-loaded Starship as payload (m/s). Golden ≈ 3766.67. */
export function superHeavyDeltaV() {
  const sh = VEHICLE_SPECS.superHeavy, ss = VEHICLE_SPECS.starship;
  const m0 = sh.dryMass + sh.propellantMass + ss.dryMass + ss.propellantMass;
  const mf = sh.dryMass + ss.dryMass + ss.propellantMass;
  return sh.isp * G0 * Math.log(m0 / mf);
}

export function starshipDeltaV() {
  const ss = VEHICLE_SPECS.starship;
  return ss.isp * G0 * Math.log((ss.dryMass + ss.propellantMass) / ss.dryMass);
}

export function usableStarshipPropellant() { return 0; }
export function totalMissionDeltaV() { return superHeavyDeltaV() + starshipDeltaV(); }
export function reservedDeltaV() { return starshipDeltaV(); }
/** @deprecated Prefer evaluateCapability — kept for SH legacy. */
export function transferDeltaV() { return superHeavyDeltaV(); }

/**
 * Vehicle presets (ids stable for share codec).
 */
export const VEHICLE_PRESETS = [
  {
    id: 'sh-starship',
    name: 'Super Heavy + Starship (legacy demo)',
    transferDv_m_s: 'rocket-eq',
    disclaimer:
      'LEGACY DEMO: Super Heavy Δv only with fully loaded Starship as payload; Starship propellant reserved. Illustrative — not SpaceX performance guarantee or a cargo architecture.',
  },
  {
    id: 'falcon9',
    name: 'Falcon 9 (illustrative C3 table)',
    transferDv_m_s: 'c3-table',
    disclaimer: F9_DISCLAIMER,
  },
  {
    id: 'abstract',
    name: 'Abstract Δv budget',
    transferDv_m_s: 'user',
    disclaimer: 'User-defined budget for comparison only.',
  },
  {
    id: 'chem-medium',
    name: 'Chemical medium (abstract)',
    transferDv_m_s: 6000,
    disclaimer: 'Abstract class budget — not a flight performance estimate.',
  },
  {
    id: 'fh-class',
    name: 'Heavy-lift chemical (abstract)',
    transferDv_m_s: 9000,
    disclaimer: 'Abstract class budget — not Falcon Heavy or any specific vehicle.',
  },
  {
    id: 'high-energy',
    name: 'High-energy / advanced (abstract)',
    transferDv_m_s: 15000,
    disclaimer: 'Abstract advanced-propulsion placeholder — not nuclear/EP sizing.',
  },
];

export function getPreset(id) {
  return VEHICLE_PRESETS.find((p) => p.id === id) || VEHICLE_PRESETS[0];
}

/**
 * Usable transfer Δv for abstract/legacy paths.
 * For sh-starship, threads arch: legacy-demo → SH Δv; unrefueled/tanker → Starship cap Δv at cargo.
 */
export function getTransferBudget(vehicleId, abstractBudget_m_s = 8000, opts = {}) {
  const p = getPreset(vehicleId);
  if (vehicleId === 'falcon9') return null; // mass-primary; use evaluateCapability
  if (p.transferDv_m_s === 'rocket-eq') {
    const arch = opts.starshipArch || 'legacy-demo';
    if (arch === 'legacy-demo') return superHeavyDeltaV();
    return starshipCapabilityDv(opts.cargoMass_kg || 0, arch, opts.tankerCount || 0);
  }
  if (p.transferDv_m_s === 'user') {
    const v = Number(abstractBudget_m_s);
    if (!isFinite(v)) return 8000;
    return Math.max(500, Math.min(50000, v));
  }
  if (p.transferDv_m_s === 'c3-table') return null;
  return p.transferDv_m_s;
}

export function presetDisplayName(vehicleId) {
  return getPreset(vehicleId).name;
}

export function presetDisclaimer(vehicleId) {
  return getPreset(vehicleId).disclaimer;
}

/**
 * Capability evaluation (K1).
 * @param {object} need from computeNeed
 * @param {object} request { vehicleId, cargoMass_kg, starshipArch, tankerCount, falcon9Variant, originBody }
 */
export function evaluateCapability(need, request = {}) {
  const vehicleId = request.vehicleId || 'sh-starship';
  const cargo = Math.max(0, Number(request.cargoMass_kg) || 0);
  const arch = request.starshipArch || 'legacy-demo';
  const tankers = Math.max(0, Math.min(MAX_TANKERS, Math.floor(Number(request.tankerCount) || 0)));
  const f9v = request.falcon9Variant === 'asds' ? 'asds' : 'expendable';
  const preset = getPreset(vehicleId);

  const base = {
    vehicleId,
    disclaimer: presetDisclaimer(vehicleId),
    applicable: true,
    primary_metric: 'dv',
  };

  if (vehicleId === 'falcon9') {
    if (!falcon9EarthDepartureOnly(request.originBody)) {
      return {
        ...base,
        applicable: false,
        primary_metric: 'cargo',
        capability_cargo_kg: null,
        capability_dv_m_s: null,
        reason: 'Falcon 9 model applies only to Earth departure (interplanetary C3≥0)',
      };
    }
    if (!need?.applicable || need.c3_m2_s2 == null) {
      return {
        ...base,
        applicable: false,
        primary_metric: 'cargo',
        capability_cargo_kg: null,
        capability_dv_m_s: null,
        reason: 'F9 needs C3 from Lambert-ok departure',
      };
    }
    const maxPay = falcon9MaxPayloadKg(need.c3_m2_s2, f9v);
    return {
      ...base,
      applicable: maxPay != null,
      primary_metric: 'cargo',
      capability_cargo_kg: maxPay,
      capability_dv_m_s: null,
      falcon9Variant: f9v,
      c3_m2_s2: need.c3_m2_s2,
      reason: maxPay == null ? 'C3 outside table' : null,
      disclaimer: F9_DISCLAIMER,
    };
  }

  if (vehicleId === 'sh-starship' && arch !== 'legacy-demo') {
    const capDv = starshipCapabilityDv(cargo, arch, tankers);
    const maxCargo = need?.need_dv_m_s != null && isFinite(need.need_dv_m_s)
      ? maxCargoForNeed(need.need_dv_m_s, arch, tankers)
      : null;
    let tankersNeeded = null;
    if (arch === 'tanker-n' && need?.need_dv_m_s != null) {
      tankersNeeded = minTankersForNeed(need.need_dv_m_s, cargo);
    }
    return {
      ...base,
      applicable: true,
      primary_metric: arch === 'tanker-n' ? 'tankers_or_dv' : 'dv',
      capability_dv_m_s: capDv,
      capability_cargo_kg: maxCargo,
      tankers_used: tankers,
      tankers_needed: tankersNeeded,
      starshipArch: arch,
      disclaimer: SS_DISCLAIMER,
    };
  }

  // Abstract / legacy SH / fixed Δv presets
  const abs = request.abstractBudget_m_s;
  let capDv;
  if (vehicleId === 'sh-starship') {
    capDv = superHeavyDeltaV();
  } else {
    capDv = getTransferBudget(vehicleId, abs, { starshipArch: 'legacy-demo' });
  }
  return {
    ...base,
    applicable: capDv != null && isFinite(capDv),
    primary_metric: 'dv',
    capability_dv_m_s: capDv,
    capability_cargo_kg: null,
    starshipArch: vehicleId === 'sh-starship' ? 'legacy-demo' : undefined,
    reason: null,
  };
}

/**
 * Margin (K19): cargo from request, not need.
 * @param {object} need
 * @param {object} capability
 * @param {object} request { cargoMass_kg }
 */
export function evaluateMargin(need, capability, request = {}) {
  const cargo = Math.max(0, Number(request.cargoMass_kg) || 0);

  if (!capability?.applicable) {
    return {
      feasible: false,
      kind: 'inapplicable',
      margin_dv_m_s: null,
      margin_cargo_kg: null,
      reason: capability?.reason || 'capability not applicable',
    };
  }

  if (!need?.applicable || need.need_dv_m_s == null || !isFinite(need.need_dv_m_s)) {
    // F9 cargo-primary may not need need_dv if we only compare cargo — still need C3 path
    if (capability.primary_metric === 'cargo' && capability.capability_cargo_kg != null) {
      const marginCargo = capability.capability_cargo_kg - cargo;
      return {
        feasible: marginCargo >= 0,
        kind: 'cargo',
        margin_dv_m_s: null,
        margin_cargo_kg: marginCargo,
        reason: null,
      };
    }
    return {
      feasible: false,
      kind: 'error',
      margin_dv_m_s: null,
      margin_cargo_kg: null,
      reason: 'need not applicable',
    };
  }

  if (capability.primary_metric === 'cargo') {
    if (capability.capability_dv_m_s != null && capability.capability_cargo_kg == null) {
      return {
        feasible: false,
        kind: 'error',
        reason: 'mixed units: cargo primary but dv-only capability',
      };
    }
    const marginCargo = (capability.capability_cargo_kg ?? 0) - cargo;
    return {
      feasible: marginCargo >= 0,
      kind: 'cargo',
      margin_dv_m_s: null,
      margin_cargo_kg: marginCargo,
      reason: null,
    };
  }

  // Δv primary (abstract, legacy, SS unrefueled/tanker with dv)
  if (capability.capability_dv_m_s == null || !isFinite(capability.capability_dv_m_s)) {
    // tanker path: also check tankers_needed
    if (capability.tankers_needed != null) {
      return {
        feasible: true,
        kind: 'tankers',
        margin_dv_m_s: null,
        margin_cargo_kg: capability.capability_cargo_kg != null
          ? capability.capability_cargo_kg - cargo
          : null,
        tankers_needed: capability.tankers_needed,
        reason: null,
      };
    }
    return {
      feasible: false,
      kind: 'error',
      reason: 'capability_dv missing for dv margin',
    };
  }

  const marginDv = capability.capability_dv_m_s - need.need_dv_m_s;
  let feasible = marginDv >= 0;
  if (capability.starshipArch === 'tanker-n' && capability.tankers_needed == null
      && capability.tankers_used != null) {
    // fixed N may still be infeasible
    feasible = marginDv >= 0;
  }
  if (capability.starshipArch === 'tanker-n' && request.solveTankers) {
    const n = capability.tankers_needed;
    return {
      feasible: n != null,
      kind: 'tankers',
      margin_dv_m_s: marginDv,
      margin_cargo_kg: capability.capability_cargo_kg != null
        ? capability.capability_cargo_kg - cargo
        : null,
      tankers_needed: n,
      reason: n == null ? 'exceeds MAX_TANKERS' : null,
    };
  }

  return {
    feasible,
    kind: 'dv',
    margin_dv_m_s: marginDv,
    margin_cargo_kg: capability.capability_cargo_kg != null
      ? capability.capability_cargo_kg - cargo
      : null,
    reason: null,
  };
}

export { F9_ASDS_DERATE, F9_DISCLAIMER, SS_DISCLAIMER, MAX_TANKERS, unrefueledZeroCargoDv };
