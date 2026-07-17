/**
 * Concept-grade vehicle design for a mission Need Δv.
 *
 * Multivariable rocket-equation sizing (educational paper study):
 *   Δv = Isp · g₀ · ln(m₀ / m_f)
 *   m₀ = m_dry + m_prop + m_cargo
 *   m_f = m_dry + m_cargo
 *
 * Inverts for propellant, explores Isp / dry-mass / stages / tanker quanta.
 * Not flight design. Not SpaceX performance.
 */

import { G0 } from './vehicle-performance.js';
import {
  starshipCapabilityDv, minTankersForNeed, maxCargoForNeed,
  MAX_TANKERS, M_TANKER_DELIVER_KG, SS_PROP_LEO_KG, SS_DISCLAIMER,
} from './starship-architecture.js';
import { superHeavyDeltaV, starshipDeltaV, VEHICLE_SPECS } from './vehicles.js';

/** Propulsion class table for paper studies (Isp vacuum-class educational). */
export const PROPULSION_CLASSES = [
  {
    id: 'lox-rp', name: 'LOX / RP-1 chemical', isp: 330, color: '#ff9800',
    note: 'Kerosene-class vac Isp',
    // Bulk density of usable prop (oxidizer+fuel) for tank volume estimates (kg/m³)
    prop_bulk_density_kg_m3: 1020,
  },
  {
    id: 'lox-ch4', name: 'LOX / CH₄ chemical', isp: 350, color: '#ffb74d',
    note: 'Methane-class vac Isp (SS-like)',
    prop_bulk_density_kg_m3: 950, // LOX+CH4 mix order-of-magnitude
  },
  {
    id: 'lox-lh2', name: 'LOX / LH₂ chemical', isp: 450, color: '#4fc3f7',
    note: 'Hydrolox upper-stage class',
    prop_bulk_density_kg_m3: 360, // LOX+LH2 bulk — large tanks for mass
  },
  {
    id: 'advanced-800', name: 'Advanced chem / hybrid (abstract)', isp: 800, color: '#81c784',
    note: 'Abstract placeholder',
    prop_bulk_density_kg_m3: 800,
  },
  {
    id: 'high-isp-1500', name: 'High-Isp stage (abstract)', isp: 1500, color: '#ba68c8',
    note: 'Not nuclear sizing — Δv math only',
    prop_bulk_density_kg_m3: 500,
  },
  {
    id: 'ep-3000', name: 'Electric / advanced (abstract)', isp: 3000, color: '#64b5f6',
    note: 'EP-class Isp; thrust/time ignored',
    prop_bulk_density_kg_m3: 1000, // xenon-class density; tiny mass tanks
  },
];

/**
 * Educational Super Heavy + Starship full-stack baseline (concept-grade masses).
 * Used for “× multiples” language in paper studies.
 */
export function shStarshipBaseline() {
  const sh = VEHICLE_SPECS.superHeavy;
  const ss = VEHICLE_SPECS.starship;
  const prop_kg = sh.propellantMass + ss.propellantMass;
  const dry_kg = sh.dryMass + ss.dryMass;
  const wet_kg = dry_kg + prop_kg;
  // Liftoff thrust class = SH (33 engines); upper-stage vac thrust = SS
  const thrust_liftoff_N = sh.thrust;
  const thrust_upper_N = ss.thrust;
  const thrust_stack_peak_N = sh.thrust + ss.thrust; // not simultaneous in flight; paper bound
  // CH4/LOX bulk density for stack tank volume (same class as SS)
  const dens = 950;
  const prop_volume_m3 = prop_kg / dens;
  // Educational envelope: ~9 m diameter class, ~120 m stack height
  const diameter_m = 9;
  const height_m = 120;
  const envelope_volume_m3 = Math.PI * (diameter_m / 2) ** 2 * height_m;
  return {
    name: 'Super Heavy + Starship (full stack)',
    dryMass_kg: dry_kg,
    propellantMass_kg: prop_kg,
    wetMass_kg: wet_kg,
    superHeavy: { ...sh },
    starship: { ...ss },
    thrust_liftoff_N,
    thrust_upper_N,
    thrust_stack_peak_N,
    prop_bulk_density_kg_m3: dens,
    prop_volume_m3,
    diameter_m,
    height_m,
    envelope_volume_m3,
    twr_liftoff_g: thrust_liftoff_N / (wet_kg * G0),
    note: 'Masses/thrust from HELIOS concept VEHICLE_SPECS — not SpaceX published stack totals.',
  };
}

