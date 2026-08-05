/**
 * PlanResult boundary — structured solve + assessment from transferData.
 * Packages/AI read this; never treat stored Δv as authority without recompute.
 */

import { state } from '../state.js';
import { buildPlanRequestFromState, digestPlanSeed } from './plan-seed.js';
import { buildPathTruth } from '../physics/path-truth.js';

/**
 * @param {object|null} [td]
 * @param {object} [appState]
 * @returns {object|null}
 */
export function buildPlanResult(td = state.transferData, appState = state) {
  if (!td) return null;
  const seed = buildPlanRequestFromState(appState, td);
  const need = td.dossier?.need || td.need || null;
  const margin = td.dossier?.margin || td.margin || null;
  const dossier = td.dossier || null;

  let pathTruth = null;
  try {
    pathTruth = buildPathTruth(td, appState);
  } catch { /* */ }

  const needDv = need?.need_dv_m_s ?? need?.need ?? null;
  const marginDv = margin?.margin_dv_m_s ?? margin?.margin ?? null;

  return {
    schema: 1,
    product_class: 'preliminary-not-flight-certified',
    note: 'Recompute from plan_request for authority — stored Δv is digest only.',
    computedAt: new Date().toISOString(),
    seedDigest: digestPlanSeed(seed),
    plan_request: seed,
    solve: {
      ok: !!(td.lambertOk || td.allLegsOk || td.isMultiLeg),
      isMultiLeg: !!td.isMultiLeg,
      planetRelative: !!td.planetRelative,
      departureSimTime: td.departureSimTime ?? null,
      arrivalSimTime: td.arrivalSimTime ?? null,
      transferTime_s: td.transferTime ?? null,
      origin: td.body1?.name || seed?.o || null,
      destination: td.body2?.name || seed?.d || null,
      dvTotal_lambert_m_s: td.dvTotal_lambert ?? td.dvTotalMultiLeg ?? null,
      visualFallback: td.visualFallback || null,
    },
    assessment: {
      need_dv_m_s: needDv,
      margin_dv_m_s: marginDv,
      feasible: margin?.feasible ?? null,
      dossier_status: dossier?.status ?? null,
      mission_ready: dossier?.mission_ready ?? null,
      launch_enabled: dossier?.launch_enabled ?? dossier?.mission_ready ?? null,
      fail_count: (dossier?.gates || []).filter((g) => g.level === 'fail').length,
      warn_count: (dossier?.gates || []).filter((g) => g.level === 'warn').length,
      confidence_0_100: dossier?.confidence_0_100 ?? null,
    },
    displayHints: {
      productMode: appState.productMode || 'present',
      pathTruth: pathTruth?.ok ? {
        scenePathGeometry: pathTruth.scenePathGeometry,
        pathEndVsArrivalBody_AU: pathTruth.pathEndVsArrivalBody_AU,
        line: null,
      } : null,
      scenePathGeometry: td.scenePathGeometry || null,
    },
  };
}

/** Compact digest for package manifests / share. */
export function planResultDigest(result) {
  if (!result) return null;
  return {
    seedDigest: result.seedDigest,
    need_dv_m_s: result.assessment?.need_dv_m_s ?? null,
    mission_ready: result.assessment?.mission_ready ?? null,
    dossier_status: result.assessment?.dossier_status ?? null,
    computedAt: result.computedAt,
  };
}
