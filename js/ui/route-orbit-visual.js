/**
 * Scene-side transfer orbit visuals: dashed transfer lines, date markers,
 * depart/arrive/flyby ghosts and ring markers.
 *
 * Phases 1–4: shared transfer-path pipeline; pathGeometry scene|physical|both;
 * flightPathMode static|rebuild|trail_only; optional adaptive refine worker;
 * optional n-body residual overlay.
 */
import * as THREE from 'three';
import { AU, DAY, LEG_COLORS } from '../constants.js';
import { state, bumpPathRefineRequestId } from '../state.js';
import { getBodyPosition3D, getSunBarycentricOffset } from '../physics/kepler.js';
import {
  buildTransferPathSamples, buildLegPathSamples, sampleTransferPathAtTime,
  stateAtDt,
} from '../physics/transfer-path.js';
import { parentFrameToHelioAU } from '../physics/routing.js';
import {
  addDateMarker, addFlybyGhost, addLegLine, clearDateMarkers,
  clearMultiLegVisuals, hideArrivalGhost, hideDepartureGhost,
  setArrivalGhost, setDepartureGhost, setTransferLine, setPhysicalTransferLine,
  transferMarkers,
} from '../scene/transfer-visual.js';
import { scene } from '../scene/setup.js';
import { isSchematic } from '../display-scale.js';

let pathRefineWorker = null;
let nbodyWorker = null;
let nbodyLine = null;

function pathOptsFromState(td, extra = {}) {
  const longWay = extra.longWay != null
    ? extra.longWay
    : (td.visualLongWay != null ? td.visualLongWay : td.longWay);
  const geom = extra.geometry
    ?? (state.pathGeometry === 'physical' ? 'physical' : 'visual');
  return {
    offsetPolicy: td.pathOffsetPolicy || state.pathOffsetPolicy || 'time_varying',
    sampleMode: state.pathSampleMode || 'equal_time',
    geometry: geom,
    nSamples: extra.nSamples ?? 320,
    longWay,
    adaptive: !!(extra.adaptive ?? state.pathAccuracy?.adaptiveSampling),
    exaggerate: extra.exaggerate,
    ...extra,
  };
}

function samplesToLinePoints(samples) {
  return samples.map((p) => new THREE.Vector3(p.x, p.y, p.z));
}

function makeDashedLine(drawPts, color, opacity = 0.8) {
  let pathLen = 0;
  for (let i = 1; i < drawPts.length; i++) pathLen += drawPts[i].distanceTo(drawPts[i - 1]);
  const dash = Math.min(0.5, Math.max(0.1, pathLen / 60));
  const geo = new THREE.BufferGeometry().setFromPoints(drawPts);
  const mat = new THREE.LineDashedMaterial({
    color, dashSize: dash, gapSize: dash * 0.55,
    transparent: true, opacity,
  });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  return line;
}

function shouldHidePathForTrailOnly() {
  return state.flightPathMode === 'trail_only'
    && state.mission?.active
    && !state.mission?.arrived;
}

