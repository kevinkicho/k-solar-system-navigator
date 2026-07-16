// Vehicle / Δv budget presets for trip-planning feasibility.
// SH+Starship uses the rocket equation; other presets are fixed abstract class budgets.

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
  // Starship flies fully fueled. All of Starship's Δv is reserved for final-mile
  // ops; the interplanetary transfer budget comes from Super Heavy alone.
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
/** @deprecated Prefer getTransferBudget(state) — kept for SH default. */
export function transferDeltaV() { return superHeavyDeltaV(); }

/**
 * Frozen preset table (design K5).
 * transferDv_m_s: number | 'rocket-eq' | 'user'
 */
export const VEHICLE_PRESETS = [
  {
    id: 'sh-starship',
    name: 'Super Heavy + Starship',
    transferDv_m_s: 'rocket-eq',
    disclaimer: 'Illustrative stack model from published-ish mass/Isp assumptions — not SpaceX performance guarantee.',
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
  return VEHICLE_PRESETS.find(p => p.id === id) || VEHICLE_PRESETS[0];
}

/** Usable transfer Δv (m/s) for the selected preset / abstract budget. */
export function getTransferBudget(vehicleId, abstractBudget_m_s = 8000) {
  const p = getPreset(vehicleId);
  if (p.transferDv_m_s === 'rocket-eq') return superHeavyDeltaV();
  if (p.transferDv_m_s === 'user') {
    const v = Number(abstractBudget_m_s);
    if (!isFinite(v)) return 8000;
    return Math.max(500, Math.min(50000, v));
  }
  return p.transferDv_m_s;
}

export function presetDisplayName(vehicleId) {
  return getPreset(vehicleId).name;
}

export function presetDisclaimer(vehicleId) {
  return getPreset(vehicleId).disclaimer;
}
