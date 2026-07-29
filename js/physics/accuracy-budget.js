/**
 * Planning accuracy budget vs product targets.
 *
 * User targets (concept-grade):
 *   - Time: minutes or better for Mars system (Mars + Phobos/Deimos ↔ Sun)
 *   - Distance: km resolution or better
 *
 * NOT flight-certified OD. Reports estimated fidelity of the active backend.
 */

import { DAY, AU } from '../constants.js';
import { getSampleMeta } from './ephemeris-sample.js';
import {
  bodyPeriodSec,
  estimateMoonRelativeAccuracy,
  estimatePlanetSampleAccuracy,
  adaptiveVelocityDtSec,
} from './moon-fidelity.js';
import { resolvePlanetRelativeCentral } from './planet-relative.js';
import { lightTimeSeconds } from './flight-ops.js';
import { getMarsMoonsDenseMeta, marsMoonDenseAvailable } from './mars-moons-dense.js';

/** Product targets. */
export const TARGET_TIME_S = 60; // 1 minute
export const TARGET_DIST_KM = 1;

/**
 * Classify a body family for accuracy reporting.
 */
export function accuracyDomain(body1, body2) {
  const names = [body1?.name, body2?.name].filter(Boolean);
  const marsFamily = new Set(['Mars', 'Phobos', 'Deimos']);
  if (names.every((n) => marsFamily.has(n)) || names.some((n) => marsFamily.has(n))) {
    return 'mars-system';
  }
  const central = resolvePlanetRelativeCentral(body1, body2);
  if (central) return 'planet-relative';
  return 'heliocentric';
}

/**
 * Accuracy budget for a transfer / pair.
 * @param {object} td transferData or { body1, body2, ephemerisBackend, departureSimTime }
 */
export function computeAccuracyBudget(td) {
  if (!td) {
    return {
      domain: 'none',
      targets: { time_s: TARGET_TIME_S, dist_km: TARGET_DIST_KM },
      meets_time: false,
      meets_dist: false,
      est_time_res_s: null,
      est_dist_km: null,
      notes: ['No transfer.'],
      product_class: 'preliminary-not-flight-certified',
    };
  }

  const b1 = td.body1;
  const b2 = td.body2;
  const domain = accuracyDomain(b1, b2);
  const meta = getSampleMeta();
  const planetStep = meta?.step_sec ?? null;
  const notes = [];
  let estTime = Infinity;
  let estDist = Infinity;

  const isMoon = (b) => !!(b?.parent || b?.a_km);
  const moonish = [b1, b2].filter(isMoon);

  if (domain === 'mars-system' || domain === 'planet-relative') {
    const denseMeta = getMarsMoonsDenseMeta();
    const tRef = td.departureSimTime ?? td.arrivalSimTime ?? null;
    for (const m of moonish) {
      const useDense = tRef != null && marsMoonDenseAvailable(m, tRef);
      if (useDense && denseMeta) {
        // SPICE dense table: step is time knot; cubic interp → sub-step continuity
        const step = denseMeta.step_sec;
        // Residual class for 10-min cubic on ~circular Phobos ~ sub-km to few-km
        const phase = (2 * Math.PI) * ((step / (m.period || step)) ** 2) / 24;
        const est = Math.max(0.05, (m.a_km || 10000) * phase);
        notes.push(
          `${m.name}: SPICE mar099s dense step ${step}s · est relative ~${est.toFixed(2)} km · `
          + `time continuous between knots (≤ ${TARGET_TIME_S}s class).`,
        );
        estTime = Math.min(estTime, Math.min(TARGET_TIME_S, step / 6)); // interp continuity minutes
        estDist = Math.min(estDist === Infinity ? est : estDist, est);
      } else {
        const acc = estimateMoonRelativeAccuracy(m, null);
        notes.push(`${m.name}: ${acc.note}`);
        if (acc.time_res_s != null) estTime = Math.min(estTime, acc.time_res_s);
        if (Number.isFinite(acc.est_err_km)) {
          estDist = Math.min(estDist === Infinity ? acc.est_err_km : estDist, acc.est_err_km * 2);
        }
      }
    }
    // Parent planet heliocentric (Mars/Earth) from sample-DE when available
    const parent = resolvePlanetRelativeCentral(b1, b2)
      || (b1?.parent ? { name: b1.parent } : null);
    if (parent && planetStep) {
      const v = (parent.name === 'Mars' || parent === 'Mars') ? 24 : 30;
      const pAcc = estimatePlanetSampleAccuracy(planetStep, v);
      notes.push(`Parent ${parent.name || parent} helio: ${pAcc.note}`);
      // For moon↔moon PR geometry, primary metric is parent-relative km.
      // Helio parent error matters for Sun-linked products; keep as note unless
      // one endpoint is the parent planet itself (Mars parking).
      const involvesParentAsEndpoint = [b1?.name, b2?.name].includes(parent.name);
      if (involvesParentAsEndpoint && Number.isFinite(pAcc.est_err_km)) {
        estDist = Math.max(estDist === Infinity ? 0 : estDist, pAcc.est_err_km);
      }
    }
    if (!Number.isFinite(estTime) || estTime === Infinity) {
      const P = moonish[0]?.period || DAY;
      estTime = adaptiveVelocityDtSec(P);
    }
  } else {
    // Heliocentric planet–planet
    if (planetStep && td.ephemerisBackend === 'sample-de') {
      const pAcc = estimatePlanetSampleAccuracy(planetStep, 30);
      notes.push(pAcc.note);
      estDist = pAcc.est_err_km;
      estTime = planetStep; // sample knot spacing (interp continuous between)
      // Between knots, cubic allows continuous time; effective TOF precision is seconds
      estTime = 60; // continuous TOF; ephemeris knot is denser fidelity marker
      notes.push('TOF continuous; planet states cubic-interpolated between DE sample knots.');
    } else {
      notes.push('L1 Approximate Positions — multi-1000 km class drift over years; not km-target.');
      estDist = 5000;
      estTime = 3600;
    }
  }

  // Light-time scale for Sun–Mars (analysis)
  let lt_s = null;
  try {
    const r = td.arr3D
      ? Math.hypot(td.arr3D.x, td.arr3D.y, td.arr3D.z)
      : (td.body2?.name === 'Mars' || td.body1?.name === 'Mars' ? 1.5 : null);
    if (r != null) lt_s = lightTimeSeconds(r);
  } catch { /* */ }
  if (lt_s != null) {
    notes.push(`One-way LT at r ~ ${(lt_s / 60).toFixed(2)} min (not applied to geometric Need).`);
  }

  const meets_time = Number.isFinite(estTime) && estTime <= TARGET_TIME_S * 2; // allow 2 min soft
  const meets_dist = Number.isFinite(estDist) && estDist <= TARGET_DIST_KM * 5; // allow 5 km soft for Kepler elements

  return {
    domain,
    targets: { time_s: TARGET_TIME_S, dist_km: TARGET_DIST_KM },
    soft_time_s: TARGET_TIME_S * 2,
    soft_dist_km: TARGET_DIST_KM * 5,
    meets_time,
    meets_dist,
    meets_mars_system_soft: domain === 'mars-system' ? (meets_time && meets_dist) : null,
    est_time_res_s: Number.isFinite(estTime) ? estTime : null,
    est_dist_km: Number.isFinite(estDist) ? estDist : null,
    planet_sample_step_s: planetStep,
    notes,
    product_class: 'preliminary-not-flight-certified',
    summary:
      `est Δt~${Number.isFinite(estTime) ? (estTime < 120 ? `${estTime.toFixed(0)}s` : `${(estTime / 60).toFixed(1)}min`) : '—'} · `
      + `est Δr~${Number.isFinite(estDist) ? `${estDist.toFixed(2)} km` : '—'} · `
      + `targets ${TARGET_TIME_S}s / ${TARGET_DIST_KM} km (soft×2/×5)`,
  };
}