/** Format a ratio as human “×” text (e.g. 2.3×, 0.45×). */
export function formatTimes(ratio, digits = 2) {
  if (ratio == null || !isFinite(ratio) || ratio <= 0) return '—';
  if (ratio >= 100) return `${Math.round(ratio)}×`;
  if (ratio >= 10) return `${ratio.toFixed(1)}×`;
  if (ratio >= 1) return `${ratio.toFixed(digits)}×`;
  // Smaller than baseline
  if (ratio >= 0.1) return `${ratio.toFixed(2)}×`;
  return `${ratio.toFixed(3)}×`;
}

/**
 * Compare a paper stage/stack to Super Heavy + Starship baseline.
 * Size: tank volume ∝ prop/density; linear scale ~ volume^(1/3) if similar packing.
 * Thrust: match baseline liftoff T/W so F_design ≈ TWR_base · m_wet · g₀.
 */
export function compareSketchToShStarship(sketch, propulsion = null) {
  const base = shStarshipBaseline();
  if (!sketch || sketch.propellantMass_kg == null || sketch.wetMass_kg == null) {
    return { ok: false, reason: 'incomplete sketch masses' };
  }
  const prop = sketch.propellantMass_kg;
  const dry = sketch.dryMass_kg ?? 0;
  const wet = sketch.wetMass_kg;
  const dens = propulsion?.prop_bulk_density_kg_m3
    || base.prop_bulk_density_kg_m3;
  const propVol = prop / dens;
  const basePropVol = base.prop_volume_m3;

  const mass_prop_x = prop / base.propellantMass_kg;
  const mass_dry_x = dry > 0 ? dry / base.dryMass_kg : null;
  const mass_wet_x = wet / base.wetMass_kg;
  const tank_volume_x = propVol / basePropVol;
  // Characteristic length if tanks dominate and pack similarly
  const linear_tank_x = tank_volume_x > 0 ? Math.cbrt(tank_volume_x) : null;
  // Envelope linear scale from wet mass (same mean density as baseline stack)
  const linear_mass_x = mass_wet_x > 0 ? Math.cbrt(mass_wet_x) : null;

  // Thrust to preserve baseline liftoff T/W on the paper wet mass
  const thrust_for_same_twr_N = base.twr_liftoff_g * wet * G0;
  const thrust_x = thrust_for_same_twr_N / base.thrust_liftoff_N;
  // Engine count if each engine ~ SH Raptor-class thrust
  const engines_like_sh = Math.max(1, Math.round(thrust_for_same_twr_N / (base.superHeavy.thrust / base.superHeavy.numEngines)));

  const lines = buildComparisonLines({
    base,
    mass_prop_x,
    mass_dry_x,
    mass_wet_x,
    tank_volume_x,
    linear_tank_x,
    linear_mass_x,
    thrust_x,
    thrust_for_same_twr_N,
    engines_like_sh,
    dens,
    propVol,
    propulsion,
    sketch,
  });

  return {
    ok: true,
    baseline: base,
    design: {
      dryMass_kg: dry,
      propellantMass_kg: prop,
      wetMass_kg: wet,
      prop_volume_m3: propVol,
      prop_bulk_density_kg_m3: dens,
      thrust_for_same_twr_N,
      engines_like_sh_raptor_class: engines_like_sh,
    },
    multiples: {
      propellant_mass: mass_prop_x,
      dry_mass: mass_dry_x,
      wet_mass: mass_wet_x,
      tank_volume: tank_volume_x,
      linear_tank_scale: linear_tank_x,
      linear_wet_mass_scale: linear_mass_x,
      thrust_same_twr: thrust_x,
    },
    multiples_text: {
      propellant_mass: formatTimes(mass_prop_x),
      dry_mass: formatTimes(mass_dry_x),
      wet_mass: formatTimes(mass_wet_x),
      tank_volume: formatTimes(tank_volume_x),
      linear_tank_scale: formatTimes(linear_tank_x),
      linear_wet_mass_scale: formatTimes(linear_mass_x),
      thrust_same_twr: formatTimes(thrust_x),
    },
    lines,
  };
}

