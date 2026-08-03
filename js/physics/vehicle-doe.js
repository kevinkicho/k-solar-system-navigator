/**
 * Vehicle design-of-experiments — cargo / tanker sweeps at fixed Need.
 * Educational models only — not SpaceX warranty.
 */

import { evaluateCapability, evaluateMargin } from './vehicles.js';
import { maxCargoForNeed, minTankersForNeed, MAX_TANKERS } from './starship-architecture.js';

/**
 * Sweep cargo mass for a fixed architecture against Need.
 * @param {object} need { need_dv_m_s }
 * @param {object} [opts]
 */
export function cargoSweep(need, opts = {}) {
  const needDv = need?.need_dv_m_s;
  if (needDv == null || !isFinite(needDv)) {
    return { rows: [], error: 'need_dv required', product_class: 'preliminary-not-flight-certified' };
  }
  const vehicleId = opts.vehicleId || 'sh-starship';
  const arch = opts.starshipArch || 'unrefueled';
  const tankers = opts.tankerCount ?? 0;
  const originBody = opts.originBody || null;
  const cargos = opts.cargos_kg || [0, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

  const rows = cargos.map((cargoMass_kg) => {
    const request = {
      vehicleId,
      cargoMass_kg,
      starshipArch: arch,
      tankerCount: tankers,
      falcon9Variant: opts.falcon9Variant || 'expendable',
      originBody,
    };
    const capability = evaluateCapability(need, request);
    const margin = evaluateMargin(need, capability, request);
    return {
      cargoMass_kg,
      capability_dv_m_s: capability?.capability_dv_m_s ?? null,
      margin_dv_m_s: margin?.margin_dv_m_s ?? null,
      margin_cargo_kg: margin?.margin_cargo_kg ?? null,
      feasible: !!margin?.feasible,
      applicable: capability?.applicable !== false,
    };
  });

  return {
    kind: 'cargo_sweep',
    need_dv_m_s: needDv,
    vehicleId,
    starshipArch: arch,
    tankerCount: tankers,
    rows,
    max_cargo_at_need_kg: vehicleId === 'sh-starship' ? maxCargoForNeed(needDv, arch, tankers) : null,
    product_class: 'preliminary-not-flight-certified',
    note: 'Cargo DoE uses educational capability models — not OEM warranty.',
    generated_at: new Date().toISOString(),
  };
}

/**
 * Sweep tanker count for fixed cargo @ Need.
 */
export function tankerSweep(need, opts = {}) {
  const needDv = need?.need_dv_m_s;
  if (needDv == null || !isFinite(needDv)) {
    return { rows: [], error: 'need_dv required', product_class: 'preliminary-not-flight-certified' };
  }
  const cargo = Math.max(0, Number(opts.cargoMass_kg) || 0);
  const originBody = opts.originBody || null;
  const maxN = Math.min(MAX_TANKERS, opts.maxTankers ?? 12);
  const rows = [];
  for (let n = 0; n <= maxN; n++) {
    const request = {
      vehicleId: 'sh-starship',
      cargoMass_kg: cargo,
      starshipArch: 'tanker-n',
      tankerCount: n,
      originBody,
    };
    const capability = evaluateCapability(need, request);
    const margin = evaluateMargin(need, capability, request);
    rows.push({
      tankerCount: n,
      capability_dv_m_s: capability?.capability_dv_m_s ?? null,
      margin_dv_m_s: margin?.margin_dv_m_s ?? null,
      feasible: !!margin?.feasible,
    });
  }
  const minN = minTankersForNeed(needDv, cargo);
  return {
    kind: 'tanker_sweep',
    need_dv_m_s: needDv,
    cargoMass_kg: cargo,
    rows,
    min_tankers_for_need: minN,
    product_class: 'preliminary-not-flight-certified',
    note: 'Tanker quanta are educational — not SpaceX tanker flight design.',
    generated_at: new Date().toISOString(),
  };
}

/**
 * Combined DoE pack for UI/export.
 */
export function runVehicleDoe(need, opts = {}) {
  return {
    cargo: cargoSweep(need, opts),
    tankers: tankerSweep(need, opts),
    product_class: 'preliminary-not-flight-certified',
  };
}
