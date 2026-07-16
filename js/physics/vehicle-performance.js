/**
 * Educational vehicle engineering sheet for sample rockets:
 * Super Heavy booster, Starship upper stage, Falcon 9 (two stages).
 * Concept-grade — not SpaceX performance guarantees or flight design.
 */

import { G_CONST } from '../constants.js';
import { BODIES } from '../data/bodies.js';
import { VEHICLE_SPECS } from './vehicles.js';
import { propellantForArch, starshipCapabilityDv } from './starship-architecture.js';

export const G0 = 9.80665;

/** Illustrative Falcon 9 stage masses / thrust (educational order-of-magnitude). */
export const FALCON9_SPECS = {
  stage1: {
    name: 'Falcon 9 first stage (booster)',
    dryMass: 25600,
    propellantMass: 395700,
    thrust_sl: 7607000, // sea-level class total
    thrust_vac: 8227000,
    isp_sl: 283,
    isp_vac: 312,
    numEngines: 9,
  },
  stage2: {
    name: 'Falcon 9 second stage',
    dryMass: 3900,
    propellantMass: 92670,
    thrust_vac: 981000,
    isp_vac: 348,
    numEngines: 1,
  },
  fairingMass_kg: 1750,
  disclaimer:
    'Illustrative Falcon 9 mass/thrust/Isp class numbers for education — not SpaceX User’s Guide performance.',
};

const EARTH = BODIES.find((b) => b.name === 'Earth');

export function earthMu() {
  return G_CONST * EARTH.mass;
}

export function earthRadius_m() {
  return EARTH.radius;
}

/** Surface escape velocity √(2μ/R) (m/s). */
export function earthSurfaceEscapeVelocity_m_s() {
  return Math.sqrt(2 * earthMu() / earthRadius_m());
}

/** Circular velocity at altitude (m/s). Default 200 km LEO-class. */
export function earthCircularVelocity_m_s(alt_m = 200_000) {
  const r = earthRadius_m() + alt_m;
  return Math.sqrt(earthMu() / r);
}

/** Escape velocity from altitude (m/s). */
export function earthEscapeFromAltitude_m_s(alt_m = 200_000) {
  const r = earthRadius_m() + alt_m;
  return Math.sqrt(2 * earthMu() / r);
}

/** Surface gravity g = μ/R² (m/s²). */
export function earthSurfaceG_m_s2() {
  const R = earthRadius_m();
  return earthMu() / (R * R);
}

/**
 * Ideal rocket-equation Δv (m/s): Isp·g0·ln(m0/mf).
 */
export function rocketEquationDv_m_s(isp, m0, mf) {
  if (!(isp > 0) || !(m0 > mf) || !(mf > 0)) return null;
  return isp * G0 * Math.log(m0 / mf);
}

/**
 * Thrust-to-weight and initial acceleration.
 * @param {number} thrust_N
 * @param {number} mass_kg
 * @param {number} [g=G0] local g for T/W
 */
export function thrustToWeight(thrust_N, mass_kg, g = G0) {
  if (!(thrust_N > 0) || !(mass_kg > 0)) return null;
  const weight = mass_kg * g;
  const twr = thrust_N / weight;
  return {
    twr,
    accel_m_s2: thrust_N / mass_kg,
    accel_g: thrust_N / mass_kg / g,
  };
}

function stageSheet(spec, opts = {}) {
  const thrust = opts.thrust ?? spec.thrust ?? spec.thrust_vac ?? spec.thrust_sl;
  const isp = opts.isp ?? spec.isp ?? spec.isp_vac ?? spec.isp_sl;
  const dry = spec.dryMass;
  const prop = spec.propellantMass;
  const m0 = dry + prop + (opts.payload_kg || 0);
  const mf = dry + (opts.payload_kg || 0);
  const dv = rocketEquationDv_m_s(isp, m0, mf);
  const twrLiftoff = thrustToWeight(thrust, m0, opts.g ?? G0);
  const twrEmpty = thrustToWeight(thrust, mf, opts.g ?? G0);
  return {
    id: opts.id || spec.name,
    name: spec.name,
    dryMass_kg: dry,
    propellantMass_kg: prop,
    payload_kg: opts.payload_kg || 0,
    wetMass_kg: m0,
    massRatio: m0 / mf,
    isp_s: isp,
    thrust_N: thrust,
    numEngines: spec.numEngines ?? null,
    idealDv_m_s: dv,
    twr_liftoff: twrLiftoff?.twr ?? null,
    accel_liftoff_m_s2: twrLiftoff?.accel_m_s2 ?? null,
    accel_liftoff_g: twrLiftoff?.accel_g ?? null,
    twr_burnout: twrEmpty?.twr ?? null,
    accel_burnout_g: twrEmpty?.accel_g ?? null,
  };
}

/**
 * Super Heavy with Starship as payload (legacy stack framing).
 */
export function superHeavyEngineeringSheet(cargoOnStarship_kg = 0) {
  const sh = VEHICLE_SPECS.superHeavy;
  const ss = VEHICLE_SPECS.starship;
  // SH burns with full SS (dry+prop+cargo) as payload
  const payload = ss.dryMass + ss.propellantMass + Math.max(0, cargoOnStarship_kg);
  return stageSheet(sh, {
    id: 'superHeavy',
    payload_kg: payload,
    thrust: sh.thrust,
    isp: sh.isp,
  });
}

/**
 * Starship stage alone (vacuum-class Isp) at given arch/cargo.
 */