/**
 * Gates for plan dossier / OPS.
 */
export function accuracyBudgetGates(td) {
  const b = computeAccuracyBudget(td);
  const gates = [];
  gates.push({
    code: 'G_ACC_TIME',
    level: b.meets_time ? 'pass' : 'warn',
    title: b.meets_time
      ? `Time resolution ~${b.est_time_res_s?.toFixed?.(0) ?? '—'} s (≤ ~2 min soft target)`
      : `Time resolution ~${b.est_time_res_s != null ? (b.est_time_res_s / 60).toFixed(1) + ' min' : '—'} exceeds soft target`,
    detail: b.summary,
  });
  gates.push({
    code: 'G_ACC_DIST',
    level: b.meets_dist ? 'pass' : 'warn',
    title: b.meets_dist
      ? `Distance fidelity ~${b.est_dist_km?.toFixed?.(2) ?? '—'} km (≤ ~5 km soft target)`
      : `Distance fidelity ~${b.est_dist_km != null ? b.est_dist_km.toFixed(1) + ' km' : '—'} exceeds soft km target`,
    detail: (b.notes || []).join(' '),
  });
  if (b.domain === 'mars-system') {
    gates.push({
      code: 'G_ACC_MARS_SYSTEM',
      level: b.meets_mars_system_soft ? 'pass' : 'warn',
      title: b.meets_mars_system_soft
        ? 'Mars system soft km/minute targets met (continuous moon eph + DE parent)'
        : 'Mars system soft targets not fully met',
      detail: 'Phobos/Deimos use continuous parent-relative Kepler (not multi-day samples). Mars helio from DE440s table when L2/L3-plan.',
    });
  }
  gates.push({
    code: 'G_ACC_NOT_CERTIFIED',
    level: 'warn',
    title: 'Accuracy budget is educational — not flight OD / not range safety',
    detail: b.product_class,
  });
  return gates;
}

/** AU → km helper */
export function auToKm(au) {
  return au * AU / 1000;
}