function buildComparisonLines(ctx) {
  const {
    base, mass_prop_x, mass_dry_x, mass_wet_x, tank_volume_x,
    linear_tank_x, linear_mass_x, thrust_x, thrust_for_same_twr_N,
    engines_like_sh, dens, propVol, propulsion, sketch,
  } = ctx;
  const lines = [];
  const baseLabel = 'Super Heavy + Starship full stack';

  lines.push(
    `Baseline ${baseLabel}: wet ≈ ${(base.wetMass_kg / 1000).toFixed(0)} t · prop ≈ ${(base.propellantMass_kg / 1000).toFixed(0)} t · dry ≈ ${(base.dryMass_kg / 1000).toFixed(0)} t · SH liftoff thrust ≈ ${(base.thrust_liftoff_N / 1e6).toFixed(1)} MN (${base.superHeavy.numEngines} eng.).`,
  );

  // Propellant / tanks
  if (mass_prop_x >= 1.05) {
    lines.push(
      `Fuel load: ≈ ${formatTimes(mass_prop_x)} the SH+SS propellant mass `
      + `(${(sketch.propellantMass_kg / 1000).toFixed(0)} t vs ${(base.propellantMass_kg / 1000).toFixed(0)} t).`,
    );
  } else if (mass_prop_x <= 0.95) {
    lines.push(
      `Fuel load: ≈ ${formatTimes(mass_prop_x)} SH+SS propellant `
      + `(only ${(sketch.propellantMass_kg / 1000).toFixed(0)} t vs ${(base.propellantMass_kg / 1000).toFixed(0)} t) — higher Isp or lower Need.`,
    );
  } else {
    lines.push('Fuel load: about the same propellant mass as a full SH+SS stack.');
  }

  if (tank_volume_x != null && isFinite(tank_volume_x)) {
    const densNote = propulsion?.id === 'lox-lh2'
      ? ' (LH₂ bulk density is low — tanks look larger per tonne)'
      : propulsion?.id?.startsWith('ep') || propulsion?.id?.includes('1500')
        ? ' (density assumed; high-Isp props may not use chemical tanks)'
        : '';
    if (tank_volume_x >= 1.05) {
      lines.push(
        `Tank volume (est.): ≈ ${formatTimes(tank_volume_x)} SH+SS prop tank volume `
        + `~${propVol.toFixed(0)} m³ vs ~${base.prop_volume_m3.toFixed(0)} m³ at ρ≈${dens} kg/m³${densNote}.`,
      );
    } else if (tank_volume_x <= 0.95) {
      lines.push(
        `Tank volume (est.): ≈ ${formatTimes(tank_volume_x)} SH+SS prop tank volume`
        + densNote + '.',
      );
    }
    if (linear_tank_x != null && Math.abs(linear_tank_x - 1) > 0.05) {
      lines.push(
        `Tank linear size (if similar shape): ≈ ${formatTimes(linear_tank_x)} each length `
        + `(volume scales as L³ → L ∝ V⅓). A cylindrical tank set would be roughly `
        + `${formatTimes(linear_tank_x)} as long/wide as SH+SS tanks.`,
      );
    }
  }

  // Structure / wet
  if (mass_dry_x != null && Math.abs(mass_dry_x - 1) > 0.08) {
    lines.push(
      mass_dry_x > 1
        ? `Structure (dry): ≈ ${formatTimes(mass_dry_x)} SH+SS dry mass — heavier airframe/tanks.`
        : `Structure (dry): ≈ ${formatTimes(mass_dry_x)} SH+SS dry mass — lighter paper stage.`,
    );
  }
  if (mass_wet_x != null && Math.abs(mass_wet_x - 1) > 0.08) {
    lines.push(
      `Stack wet mass: ≈ ${formatTimes(mass_wet_x)} a fueled SH+SS stack `
      + `(${(sketch.wetMass_kg / 1000).toFixed(0)} t vs ${(base.wetMass_kg / 1000).toFixed(0)} t).`,
    );
    if (linear_mass_x != null && Math.abs(linear_mass_x - 1) > 0.05) {
      lines.push(
        `Overall size (same mean density): linear scale ≈ ${formatTimes(linear_mass_x)} `
        + `→ height class ~${(base.height_m * linear_mass_x).toFixed(0)} m if ~${base.height_m} m is SH+SS, `
        + `diameter class ~${(base.diameter_m * linear_mass_x).toFixed(1)} m if ~${base.diameter_m} m baseline `
        + `(very rough; real vehicles pack tanks differently).`,
      );
    }
  }

  // Thrust
  if (thrust_x != null && isFinite(thrust_x)) {
    lines.push(
      `Thrust for same liftoff T/W (~${base.twr_liftoff_g.toFixed(2)} g on wet mass): `
      + `≈ ${formatTimes(thrust_x)} Super Heavy’s ${(base.thrust_liftoff_N / 1e6).toFixed(1)} MN `
      + `→ ~${(thrust_for_same_twr_N / 1e6).toFixed(1)} MN total `
      + `(~${engines_like_sh} engines if each is SH-Raptor class ~${(base.superHeavy.thrust / base.superHeavy.numEngines / 1e6).toFixed(2)} MN).`,
    );
    if (thrust_x > 1.05) {
      lines.push(
        `That is ${formatTimes(thrust_x)} the liftoff thrust of Super Heavy alone, `
        + `or ${formatTimes(thrust_for_same_twr_N / base.thrust_stack_peak_N)} the (non-simultaneous) SH+SS peak thrust sum — paper T/W only.`,
      );
    }
  }

  lines.push(
    'Multiples are order-of-magnitude educational estimates from mass ratios and packing assumptions — not CAD, not tank FEA, not engine cycles.',
  );
  return lines;
}

