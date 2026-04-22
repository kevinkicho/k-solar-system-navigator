export const VEHICLE_SPECS = {
  superHeavy: { name: "Super Heavy Booster", dryMass: 200000, propellantMass: 3400000, thrust: 74400000, isp: 327, numEngines: 33, burnDurationMax: 180 },
  // Starship flies fully fueled (full propellant + full payload). All of Starship's
  // Δv is reserved for final-mile ops (landing, rendezvous, fine adjustments) —
  // the interplanetary transfer budget comes from Super Heavy alone.
  starship: { name: "Starship", dryMass: 120000, propellantMass: 1200000, thrust: 13536000, isp: 350, numEngines: 6 },
  combined: { name: "Super Heavy + Starship Stack" },
};

const G0 = 9.80665;

// Super Heavy Δv with the fully-loaded Starship (full fuel + full payload) as payload.
export function superHeavyDeltaV() {
  const sh = VEHICLE_SPECS.superHeavy, ss = VEHICLE_SPECS.starship;
  const m0 = sh.dryMass + sh.propellantMass + ss.dryMass + ss.propellantMass;
  const mf = sh.dryMass + ss.dryMass + ss.propellantMass;
  return sh.isp * G0 * Math.log(m0 / mf);
}

// Starship's reserved Δv (full propellant load, for final-mile use).
export function starshipDeltaV() {
  const ss = VEHICLE_SPECS.starship;
  const m0 = ss.dryMass + ss.propellantMass;
  const mf = ss.dryMass;
  return ss.isp * G0 * Math.log(m0 / mf);
}

// Starship fuel is entirely reserved — none is used for transfer.
export function usableStarshipPropellant() { return 0; }

// Total theoretical Δv of the stack (info only).
export function totalMissionDeltaV() { return superHeavyDeltaV() + starshipDeltaV(); }

// Δv held back for landing / docking / fine adjustments = all of Starship.
export function reservedDeltaV() { return starshipDeltaV(); }

// What's available for the interplanetary transfer itself.
export function transferDeltaV() { return superHeavyDeltaV(); }
