/**
 * Scene-side transfer orbit visuals: dashed transfer lines, date markers,
 * depart/arrive/flyby ghosts and ring markers.
 *
 * Phase 1: polyline samples come from `js/physics/transfer-path.js` — the same
 * pipeline as the mission ship (equal-time Kepler + PathOffsetPolicy).
 * Default offset is time_varying so ship sits on the dashed path.
 */
import * as THREE from 'three';
import { DAY, LEG_COLORS } from '../constants.js';
import { state } from '../state.js';
import { getBodyPosition3D, getSunBarycentricOffset } from '../physics/kepler.js';
import {
  buildTransferPathSamples, buildLegPathSamples, sampleTransferPathAtTime,
  stateAtDt,
} from '../physics/transfer-path.js';
import { parentFrameToHelioAU } from '../physics/routing.js';
import { AU } from '../constants.js';
import {
  addDateMarker, addFlybyGhost, addLegLine, clearDateMarkers,
  clearMultiLegVisuals, hideArrivalGhost, hideDepartureGhost,
  setArrivalGhost, setDepartureGhost, setTransferLine, transferMarkers,
} from '../scene/transfer-visual.js';

function pathOptsFromState(td, extra = {}) {
  const longWay = extra.longWay != null
    ? extra.longWay
    : (td.visualLongWay != null ? td.visualLongWay : td.longWay);
  return {
    offsetPolicy: td.pathOffsetPolicy || state.pathOffsetPolicy || 'time_varying',
    sampleMode: state.pathSampleMode || 'equal_time',
    geometry: state.pathGeometry === 'physical' ? 'physical' : 'visual',
    nSamples: extra.nSamples ?? 320,
    longWay,
    ...extra,
  };
}

/**
 * Build Three.js polyline from shared path samples (already scene-frame).
 */
function samplesToLinePoints(samples) {
  return samples.map((p) => new THREE.Vector3(p.x, p.y, p.z));
}

export function updateTransferOrbitVisual() {
  setTransferLine(null);
  clearMultiLegVisuals();
  clearDateMarkers();
  transferMarkers.depart.visible = false;
  transferMarkers.arrive.visible = false;
  hideArrivalGhost();
  hideDepartureGhost();
  if (!state.showTransferOrbit || !state.transferData) return;

  const td = state.transferData;
  if (td.isMultiLeg) { renderMultiLegVisual(); return; }

  const depT = td.departureSimTime;
  const arrT = td.arrivalSimTime;
  const dep = td.dep3D || getBodyPosition3D(td.body1, depT);
  const arr = td.arr3D || getBodyPosition3D(td.body2, arrT);
  const opts = pathOptsFromState(td);

  const built = buildTransferPathSamples(td, opts);
  if (built.fallback === 'physical') td.visualFallback = 'physical';
  else if (built.fallback === 'cosine') td.visualFallback = 'cosine';
  else if (!td.visualFallback) td.visualFallback = null;

  const drawPts = samplesToLinePoints(built.points);
  if (drawPts.length < 2) return;

  let pathLen = 0;
  for (let i = 1; i < drawPts.length; i++) pathLen += drawPts[i].distanceTo(drawPts[i - 1]);
  const dash = Math.min(0.5, Math.max(0.1, pathLen / 60));
  const geo = new THREE.BufferGeometry().setFromPoints(drawPts);
  const mat = new THREE.LineDashedMaterial({
    color: 0xff9800, dashSize: dash, gapSize: dash * 0.55,
    transparent: true, opacity: 0.8,
  });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  setTransferLine(line);

  // EndpointMarkerPolicy: epoch_true (body+s) or match_path_end (path sample 0/N)
  const markerPol = state.endpointMarkerPolicy || 'epoch_true';
  let depMark, arrMark;
  if (markerPol === 'match_path_end' && drawPts.length >= 2) {
    const p0 = drawPts[0];
    const pN = drawPts[drawPts.length - 1];
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

  if (built.orbitUsed && td.transferTime / DAY < 3000) {
    addDateMarkersAlongOrbit(td, built.orbitUsed, depT, td.transferTime, 0xffd54f, opts);
  }
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
  const policy = pathOpts?.offsetPolicy || 'time_varying';
  for (let day = minor; day < transferTime / DAY; day += minor) {
    const dt = day * DAY;
    if (dt >= transferTime) break;
    const tAbs = departSimTime + dt;
    // Same path pipeline as ship/line at this time (time_varying parent/sun)
    const sample = sampleTransferPathAtTime(td, tAbs, pathOpts);
    if (!sample) {
      // Fallback: pure orbit + s(t)
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
      const isMajor = Math.abs(day % major) < 1e-6 || major < 1;
      addDateMarker(x, y, z, color, isMajor);
      continue;
    }
    const isMajor = Math.abs(day % major) < 1e-6 || major < 1;
    addDateMarker(sample.x, sample.y, sample.z, color, isMajor);
  }
  void policy;
}

function renderMultiLegVisual() {
  const td = state.transferData;
  for (let li = 0; li < td.legs.length; li++) {
    const leg = td.legs[li];
    if (!leg.ok) continue;
    const color = LEG_COLORS[li % LEG_COLORS.length];
    // PR1: stamp leg.longWay into sampler (was missing — short-arc bug)
    const built = buildLegPathSamples(leg, td, pathOptsFromState(td, {
      nSamples: 160,
      longWay: leg.longWay,
    }));
    const points = samplesToLinePoints(built.points);
    if (points.length < 2) continue;
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color, dashSize: 0.12, gapSize: 0.07, transparent: true, opacity: 0.75,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
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
  // Terminal ghosts
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
