/**
 * Path truth snapshot — scene vs Need geometry, path-end vs live destination.
 * Pure analysis helpers for HUD / residual / AI. Not flight-certified.
 */

import { getBodyPosition3D } from './kepler.js';
import { sampleTransferPathAtTime } from './transfer-path.js';
import { scenePathGeometry, pathSampleGeometry, effectivePathGeometry } from '../state.js';

/**
 * @param {object} td transferData
 * @param {object} appState
 * @param {number} [simTime] current sim time (default: arrival for end residual)
 */
export function buildPathTruth(td, appState = {}, simTime = null) {
  if (!td?.body1 || !td?.body2) {
    return {
      ok: false,
      product_class: 'preliminary-not-flight-certified',
      note: 'No transfer — compute a route first.',
    };
  }

  const sceneGeom = scenePathGeometry();
  const needGeom = pathSampleGeometry();
  const pathGeomSetting = effectivePathGeometry(appState.pathGeometry);
  const displayMode = appState.display?.mode || 'cinematic';
  const tArr = td.arrivalSimTime;
  const tDep = td.departureSimTime;
  const tNow = simTime != null ? simTime : tArr;

  const exaggerate = sceneGeom === 'visual';
  const pathEnd = sampleTransferPathAtTime(td, tArr, {
    geometry: sceneGeom,
    exaggerate,
    offsetPolicy: appState.pathOffsetPolicy || td.pathOffsetPolicy || 'time_varying',
  });
  const liveDest = getBodyPosition3D(td.body2, tNow, exaggerate);
  // Live body in scene frame: planning positions are helio; path samples are scene.
  // For residual, compare helio if we have r_helio on path end.
  let pathEndVsLive_AU = null;
  if (pathEnd?.r_helio && liveDest) {
    pathEndVsLive_AU = Math.hypot(
      pathEnd.r_helio.x - liveDest.x,
      pathEnd.r_helio.y - liveDest.y,
      pathEnd.r_helio.z - liveDest.z,
    );
  } else if (pathEnd && liveDest) {
    // Rough scene residual (includes sun offset mismatch risk)
    pathEndVsLive_AU = Math.hypot(
      pathEnd.x - liveDest.x,
      pathEnd.y - liveDest.y,
      pathEnd.z - liveDest.z,
    );
  }

  // At arrival epoch, dest body at arrival (helio, matching scene exaggerate)
  const destAtArrival = tArr != null
    ? getBodyPosition3D(td.body2, tArr, exaggerate)
    : null;
  let pathEndVsArrivalBody_AU = null;
  if (pathEnd?.r_helio && destAtArrival) {
    pathEndVsArrivalBody_AU = Math.hypot(
      pathEnd.r_helio.x - destAtArrival.x,
      pathEnd.r_helio.y - destAtArrival.y,
      pathEnd.r_helio.z - destAtArrival.z,
    );
  }

  const lines = [
    `Display: ${displayMode} · scene path: ${sceneGeom} · Need path: ${needGeom} · setting: ${pathGeomSetting}`,
    sceneGeom === 'visual'
      ? 'Fly study follows visual (exaggerated-incl.) path to match planet tilts. Need/Δv stay physical.'
      : 'Fly study follows physical path (Need plane). Numbers and line share real inclinations.',
    `ARR epoch path end vs destination at ARR: ${
      pathEndVsArrivalBody_AU != null
        ? `${pathEndVsArrivalBody_AU.toExponential(2)} AU`
        : '—'
    }`,
    `ARR path end vs destination body *now* (often large): ${
      pathEndVsLive_AU != null ? `${pathEndVsLive_AU.toExponential(2)} AU` : '—'
    }`,
    'Ghost AT ARRIVAL = path endpoint epoch — not the live planet mesh.',
  ];

  return {
    ok: true,
    product_class: 'preliminary-not-flight-certified',
    displayMode,
    scenePathGeometry: sceneGeom,
    needPathGeometry: needGeom,
    pathGeometrySetting: pathGeomSetting,
    pathEndVsLive_AU,
    pathEndVsArrivalBody_AU,
    arrivalSimTime: tArr,
    departureSimTime: tDep,
    originName: td.body1?.name || null,
    destName: td.body2?.name || null,
    lines,
    note: 'Path truth is educational. Live destination is not the transfer endpoint unless sim time = arrival.',
    generated_at: new Date().toISOString(),
  };
}

/**
 * One-line HUD text.
 */
export function formatPathTruthLine(truth) {
  if (!truth?.ok) return 'PATH · compute a transfer for path truth';
  const miss = truth.pathEndVsArrivalBody_AU;
  const missStr = miss != null && isFinite(miss)
    ? (miss < 1e-4 ? 'ARR match OK' : `ARR residual ${miss.toExponential(1)} AU`)
    : 'ARR residual —';
  return `PATH · scene=${truth.scenePathGeometry} · Need=${truth.needPathGeometry} · ${missStr} · fly study → ARR ghost (not live ${truth.destName || 'dest'})`;
}