/**
 * Mass ratio required for ideal rocket equation.
 * R = exp(Δv / (Isp · g₀))
 */
export function massRatioForDv(need_dv_m_s, isp) {
  if (!(need_dv_m_s > 0) || !(isp > 0)) return null;
  return Math.exp(need_dv_m_s / (isp * G0));
}

/**
 * Propellant mass (kg) to meet Need for fixed dry + cargo.
 * m_p = (R − 1) · (m_dry + m_cargo)
 */
export function propellantForNeed(need_dv_m_s, isp, dryMass_kg, cargoMass_kg = 0) {
  const R = massRatioForDv(need_dv_m_s, isp);
  if (R == null || !isFinite(R) || R <= 1) return null;
  const dry = Math.max(1, Number(dryMass_kg) || 0);
  const cargo = Math.max(0, Number(cargoMass_kg) || 0);
  const mp = (R - 1) * (dry + cargo);
  if (!(mp > 0) || !isFinite(mp)) return null;
  return mp;
}

/** Ideal Δv from masses (m/s). */
export function dvFromMasses(isp, dryMass_kg, propMass_kg, cargoMass_kg = 0) {
  const dry = Math.max(1, Number(dryMass_kg) || 0);
  const prop = Math.max(0, Number(propMass_kg) || 0);
  const cargo = Math.max(0, Number(cargoMass_kg) || 0);
  const m0 = dry + prop + cargo;
  const mf = dry + cargo;
  if (!(isp > 0) || m0 <= mf) return null;
  return isp * G0 * Math.log(m0 / mf);
}

/**
 * Structural coefficient ε = m_dry / (m_dry + m_prop) (payload separate).
 */
export function structuralCoefficient(dryMass_kg, propMass_kg) {
  const dry = Math.max(0, Number(dryMass_kg) || 0);
  const prop = Math.max(0, Number(propMass_kg) || 0);
  const stage = dry + prop;
  if (!(stage > 0)) return null;
  return dry / stage;
}