export function starshipEngineeringSheet(cargo_kg = 0, arch = 'unrefueled', tankerCount = 0) {
  const ss = VEHICLE_SPECS.starship;
  const prop = arch === 'legacy-demo'
    ? ss.propellantMass
    : propellantForArch(arch, tankerCount);
  const dry = ss.dryMass;
  const cargo = Math.max(0, cargo_kg);
  const m0 = dry + prop + cargo;
  const mf = dry + cargo;
  const dv = rocketEquationDv_m_s(ss.isp, m0, mf);
  const twr = thrustToWeight(ss.thrust, m0, G0); // vacuum T/W educational
  return {
    id: 'starship',
    name: ss.name,
    arch,
    dryMass_kg: dry,
    propellantMass_kg: prop,
    payload_kg: cargo,
    wetMass_kg: m0,
    massRatio: mf > 0 ? m0 / mf : null,
    isp_s: ss.isp,
    thrust_N: ss.thrust,
    numEngines: ss.numEngines,
    idealDv_m_s: dv,
    capabilityDv_arch_m_s: arch === 'legacy-demo'
      ? dv
      : starshipCapabilityDv(cargo, arch, tankerCount),
    twr_liftoff: twr?.twr ?? null,
    accel_liftoff_m_s2: twr?.accel_m_s2 ?? null,
    accel_liftoff_g: twr?.accel_g ?? null,
  };
}

/**
 * Falcon 9 two-stage educational sheet.
 * Stage 1: SL thrust; Stage 2: vacuum; optional payload.
 */
export function falcon9EngineeringSheet(payload_kg = 0, variant = 'expendable') {
  const p1 = FALCON9_SPECS.stage1;
  const p2 = FALCON9_SPECS.stage2;
  const pay = Math.max(0, payload_kg) + FALCON9_SPECS.fairingMass_kg;
  // S1: payload = S2 wet + fairing + payload
  const s2Wet = p2.dryMass + p2.propellantMass;
  const s1 = stageSheet(p1, {
    id: 'falcon9_s1',
    payload_kg: s2Wet + pay,
    thrust: p1.thrust_sl,
    isp: p1.isp_sl,
  });
  const s2 = stageSheet(p2, {
    id: 'falcon9_s2',
    payload_kg: pay,
    thrust: p2.thrust_vac,
    isp: p2.isp_vac,
  });
  return {
    variant,
    stages: [s1, s2],
    stackIdealDv_m_s: (s1.idealDv_m_s || 0) + (s2.idealDv_m_s || 0),
    disclaimer: FALCON9_SPECS.disclaimer,
    asds_note: variant === 'asds'
      ? 'ASDS recovery derates payload capability (see C₃ table), not this ideal stage Δv sum.'
      : 'Expendable-class framing for ideal rocket-eq sum.',
  };
}

/**
 * Environment / atmosphere context (educational, not aero model).
 */
export function earthEnvironmentSheet(alt_m = 200_000) {
  return {
    body: 'Earth',
    surface_g_m_s2: earthSurfaceG_m_s2(),
    surface_escape_m_s: earthSurfaceEscapeVelocity_m_s(),
    leo_circular_m_s: earthCircularVelocity_m_s(alt_m),
    leo_escape_m_s: earthEscapeFromAltitude_m_s(alt_m),
    parking_alt_m: alt_m,
    atmosphere: {
      model: 'qualitative only (no density integration in HELIOS)',
      sea_level: 'Dense atmosphere — gravity + drag + aero losses on ascent (~1.5–2 km/s typical launch losses class, not computed here)',
      vacuum: 'Above ~100–120 km treated as vacuum for rocket-eq sheets; Isp_vac used for upper stages',
      aeroassist: 'Arrival aeroassist is a user factor on capture Need only — not atmospheric entry guidance',
    },
  };
}

/**
 * Full report for UI given current vehicle selection.
 * @param {object} opts
 * @param {string} opts.vehicleId
 * @param {string} [opts.starshipArch]
 * @param {number} [opts.tankerCount]
 * @param {number} [opts.cargoMass_kg]
 * @param {string} [opts.falcon9Variant]
 */
export function buildVehicleEngineeringReport(opts = {}) {
  const vehicleId = opts.vehicleId || 'sh-starship';
  const cargo = Math.max(0, Number(opts.cargoMass_kg) || 0);
  const env = earthEnvironmentSheet(100_000); // match mission-budget parking class
  const base = {
    educational: true,
    disclaimer: 'Concept-grade sample vehicles — not SpaceX-certified performance, not flight ops.',
    environment: env,
  };

  if (vehicleId === 'falcon9') {
    return {
      ...base,
      vehicleId,
      label: 'Falcon 9 (illustrative)',
      falcon9: falcon9EngineeringSheet(cargo, opts.falcon9Variant || 'expendable'),
      stages: falcon9EngineeringSheet(cargo, opts.falcon9Variant || 'expendable').stages,
    };
  }

  if (vehicleId === 'sh-starship') {
    const arch = opts.starshipArch || 'legacy-demo';
    const sh = superHeavyEngineeringSheet(cargo);
    const ss = starshipEngineeringSheet(cargo, arch, opts.tankerCount || 0);
    return {
      ...base,
      vehicleId,
      label: 'Super Heavy + Starship (sample stack)',
      starshipArch: arch,
      superHeavy: sh,
      starship: ss,
      stages: [sh, ss],
      stackNotes: arch === 'legacy-demo'
        ? 'Legacy demo: transfer Capability uses Super Heavy Δv only; Starship propellant reserved for final-mile ops.'
        : 'Cargo-aware arches: Starship rocket-eq Capability vs injection Need; SH places stack in LEO-class (not double-counted).',
    };
  }

  return {
    ...base,
    vehicleId,
    label: 'Abstract / class budget (no stage sheet)',
    stages: [],
    note: 'Select Super Heavy+Starship or Falcon 9 for stage engineering sheets.',
  };
}
