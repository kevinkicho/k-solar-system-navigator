/**
 * Educational flight-ops helpers (light-time, ops gates, OEM-like export).
 *
 * NOT flight-certified. NOT range safety. NOT operational OD.
 * Provides an ops-workflow *training* surface on top of HELIOS concept-grade physics.
 */

import { AU, DAY } from '../constants.js';
import { bodyId } from '../data/catalog.js';

/** Speed of light (m/s). */
export const C_LIGHT = 299792458;

/**
 * One-way light time for a heliocentric distance (seconds).
 * @param {number} r_AU
 */
export function lightTimeSeconds(r_AU) {
  if (!(r_AU > 0) || !Number.isFinite(r_AU)) return null;
  return (r_AU * AU) / C_LIGHT;
}

export function formatLightTime(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  if (sec < 60) return `${sec.toFixed(2)} s`;
  if (sec < 3600) return `${(sec / 60).toFixed(2)} min`;
  return `${(sec / 3600).toFixed(3)} h`;
}

/**
 * Stellar-aberration angle sketch: θ ≈ v/c (rad) for transverse motion.
 * Educational magnitude only — not full IAU aberration or planetary LT iteration.
 * @param {number} v_m_s speed relative to solar-system barycenter class
 * @returns {{ theta_rad: number, theta_arcsec: number, theta_deg: number }|null}
 */
export function stellarAberrationSketch(v_m_s) {
  if (!(v_m_s > 0) || !Number.isFinite(v_m_s)) return null;
  const theta = v_m_s / C_LIGHT;
  return {
    theta_rad: theta,
    theta_deg: theta * (180 / Math.PI),
    theta_arcsec: theta * (180 / Math.PI) * 3600,
    v_m_s,
    note: 'Stellar-aberration class angle θ≈v/c — educational magnitude only, not applied to Need.',
  };
}

/**
 * Educational geometric vs apparent note (+ aberration magnitude sketch).
 * @param {object} td transfer data
 */
export function lightTimeSummary(td) {
  if (!td) return null;
  const rDep = td.dep3D
    ? Math.hypot(td.dep3D.x, td.dep3D.y, td.dep3D.z)
    : null;
  const rArr = td.arr3D
    ? Math.hypot(td.arr3D.x, td.arr3D.y, td.arr3D.z)
    : null;
  const ltDep = rDep != null ? lightTimeSeconds(rDep) : null;
  const ltArr = rArr != null ? lightTimeSeconds(rArr) : null;
  // Typical heliocentric speeds ~30 km/s Earth, ~24 km/s Mars class
  const vDep = td.v1_lambert
    ? Math.hypot(td.v1_lambert[0], td.v1_lambert[1], td.v1_lambert[2])
    : 30000;
  const vArr = td.v2_lambert
    ? Math.hypot(td.v2_lambert[0], td.v2_lambert[1], td.v2_lambert[2])
    : 24000;
  const abDep = stellarAberrationSketch(vDep);
  const abArr = stellarAberrationSketch(vArr);
  const tof = td.transferTime > 0 ? td.transferTime : null;
  // Sun–Earth–craft class one-way at 1 AU ≈ 499 s
  return {
    r_dep_AU: rDep,
    r_arr_AU: rArr,
    lt_dep_s: ltDep,
    lt_arr_s: ltArr,
    lt_dep_label: formatLightTime(ltDep),
    lt_arr_label: formatLightTime(ltArr),
    lt_frac_tof: (ltArr != null && tof) ? ltArr / tof : null,
    aberration_dep: abDep,
    aberration_arr: abArr,
    aberration_dep_arcsec: abDep?.theta_arcsec ?? null,
    aberration_arr_arcsec: abArr?.theta_arcsec ?? null,
    note: 'One-way geometric light time at heliocentric r + θ≈v/c aberration sketch — not full LT iteration / OD.',
  };
}

/**
 * Full LT / aberration analysis package for OPS board (always safe to display).
 * @param {object} td
 */
export function lightTimeAberrationAnalysis(td) {
  const sum = lightTimeSummary(td);
  if (!sum) return null;
  const alt = lightTimeAlternateSketch(td);
  return {
    ...sum,
    tof_sketch: alt,
    applied_to_need: false,
    product_class: 'preliminary-not-flight-certified',
    summary_line:
      `LT arr ${sum.lt_arr_label || '—'} · ab ~${sum.aberration_arr_arcsec != null ? sum.aberration_arr_arcsec.toFixed(1) : '—'}″ class · geometric states (NONE)`,
  };
}

/**
 * Educational light-time alternate Need sketch.
 * Shifts arrival epoch by one-way LT at arrival r and re-solves Δv if caller provides recompute.
 * Here: report Δt and fractional TOF impact only — full re-Lambert is opt-in via routing.
 *
 * @param {object} td
 * @returns {{ lt_arr_s, tof_s, tof_adj_s, frac_tof, note }|null}
 */
export function lightTimeAlternateSketch(td) {
  if (!td || !(td.transferTime > 0)) return null;
  const sum = lightTimeSummary(td);
  if (!sum?.lt_arr_s) return null;
  const tof = td.transferTime;
  const tofAdj = tof + sum.lt_arr_s; // arrive later by LT (display-only sketch)
  return {
    lt_arr_s: sum.lt_arr_s,
    lt_arr_label: sum.lt_arr_label,
    tof_s: tof,
    tof_adj_s: tofAdj,
    tof_days: tof / DAY,
    tof_adj_days: tofAdj / DAY,
    frac_tof: sum.lt_arr_s / tof,
    note: 'LT-adjusted TOF sketch only — not stellar aberration, not OD. Enable “LT Need compare” for alternate Lambert Δv.',
  };
}