/**
 * Two equal-Δv stages (serial, educational split).
 * Stage 2 burns first conceptually as upper: each needs R = exp((Δv/2)/(Isp g0)).
 * Returns upper + lower prop/dry if we fix dry fractions.
 *
 * Simplified model: both stages same Isp; upper dry fixed; lower dry fixed.
 */
export function twoStageEqualSplit(need_dv_m_s, isp, dryUpper_kg, dryLower_kg, cargoMass_kg = 0) {
  if (!(need_dv_m_s > 0) || !(isp > 0)) return null;
  const half = need_dv_m_s / 2;
  const R = massRatioForDv(half, isp);
  if (R == null) return null;
  const cargo = Math.max(0, Number(cargoMass_kg) || 0);
  const du = Math.max(1, Number(dryUpper_kg) || 0);
  const dl = Math.max(1, Number(dryLower_kg) || 0);

  // Upper stage: payload = cargo
  const propU = (R - 1) * (du + cargo);
  // Lower stage: payload = upper wet + cargo
  const upperWet = du + propU + cargo;
  const propL = (R - 1) * (dl + upperWet);

  const dvU = dvFromMasses(isp, du, propU, cargo);
  const dvL = dvFromMasses(isp, dl, propL, upperWet);
  return {
    split: 'equal_dv',
    need_dv_m_s,
    isp,
    half_dv_m_s: half,
    mass_ratio_stage: R,
    upper: {
      dryMass_kg: du,
      propellantMass_kg: propU,
      wetMass_kg: du + propU,
      cargoMass_kg: cargo,
      dv_m_s: dvU,
      structural_eps: structuralCoefficient(du, propU),
    },
    lower: {
      dryMass_kg: dl,
      propellantMass_kg: propL,
      wetMass_kg: dl + propL,
      payloadMass_kg: upperWet,
      dv_m_s: dvL,
      structural_eps: structuralCoefficient(dl, propL),
    },
    total_wet_kg: dl + propL + upperWet,
    total_prop_kg: propU + propL,
    total_dv_m_s: (dvU || 0) + (dvL || 0),
  };
}

/**
 * Sensitivity: propellant vs Need for fixed Isp, dry, cargo.
 * Returns sample points along Need axis and local slope dmp/dΔv at target.
 */
export function propellantSensitivity(need_dv_m_s, isp, dryMass_kg, cargoMass_kg = 0, n = 12) {
  const dry = Math.max(1, Number(dryMass_kg) || 0);
  const cargo = Math.max(0, Number(cargoMass_kg) || 0);
  const need = Math.max(100, Number(need_dv_m_s) || 0);
  const points = [];
  const lo = Math.max(500, need * 0.4);
  const hi = need * 1.4;
  for (let i = 0; i <= n; i++) {
    const dv = lo + (hi - lo) * (i / n);
    const mp = propellantForNeed(dv, isp, dry, cargo);
    points.push({ need_dv_m_s: dv, propellantMass_kg: mp });
  }
  // Analytic slope: mp = (e^{Δv/c}−1)(md+mc), c=Isp g0
  // dmp/dΔv = (1/c) e^{Δv/c} (md+mc)
  const c = isp * G0;
  const R = Math.exp(need / c);
  const dmp_ddv = (R / c) * (dry + cargo);
  return {
    points,
    at_need: {
      need_dv_m_s: need,
      propellantMass_kg: propellantForNeed(need, isp, dry, cargo),
      d_prop_per_m_s: dmp_ddv,
      d_prop_per_km_s: dmp_ddv * 1000,
    },
  };
}

/**
 * Isp sweep: for fixed dry/cargo, propellant and feasibility vs Isp.
 */
export function ispSweep(need_dv_m_s, dryMass_kg, cargoMass_kg = 0, isps = null) {
  const list = isps || PROPULSION_CLASSES.map((p) => p.isp);
  return list.map((isp) => {
    const R = massRatioForDv(need_dv_m_s, isp);
    const mp = propellantForNeed(need_dv_m_s, isp, dryMass_kg, cargoMass_kg);
    const wet = mp != null ? dryMass_kg + mp + cargoMass_kg : null;
    const eps = mp != null ? structuralCoefficient(dryMass_kg, mp) : null;
    return {
      isp,
      mass_ratio: R,
      propellantMass_kg: mp,
      wetMass_kg: wet,
      structural_eps: eps,
      prop_fraction: mp != null && wet > 0 ? mp / (dryMass_kg + mp) : null,
    };
  });
}