export function updateTransferOrbitVisual() {
  setTransferLine(null);
  setPhysicalTransferLine(null);
  clearMultiLegVisuals();
  clearDateMarkers();
  clearNbodyLine();
  transferMarkers.depart.visible = false;
  transferMarkers.arrive.visible = false;
  hideArrivalGhost();
  hideDepartureGhost();
  if (!state.showTransferOrbit || !state.transferData) return;

  // trail_only: hide future dashed path during active mission
  if (shouldHidePathForTrailOnly()) {
    placeEndpointGhostsOnly(state.transferData);
    return;
  }

  const td = state.transferData;
  if (td.isMultiLeg) {
    renderMultiLegVisual();
    return;
  }

  const geomMode = state.pathGeometry || 'visual';
  const depT = td.departureSimTime;
  const arrT = td.arrivalSimTime;
  const dep = td.dep3D || getBodyPosition3D(td.body1, depT);
  const arr = td.arr3D || getBodyPosition3D(td.body2, arrT);

  // Primary (scene/visual or physical)
  const primaryGeom = geomMode === 'physical' ? 'physical' : 'visual';
  const opts = pathOptsFromState(td, {
    geometry: primaryGeom,
    exaggerate: primaryGeom === 'physical' ? false : true,
    offsetPolicy: primaryGeom === 'physical' && isSchematic()
      ? (state.pathOffsetPolicy || 'time_varying')
      : (primaryGeom === 'physical'
        ? 'time_varying' // still use s(t); physical uses real-I orbit
        : (state.pathOffsetPolicy || 'time_varying')),
  });
  // Physical path uses real inclination orbit; sun offset still educational
  if (primaryGeom === 'physical') {
    opts.exaggerate = false;
  }

  const built = buildTransferPathSamples(td, opts);
  if (built.fallback === 'physical') td.visualFallback = 'physical';
  else if (built.fallback === 'cosine') td.visualFallback = 'cosine';

  const drawPts = samplesToLinePoints(built.points);
  if (drawPts.length >= 2) {
    const color = primaryGeom === 'physical' ? 0x4fc3f7 : 0xff9800;
    setTransferLine(makeDashedLine(drawPts, color, 0.8));
  }

  // Dual overlay: physical geometry + physical s (k=1 via exaggerate false on offset)
  if (geomMode === 'both' && td.orbitPhysical) {
    const physOpts = pathOptsFromState(td, {
      geometry: 'physical',
      exaggerate: false,
      offsetPolicy: 'time_varying',
      nSamples: 256,
    });
    // Force physical offset exaggeration off
    const builtP = buildTransferPathSamples(td, {
      ...physOpts,
      exaggerate: false,
    });
    // Re-apply offset with exaggerate=false explicitly in applySunOffset via ctx
    const ptsP = samplesToLinePoints(builtP.points.map((p) => {
      // samples already offset with exaggerate from opts; rebuild with force
      return p;
    }));
    if (ptsP.length >= 2) {
      setPhysicalTransferLine(makeDashedLine(ptsP, 0x81d4fa, 0.55));
    }
  }

  placeEndpointMarkers(td, dep, arr, depT, arrT, drawPts);

  if (built.orbitUsed && td.transferTime / DAY < 3000) {
    addDateMarkersAlongOrbit(td, built.orbitUsed, depT, td.transferTime, 0xffd54f, opts);
  }

  // Progressive adaptive refine (PR8) when flag on
  if (state.pathAccuracy?.adaptiveSampling && built.orbitUsed) {
    schedulePathRefine(td, opts);
  }

  // N-body residual overlay (PR10)
  if (state.pathAccuracy?.nbodyOverlay && !state.classroomMode && built.orbitUsed) {
    scheduleNbodyOverlay(td);
  }
}

function placeEndpointMarkers(td, dep, arr, depT, arrT, drawPts) {
  const markerPol = state.endpointMarkerPolicy || 'epoch_true';
  let depMark, arrMark;
  if (markerPol === 'match_path_end' && drawPts?.length >= 2) {
    const p0 = drawPts[0], pN = drawPts[drawPts.length - 1];
    depMark = { x: p0.x, y: p0.y, z: p0.z };
    arrMark = { x: pN.x, y: pN.y, z: pN.z };
  } else {
    const depOff = getSunBarycentricOffset(depT);
    const arrOff = getSunBarycentricOffset(arrT);
    depMark = { x: dep.x + depOff.x, y: dep.y + depOff.y, z: dep.z + depOff.z };
    arrMark = { x: arr.x + arrOff.x, y: arr.y + arrOff.y, z: arr.z + arrOff.z };
  }
  transferMarkers.depart.position.set(depMark.x, depMark.y, depMark.z);
  transferMarkers.depart.visible = true;
  transferMarkers.arrive.position.set(arrMark.x, arrMark.y, arrMark.z);
  transferMarkers.arrive.visible = true;
  setDepartureGhost({
    x: depMark.x, y: depMark.y, z: depMark.z,
    radius: (td.body1.displayRadius || 0.02) * 1.6,
    color: parseInt(String(td.body1.color || '#00e676').replace('#', ''), 16),
    label: 'AT DEPARTURE',
  });
  setArrivalGhost({
    x: arrMark.x, y: arrMark.y, z: arrMark.z,
    radius: (td.body2.displayRadius || 0.02) * 1.6,
    color: parseInt(String(td.body2.color || '#ff9800').replace('#', ''), 16),
    label: 'AT ARRIVAL',
  });
}

