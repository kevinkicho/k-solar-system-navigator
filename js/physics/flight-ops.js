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
 * Educational geometric vs apparent note (no full aberration model).
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
  // Sun–Earth–craft class one-way at 1 AU ≈ 499 s
  return {
    r_dep_AU: rDep,
    r_arr_AU: rArr,
    lt_dep_s: ltDep,
    lt_arr_s: ltArr,
    lt_dep_label: formatLightTime(ltDep),
    lt_arr_label: formatLightTime(ltArr),
    note: 'One-way geometric light time at heliocentric r only — not full light-time/aberration/OD solution.',
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

  gates.push({
    code: 'G_OPS_ABERRATION',
    level: 'warn',
    title: 'Aberration / LT correction incomplete',
    detail: 'Lambert Need uses geometric states (NONE-class). Full stellar/planetary aberration not applied.',
  });

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