/**
 * Dry-mass sweep at fixed Isp: trade structural mass vs prop load.
 */
export function dryMassSweep(need_dv_m_s, isp, cargoMass_kg = 0, dryMasses = null) {
  const defaults = [5e3, 2e4, 5e4, 1.2e5, 2e5, 5e5, 1e6];
  const list = dryMasses || defaults;
  return list.map((dry) => {
    const mp = propellantForNeed(need_dv_m_s, isp, dry, cargoMass_kg);
    return {
      dryMass_kg: dry,
      propellantMass_kg: mp,
      wetMass_kg: mp != null ? dry + mp + cargoMass_kg : null,
      structural_eps: mp != null ? structuralCoefficient(dry, mp) : null,
      mass_ratio: massRatioForDv(need_dv_m_s, isp),
    };
  });
}

/**
 * Compare active vehicle family vs Need (gap analysis).
 */
export function compareActiveVehicleToNeed(need_dv_m_s, request = {}) {
  const need = Number(need_dv_m_s);
  if (!isFinite(need) || need <= 0) return null;
  const cargo = Math.max(0, Number(request.cargoMass_kg) || 0);
  const arch = request.starshipArch || 'unrefueled';
  const tankers = Math.max(0, Math.min(MAX_TANKERS, Math.floor(Number(request.tankerCount) || 0)));

  const ssCap = starshipCapabilityDv(cargo, arch === 'legacy-demo' ? 'unrefueled' : arch, tankers);
  const shCap = superHeavyDeltaV();
  const ssZero = starshipDeltaV();
  const tankersNeeded = minTankersForNeed(need, cargo);
  const maxCargoUnrefueled = maxCargoForNeed(need, 'unrefueled', 0);

  return {
    need_dv_m_s: need,
    cargoMass_kg: cargo,
    starship_unrefueled_dv_m_s: starshipCapabilityDv(cargo, 'unrefueled', 0),
    starship_arch_dv_m_s: ssCap,
    starship_zero_cargo_dv_m_s: ssZero,
    superHeavy_legacy_dv_m_s: shCap,
    gap_vs_unrefueled_m_s: need - starshipCapabilityDv(cargo, 'unrefueled', 0),
    tankers_needed_for_need: tankersNeeded,
    max_cargo_unrefueled_kg: maxCargoUnrefueled,
    ss_prop_leo_kg: SS_PROP_LEO_KG,
    tanker_deliver_kg: M_TANKER_DELIVER_KG,
    disclaimer: SS_DISCLAIMER,
  };
}

/**
 * Pick a recommended "paper vehicle" sketch for the Need.
 */