function placeEndpointGhostsOnly(td) {
  if (td.isMultiLeg) return;
  const depT = td.departureSimTime;
  const arrT = td.arrivalSimTime;
  const dep = td.dep3D || getBodyPosition3D(td.body1, depT);
  const arr = td.arr3D || getBodyPosition3D(td.body2, arrT);
  placeEndpointMarkers(td, dep, arr, depT, arrT, null);
}

function chooseTickIntervals(transferTimeDays) {
  if (transferTimeDays < 2) return { minor: 0.25, major: 1 };
  if (transferTimeDays < 14) return { minor: 1, major: 3 };
  if (transferTimeDays < 90) return { minor: 7, major: 30 };
  if (transferTimeDays < 365) return { minor: 30, major: 90 };
  if (transferTimeDays < 1500) return { minor: 60, major: 180 };
  return { minor: 180, major: 360 };
}

function addDateMarkersAlongOrbit(td, orbit, departSimTime, transferTime, color, pathOpts) {
  const { minor, major } = chooseTickIntervals(transferTime / DAY);
  for (let day = minor; day < transferTime / DAY; day += minor) {
    const dt = day * DAY;
    if (dt >= transferTime) break;
    const tAbs = departSimTime + dt;
    const sample = sampleTransferPathAtTime(td, tAbs, pathOpts);
    if (!sample) {
      const st = stateAtDt(orbit, dt);
      if (!st) continue;
      let x = st.r[0] / AU, y = st.r[1] / AU, z = st.r[2] / AU;
      if (td.planetRelative && td.centralBody) {
        const h = parentFrameToHelioAU(st.r, td.centralBody, tAbs, true);
        if (!h) continue;
        x = h.x; y = h.y; z = h.z;
      }
      const off = getSunBarycentricOffset(tAbs);
      x += off.x; y += off.y; z += off.z;
      addDateMarker(x, y, z, color, Math.abs(day % major) < 1e-6 || major < 1);
      continue;
    }
    addDateMarker(sample.x, sample.y, sample.z, color, Math.abs(day % major) < 1e-6 || major < 1);
  }
}

function renderMultiLegVisual() {
  const td = state.transferData;
  for (let li = 0; li < td.legs.length; li++) {
    const leg = td.legs[li];
    if (!leg.ok) continue;
    const color = LEG_COLORS[li % LEG_COLORS.length];
    const built = buildLegPathSamples(leg, td, pathOptsFromState(td, {
      nSamples: 160,
      longWay: leg.visualLongWay != null ? leg.visualLongWay : leg.longWay,
    }));
    const points = samplesToLinePoints(built.points);
    if (points.length < 2) continue;
    const line = makeDashedLine(points, color, 0.75);
    addLegLine(line);

    if (li < td.legs.length - 1 && leg.arr3D) {
      const fbBody = td.waypoints?.[li + 1]?.body;
      const off = getSunBarycentricOffset(leg.arriveSimTime);
      addFlybyGhost({
        x: leg.arr3D.x + off.x,
        y: leg.arr3D.y + off.y,
        z: leg.arr3D.z + off.z,
        radius: (fbBody?.displayRadius || 0.02) * 1.4,
        color,
        label: fbBody ? `FLYBY ${fbBody.name}` : 'FLYBY',
      });
    }
  }
  const w0 = td.waypoints?.[0];
  const wN = td.waypoints?.[td.waypoints.length - 1];
  if (w0?.body && td.legs?.[0]?.dep3D) {
    const off = getSunBarycentricOffset(td.departureSimTime);
    const d = td.legs[0].dep3D;
    setDepartureGhost({
      x: d.x + off.x, y: d.y + off.y, z: d.z + off.z,
      radius: (w0.body.displayRadius || 0.02) * 1.6,
      color: parseInt(String(w0.body.color || '#00e676').replace('#', ''), 16),
      label: 'AT DEPARTURE',
    });
  }
  if (wN?.body) {
    const last = [...(td.legs || [])].reverse().find((L) => L.ok);
    if (last?.arr3D) {
      const off = getSunBarycentricOffset(td.arrivalSimTime);
      setArrivalGhost({
        x: last.arr3D.x + off.x, y: last.arr3D.y + off.y, z: last.arr3D.z + off.z,
        radius: (wN.body.displayRadius || 0.02) * 1.6,
        color: parseInt(String(wN.body.color || '#ff9800').replace('#', ''), 16),
        label: 'AT ARRIVAL',
      });
    }
  }
}

