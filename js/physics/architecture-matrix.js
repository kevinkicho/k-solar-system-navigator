/**
 * Architecture trade matrix — evaluate vehicle arches against fixed Need.
 * Educational models only — not SpaceX warranty.
 */

import { evaluateCapability, evaluateMargin } from './vehicles.js';
import { MAX_TANKERS, minTankersForNeed, maxCargoForNeed } from './starship-architecture.js';

/**
 * @param {object} need from computeNeed / dossier.need { need_dv_m_s, applicable, ... }
 * @param {object} [base] { cargoMass_kg, originBody, falcon9Variant }
 * @returns {{ rows: object[], product_class: string, note: string }}
 */
export function buildArchitectureMatrix(need, base = {}) {
  const cargo = Math.max(0, Number(base.cargoMass_kg) || 0);
  const originBody = base.originBody || null;
  const needDv = need?.need_dv_m_s;

  const arches = [
    { id: 'ss-unrefueled', vehicleId: 'sh-starship', starshipArch: 'unrefueled', tankerCount: 0, label: 'Starship unrefueled' },
    { id: 'ss-tanker-1', vehicleId: 'sh-starship', starshipArch: 'tanker-n', tankerCount: 1, label: 'Starship + 1 tanker' },
    { id: 'ss-tanker-3', vehicleId: 'sh-starship', starshipArch: 'tanker-n', tankerCount: 3, label: 'Starship + 3 tankers' },
    { id: 'ss-tanker-6', vehicleId: 'sh-starship', starshipArch: 'tanker-n', tankerCount: 6, label: 'Starship + 6 tankers' },
    { id: 'ss-tanker-solve', vehicleId: 'sh-starship', starshipArch: 'tanker-n', tankerCount: null, label: 'Starship min tankers @ cargo', solveTankers: true },
    { id: 'f9-exp', vehicleId: 'falcon9', falcon9Variant: 'expendable', label: 'Falcon 9 expendable (C₃ table)' },
    { id: 'f9-asds', vehicleId: 'falcon9', falcon9Variant: 'asds', label: 'Falcon 9 ASDS (C₃ table)' },
  ];

  const rows = [];
  for (const a of arches) {
    let tankerCount = a.tankerCount ?? 0;
    if (a.solveTankers && needDv != null && isFinite(needDv)) {
      const n = minTankersForNeed(needDv, cargo);
      tankerCount = n == null ? MAX_TANKERS : n;
    }
    const request = {
      vehicleId: a.vehicleId,
      cargoMass_kg: cargo,
      starshipArch: a.starshipArch || 'unrefueled',
      tankerCount,
      falcon9Variant: a.falcon9Variant || 'expendable',
      originBody,
      solveTankers: !!a.solveTankers,
    };
    const capability = evaluateCapability(need || { need_dv_m_s: needDv, applicable: true }, request);
    const margin = evaluateMargin(need || { need_dv_m_s: needDv, applicable: true }, capability, request);
    let maxCargo = null;
    if (a.vehicleId === 'sh-starship' && needDv != null && isFinite(needDv)) {
      maxCargo = maxCargoForNeed(needDv, request.starshipArch, tankerCount);
    }
    rows.push({
      id: a.id,
      label: a.label,
      vehicleId: a.vehicleId,
      starshipArch: request.starshipArch,
      tankerCount,
      cargoMass_kg: cargo,
      capability_dv_m_s: capability?.capability_dv_m_s ?? null,
      capability_cargo_kg: capability?.capability_cargo_kg ?? null,
      margin_dv_m_s: margin?.margin_dv_m_s ?? null,
      margin_cargo_kg: margin?.margin_cargo_kg ?? null,
      feasible: !!margin?.feasible,
      applicable: capability?.applicable !== false,
      max_cargo_at_need_kg: maxCargo,
      primary_metric: capability?.primary_metric || 'dv',
      reason: margin?.reason || capability?.reason || null,
      disclaimer: capability?.disclaimer || null,
    });
  }

  // Recommend first feasible Starship, else first feasible any
  const rec = rows.find((r) => r.feasible && r.vehicleId === 'sh-starship')
    || rows.find((r) => r.feasible);
  if (rec) rec.recommended = true;

  return {
    need_dv_m_s: needDv ?? null,
    cargoMass_kg: cargo,
    rows,
    product_class: 'preliminary-not-flight-certified',
    note: 'Architecture matrix uses educational vehicle models — not SpaceX / OEM warranty. Not flight-certified.',
    generated_at: new Date().toISOString(),
  };
}