export function recommendPaperVehicle(need_dv_m_s, cargoMass_kg = 0) {
  const need = Number(need_dv_m_s);
  const cargo = Math.max(0, Number(cargoMass_kg) || 0);
  if (!isFinite(need) || need <= 0) return null;

  // Prefer chemical when MR is sane; escalate Isp if prop fraction absurd
  let chosen = PROPULSION_CLASSES[1]; // CH4
  let dry = 120_000; // SS-class dry
  let mp = propellantForNeed(need, chosen.isp, dry, cargo);
  let eps = mp != null ? structuralCoefficient(dry, mp) : null;

  // If structural eps < 0.05 (over 95% prop) try hydrolox or higher Isp
  if (eps != null && eps < 0.08) {
    chosen = PROPULSION_CLASSES[2]; // LH2
    mp = propellantForNeed(need, chosen.isp, dry, cargo);
    eps = mp != null ? structuralCoefficient(dry, mp) : null;
  }
  if (eps != null && eps < 0.06) {
    chosen = PROPULSION_CLASSES[3]; // 800s
    mp = propellantForNeed(need, chosen.isp, dry, cargo);
    eps = mp != null ? structuralCoefficient(dry, mp) : null;
  }
  if (eps != null && eps < 0.05) {
    chosen = PROPULSION_CLASSES[4]; // 1500s
    dry = 80_000;
    mp = propellantForNeed(need, chosen.isp, dry, cargo);
    eps = mp != null ? structuralCoefficient(dry, mp) : null;
  }

  const twoStage = twoStageEqualSplit(need, Math.min(chosen.isp, 450), dry * 0.4, dry * 0.6, cargo);
  const tankers = minTankersForNeed(need, cargo);

  // Abstract budget recommendation (with 10% margin)
  const abstractBudget = Math.ceil(need * 1.1 / 100) * 100;

  const single = {
    dryMass_kg: dry,
    propellantMass_kg: mp,
    wetMass_kg: mp != null ? dry + mp + cargo : null,
    mass_ratio: massRatioForDv(need, chosen.isp),
    structural_eps: eps,
    prop_fraction: mp != null ? mp / (dry + mp) : null,
  };

  // Prefer two-stage chemical stack for SH+SS multiples when prop is huge
  const compareSubject = (twoStage && twoStage.total_prop_kg > (mp || 0) * 0.5)
    ? {
      dryMass_kg: (twoStage.upper?.dryMass_kg || 0) + (twoStage.lower?.dryMass_kg || 0),
      propellantMass_kg: twoStage.total_prop_kg,
      wetMass_kg: twoStage.total_wet_kg,
      label: 'two-stage chemical sketch',
    }
    : {
      dryMass_kg: dry,
      propellantMass_kg: mp,
      wetMass_kg: single.wetMass_kg,
      label: 'single-stage sketch',
    };

  const vsBaseline = compareSketchToShStarship(compareSubject, chosen);

  // Tanker fleet as another “vehicle” view
  let tankerVsBaseline = null;
  if (tankers != null && tankers > 0) {
    const tankerProp = tankers * M_TANKER_DELIVER_KG + SS_PROP_LEO_KG;
    const tankerDry = VEHICLE_SPECS.starship.dryMass * (1 + tankers * 0.15); // rough fleet dry
    tankerVsBaseline = compareSketchToShStarship({
      dryMass_kg: tankerDry,
      propellantMass_kg: tankerProp,
      wetMass_kg: tankerDry + tankerProp + cargo,
      label: `SS + ${tankers} tankers prop quanta`,
    }, PROPULSION_CLASSES[1]);
  }

  return {
    need_dv_m_s: need,
    cargoMass_kg: cargo,
    propulsion: chosen,
    single_stage: single,
    two_stage_chemical: twoStage,
    starship_tankers_needed: tankers,
    abstract_budget_m_s: abstractBudget,
    vs_sh_starship: vsBaseline,
    tanker_fleet_vs_sh_starship: tankerVsBaseline,
    paper_sketch: buildPaperSketch(need, chosen, dry, mp, cargo, twoStage, tankers, vsBaseline, tankerVsBaseline),
  };
}