/** PR5 rebuild-on-scrub: coalesce to ≥2s wall. */
export function maybeRebuildPathOnScrub() {
  if (state.flightPathMode !== 'rebuild') return;
  if (!state.showTransferOrbit || !state.transferData) return;
  const now = performance.now();
  if (now - (state.lastPathRebuildWallMs || 0) < 2000) return;
  state.lastPathRebuildWallMs = now;
  bumpPathRefineRequestId();
  updateTransferOrbitVisual();
}

function schedulePathRefine(td, opts) {
  const reqId = bumpPathRefineRequestId();
  try {
    if (!pathRefineWorker) {
      pathRefineWorker = new Worker(
        new URL('../workers/path-refine-worker.js', import.meta.url),
        { type: 'module' },
      );
      pathRefineWorker.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || msg.requestId !== state.pathRefineRequestId) return;
        if (msg.type !== 'path-refined' || !msg.points?.length) return;
        if (shouldHidePathForTrailOnly()) return;
        const pts = msg.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
        if (pts.length >= 2) setTransferLine(makeDashedLine(pts, 0xff9800, 0.85));
      };
    }
    // Serialize minimal payload — worker re-samples with adaptive using orbit elements
    pathRefineWorker.postMessage({
      type: 'refine',
      requestId: reqId,
      // Pass enough to rebuild path without full body objects
      tof: td.transferTime,
      tDep: td.departureSimTime,
      longWay: !!td.longWay,
      offsetPolicy: opts.offsetPolicy,
      orbit: serializeOrbit(td.orbit || td.orbitPhysical),
      dep3D: td.dep3D,
      arr3D: td.arr3D,
      nSamples: 128,
      maxSamples: 1024,
    });
  } catch {
    /* workers optional */
  }
}

function serializeOrbit(orb) {
  if (!orb) return null;
  return {
    a: orb.a, e: orb.e, p: orb.p, M0: orb.M0, n: orb.n,
    hyperbolic: !!orb.hyperbolic, mu: orb.mu,
    p_hat: orb.p_hat, q_hat: orb.q_hat, w_hat: orb.w_hat,
  };
}

function clearNbodyLine() {
  if (nbodyLine) {
    scene.remove(nbodyLine);
    nbodyLine = null;
  }
}

function scheduleNbodyOverlay(td) {
  const reqId = state.pathRefineRequestId;
  if (!td.v1_lambert || !td.dep3D) return;
  try {
    if (!nbodyWorker) {
      nbodyWorker = new Worker(
        new URL('../workers/nbody-worker.js', import.meta.url),
        { type: 'module' },
      );
      nbodyWorker.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || msg.requestId !== state.pathRefineRequestId) return;
        if (msg.type !== 'nbody-path' || !msg.points?.length) return;
        if (nbodyLine) scene.remove(nbodyLine);
        const pts = msg.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        nbodyLine = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0xce93d8, transparent: true, opacity: 0.5,
        }));
        scene.add(nbodyLine);
      };
    }
    nbodyWorker.postMessage({
      type: 'propagate',
      requestId: reqId,
      tof: td.transferTime,
      tDep: td.departureSimTime,
      r0: [td.dep3D.x * AU, td.dep3D.y * AU, td.dep3D.z * AU],
      v0: td.v1_lambert,
      nSteps: 200,
    });
  } catch {
    /* optional */
  }
}