/**
 * Ops-education gates appended to Plan Dossier when flightOpsMode is on.
 * Always non-certifying.
 * @returns {Array<object>}
 */
export function buildFlightOpsGates(td, ctx = {}) {
  const gates = [];
  gates.push({
    code: 'G_OPS_NOT_CERTIFIED',
    level: 'warn',
    title: 'Not flight-certified',
    detail: 'HELIOS flight-ops mode is educational workflow training — not range safety, not mission assurance, not certified SPICE OD.',
  });

  const meta = ctx.sampleMeta;
  const isSpice = meta && (
    meta.bake_source === 'spice-de440s'
    || /spice|de440/i.test(meta.source || '')
  );
  gates.push({
    code: 'G_OPS_KERNEL_SOURCE',
    level: isSpice ? 'pass' : 'warn',
    title: isSpice ? 'DE/SPICE-class offline table loaded' : 'Planning not using SPICE kernel runtime',
    detail: isSpice
      ? `Offline table bake_source=${meta.bake_source || meta.source} (precomputed from kernels — browser does not load .bsp at runtime).`
      : 'Enable L3-plan by baking DE440s samples (python scripts/build-ephemeris-from-spice.py) or use L2-plan/Horizons.',
  });

  const lt = lightTimeSummary(td);
  if (lt?.lt_arr_s != null) {
    gates.push({
      code: 'G_OPS_LIGHT_TIME',
      level: 'pass',
      title: `One-way LT (arr r) ≈ ${lt.lt_arr_label}`,
      detail: lt.note,
    });
  }

  if (ctx.horizonsInject) {
    gates.push({
      code: 'G_OPS_LIVE_HORIZONS',
      level: 'warn',
      title: 'Live Horizons inject active',
      detail: 'Network endpoint inject is educational and not a closed-loop navigation system.',
    });
  }

  const ab = lt?.aberration_arr_arcsec;
  gates.push({
    code: 'G_OPS_ABERRATION',
    level: 'warn',
    title: ab != null
      ? `Aberration sketch ~${ab.toFixed(1)}″ class (not applied to Need)`
      : 'Aberration / LT correction incomplete',
    detail: 'Lambert Need uses geometric states (NONE-class). Full stellar/planetary aberration and LT-converged ephemeris not applied to Δv.',
  });

  if (lt?.lt_frac_tof != null && lt.lt_frac_tof > 1e-6) {
    gates.push({
      code: 'G_OPS_LT_TOF_FRACTION',
      level: lt.lt_frac_tof > 0.001 ? 'warn' : 'pass',
      title: `LT / TOF ≈ ${(lt.lt_frac_tof * 100).toFixed(3)}%`,
      detail: 'One-way light time as fraction of transfer TOF — educational scale check only.',
    });
  }

  return gates;
}

/**
 * Minimal CCSDS OEM-like text (educational). Not a validated CCSDS product.
 * @param {object} td
 * @param {Array<{t:number,x:number,y:number,z:number}>} samples scene AU
 */
export function buildEducationalOem(td, samples = []) {
  const o = td?.body1?.name || 'ORIGIN';
  const d = td?.body2?.name || 'DEST';
  const lines = [
    'CCSDS_OEM_VERS = 2.0',
    'COMMENT Educational HELIOS OEM-like export — NOT a CCSDS-validated flight product',
    'COMMENT Geometric heliocentric scene-frame AU states; not Earth-fixed, not OD',
    `CREATION_DATE = ${new Date().toISOString()}`,
    'ORIGINATOR = HELIOS-EDU',
    '',
    'META_START',
    `OBJECT_NAME = HELIOS_SHIP_${o}_TO_${d}`,
    `OBJECT_ID = HELIOS-${bodyId(td?.body1) || 'x'}-${bodyId(td?.body2) || 'y'}`,
    'CENTER_NAME = SOLAR_SYSTEM_BARYCENTER',
    'REF_FRAME = HELIOS_SCENE_ECLIPTIC_LIKE',
    'TIME_SYSTEM = UTC',
    `START_TIME = ${td?.departure_utc || td?.departureSimTime || 'UNKNOWN'}`,
    `STOP_TIME = ${td?.arrival_utc || td?.arrivalSimTime || 'UNKNOWN'}`,
    'META_STOP',
    '',
  ];
  // If samples provided as path knots with t
  for (const s of samples.slice(0, 500)) {
    const epoch = s.t != null
      ? new Date(Date.UTC(2000, 0, 1, 12) + s.t * 1000).toISOString()
      : 'UNKNOWN';
    // Convert AU → km for OEM-like numbers
    const x = (s.x * AU) / 1000;
    const y = (s.y * AU) / 1000;
    const z = (s.z * AU) / 1000;
    lines.push(`${epoch} ${x.toExponential(9)} ${y.toExponential(9)} ${z.toExponential(9)}`);
  }
  if (!samples.length) {
    lines.push('COMMENT No path samples attached — re-export after Compute');
  }
  lines.push('');
  return lines.join('\n');
}

export function opsDisclaimer() {
  return 'HELIOS flight-ops mode is educational only: not certified for flight, not range safety, not operational SPICE/OD.';
}

// silence unused
void DAY;