function buildPaperSketch(need, prop, dry, mp, cargo, twoStage, tankers, vsBaseline, tankerVs) {
  const needKms = (need / 1000).toFixed(2);
  const lines = [];
  lines.push(`Target Need ≈ ${needKms} km/s (ideal rocket-eq; no gravity/drag).`);
  lines.push(`Propulsion class: ${prop.name} (Isp ≈ ${prop.isp} s). ${prop.note}.`);
  if (mp != null) {
    const wet = dry + mp + cargo;
    const eps = structuralCoefficient(dry, mp);
    lines.push(
      `Single-stage sketch: dry ${(dry / 1000).toFixed(0)} t · prop ${(mp / 1000).toFixed(0)} t · wet ${(wet / 1000).toFixed(0)} t`
      + (cargo > 0 ? ` · cargo ${(cargo / 1000).toFixed(1)} t` : '')
      + ` · ε_struct ≈ ${eps != null ? eps.toFixed(3) : '—'} · MR ≈ ${massRatioForDv(need, prop.isp)?.toFixed(2)}.`,
    );
    if (eps != null && eps < 0.1) {
      lines.push('ε < 0.1 is aggressive for chemical stages — multi-stage or higher Isp is the paper lesson.');
    }
  }
  if (twoStage && twoStage.total_prop_kg) {
    lines.push(
      `Two equal-Δv stages (same Isp ${Math.min(prop.isp, 450)} s): total prop ≈ ${(twoStage.total_prop_kg / 1000).toFixed(0)} t, stack wet ≈ ${(twoStage.total_wet_kg / 1000).toFixed(0)} t.`,
    );
  }
  if (vsBaseline?.ok && vsBaseline.lines?.length) {
    lines.push('—— vs Super Heavy + Starship (multiples) ——');
    for (const L of vsBaseline.lines) lines.push(L);
  }
  if (tankers != null) {
    lines.push(`Starship tanker-n sketch: ≥ ${tankers} tanker quanta (×${(M_TANKER_DELIVER_KG / 1000).toFixed(0)} t) at cargo=${(cargo / 1000).toFixed(1)} t — concept model only.`);
    if (tankerVs?.ok) {
      const t = tankerVs.multiples_text;
      lines.push(
        `Tanker fleet prop quanta ≈ ${t.propellant_mass} SH+SS fuel load, tank volume ≈ ${t.tank_volume}, `
        + `wet mass ≈ ${t.wet_mass}, thrust-for-same-T/W ≈ ${t.thrust_same_twr} Super Heavy liftoff thrust.`,
      );
    }
  } else {
    lines.push('Starship tanker-n cannot close this Need within max tanker quanta at the requested cargo — need higher Isp or lower cargo/Need.');
  }
  lines.push('Paper only: no tanks, structures, or thermal design. Use Abstract budget to animate the trajectory.');
  return lines;
}

/**
 * Full design package for UI / export.
 * @param {number} need_dv_m_s
 * @param {object} [opts]
 */
export function designVehicleForNeed(need_dv_m_s, opts = {}) {
  const need = Number(need_dv_m_s);
  if (!isFinite(need) || need <= 0) {
    return {
      ok: false,
      reason: 'Need Δv unavailable — compute a transfer first',
    };
  }
  const cargo = Math.max(0, Number(opts.cargoMass_kg) || 0);
  const dryRef = Math.max(1000, Number(opts.dryMass_kg) || VEHICLE_SPECS.starship.dryMass);

  const recommendation = recommendPaperVehicle(need, cargo);
  const comparison = compareActiveVehicleToNeed(need, opts);
  const ispTable = ispSweep(need, dryRef, cargo);
  const dryTable = dryMassSweep(need, recommendation?.propulsion?.isp || 350, cargo);
  const sensitivity = propellantSensitivity(
    need,
    recommendation?.propulsion?.isp || 350,
    dryRef,
    cargo,
  );

  // Contour-like sample: Isp × dry grid (sparse for UI)
  const contour = [];
  const dryGrid = [2e4, 1.2e5, 5e5];
  for (const p of PROPULSION_CLASSES.slice(0, 4)) {
    for (const d of dryGrid) {
      const mp = propellantForNeed(need, p.isp, d, cargo);
      contour.push({
        isp: p.isp,
        propulsion: p.id,
        dryMass_kg: d,
        propellantMass_kg: mp,
        wetMass_kg: mp != null ? d + mp + cargo : null,
        structural_eps: mp != null ? structuralCoefficient(d, mp) : null,
      });
    }
  }

  return {
    ok: true,
    disclaimer:
      'Concept-grade multivariable rocket-equation study — not flight vehicle design, not SpaceX performance.',
    need_dv_m_s: need,
    cargoMass_kg: cargo,
    reference_dryMass_kg: dryRef,
    recommendation,
    comparison,
    isp_sweep: ispTable,
    dry_mass_sweep: dryTable,
    sensitivity,
    design_space_samples: contour,
    equations: {
      rocket: 'Δv = Isp · g₀ · ln(m₀/m_f)',
      mass_ratio: 'R = exp(Δv / (Isp · g₀))',
      propellant: 'm_p = (R − 1) · (m_dry + m_cargo)',
      structural: 'ε = m_dry / (m_dry + m_p)',
      g0: G0,
    },
  };
}
