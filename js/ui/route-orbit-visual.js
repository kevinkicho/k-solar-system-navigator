/**
 * Scene-side transfer orbit visuals: dashed transfer lines, date markers,
 * depart/arrive/flyby ghosts and ring markers.
 */
import * as THREE from 'three';
import { AU, DAY, LEG_COLORS, PI } from '../constants.js';
import { state } from '../state.js';
import { getBodyPosition3D, getSunBarycentricOffset } from '../physics/kepler.js';
import { propagateOrbit, propagateHelioOrbit } from '../physics/helio.js';
import { parentFrameToHelioAU } from '../physics/routing.js';
import {
  addDateMarker, addFlybyGhost, addFlybyMarker, addLegLine, clearDateMarkers,
  clearMultiLegVisuals, hideArrivalGhost, hideDepartureGhost,
  setArrivalGhost, setDepartureGhost, setTransferLine, transferMarkers,
} from '../scene/transfer-visual.js';

function propVis(orb, dt) {
  if (!orb) return null;
  try {
    if (orb.hyperbolic) return propagateHelioOrbit(orb, dt);
    return propagateOrbit(orb, dt);
  } catch {
    return null;
  }
}

/** Orbit sample → heliocentric AU (handles parent-frame planet-relative arcs). */
function orbitSampleHelioAU(td, orb, dt, depT) {
  const pos_m = propVis(orb, dt);
  if (!pos_m || !isFinite(pos_m[0]) || !isFinite(pos_m[1]) || !isFinite(pos_m[2])) {
    return null;
  }
  if (td.planetRelative && td.centralBody) {
    return parentFrameToHelioAU(pos_m, td.centralBody, depT + dt, true);
  }
  return { x: pos_m[0] / AU, y: pos_m[1] / AU, z: pos_m[2] / AU };
}

/**
 * Build a continuous Kepler polyline. Rejects orbits that produce multi-AU
 * jumps between samples (high-e visual-branch numerical blowups).
 * @returns {{ points: THREE.Vector3[], orbitUsed: object|null, fallback: null|'physical'|'cosine' }}
 */
function buildTransferPolyline(td, depT, arrOff) {
  const dep = td.dep3D || getBodyPosition3D(td.body1, depT);
  const arr = td.arr3D || getBodyPosition3D(td.body2, td.arrivalSimTime);
  const transferDays = Math.floor(td.transferTime / DAY);
  // Cap vertices ~800 for long TOFs; short hops use dense fixed N
  const maxVerts = 800;
  const stride = Math.max(1, Math.ceil(transferDays / maxVerts));

  function sampleOrbit(orb) {
    if (!orb) return null;
    const pts = [];
    let prev = null;
    const pushHelio = (helio, off) => {
      if (!helio || !isFinite(helio.x)) return false;
      const v = new THREE.Vector3(helio.x + off.x, helio.y + off.y, helio.z + off.z);
      if (prev) {
        const jump = v.distanceTo(prev);
        // Continuity guard: successive samples must not leap multiple AU
        // (was the Mercury→Pluto spaghetti source with divergent solveKepler).
        if (jump > 5) return false;
      }
      pts.push(v);
      prev = v;
      return true;
    };

    if (td.transferTime < 2 * DAY) {
      const N = 64;
      for (let i = 0; i <= N; i++) {
        const dt = (i / N) * td.transferTime;
        const helio = orbitSampleHelioAU(td, orb, dt, depT);
        const off = getSunBarycentricOffset(depT + dt);
        if (!pushHelio(helio, off)) return null;
      }
    } else {
      for (let day = 0; day <= transferDays; day += stride) {
        const dt = day * DAY;
        const helio = orbitSampleHelioAU(td, orb, dt, depT);
        const off = getSunBarycentricOffset(depT + dt);
        if (!pushHelio(helio, off)) return null;
      }
      const helioArr = orbitSampleHelioAU(td, orb, td.transferTime, depT);
      if (!pushHelio(helioArr, arrOff)) return null;
    }
    return pts.length >= 2 ? pts : null;
  }

  // Prefer visual orbit; fall back to physical (real inclinations) if unstable.
  let pts = sampleOrbit(td.orbit);
  if (pts) return { points: pts, orbitUsed: td.orbit, fallback: null };
  pts = sampleOrbit(td.orbitPhysical);
  if (pts) return { points: pts, orbitUsed: td.orbitPhysical, fallback: 'physical' };

  // Cosine blend endpoints
  const NF = 200;
  const cosPts = [];
  for (let i = 0; i <= NF; i++) {
    const t = i / NF;
    const blend = 0.5 - 0.5 * Math.cos(PI * t);
    const off = getSunBarycentricOffset(depT + t * td.transferTime);
    cosPts.push(new THREE.Vector3(
      dep.x + (arr.x - dep.x) * blend + off.x,
      dep.y + (arr.y - dep.y) * blend + off.y,
      dep.z + (arr.z - dep.z) * blend + off.z));
  }
  return { points: cosPts, orbitUsed: null, fallback: 'cosine' };
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

  // Polyline samples the Kepler propagator (same as the ship). Sun-barycentric
  // wobble is applied per-vertex so the arc meets wobbled planets at ends.
  const depT = td.departureSimTime;
  const arrT = td.arrivalSimTime;
  const dep = td.dep3D || getBodyPosition3D(td.body1, depT);
  const arr = td.arr3D || getBodyPosition3D(td.body2, arrT);
  const depOff = getSunBarycentricOffset(depT);
  const arrOff = getSunBarycentricOffset(arrT);

  const built = buildTransferPolyline(td, depT, arrOff);
  const points = built.points;
  // Surface scene fallback so measurement card / banner can mention it
  if (built.fallback === 'physical' && !td.visualFallback) {
    td.visualFallback = 'physical';
  } else if (built.fallback === 'cosine') {
    td.visualFallback = 'cosine';
  }
  const drawOrbit = built.orbitUsed;
  // Scale dash size with path length so multi-AU arcs don't look solid/messy
  let pathLen = 0;
  for (let i = 1; i < points.length; i++) pathLen += points[i].distanceTo(points[i - 1]);
  const dash = Math.min(0.4, Math.max(0.08, pathLen / 80));
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineDashedMaterial({
    color: 0xff9800, dashSize: dash, gapSize: dash * 0.55,
    transparent: true, opacity: 0.75,
  });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  setTransferLine(line);
  transferMarkers.depart.position.set(dep.x + depOff.x, dep.y + depOff.y, dep.z + depOff.z);
  transferMarkers.depart.visible = true;
  transferMarkers.arrive.position.set(arr.x + arrOff.x, arr.y + arrOff.y, arr.z + arrOff.z);
  transferMarkers.arrive.visible = true;
  // Ghosts at endpoints — faded planet-sized spheres at "where Origin/Destination
  // are at the planned moment." Makes the rendezvous geometry obvious to a
  // viewer who hasn't pressed Launch yet.
  setDepartureGhost({
    x: dep.x + depOff.x, y: dep.y + depOff.y, z: dep.z + depOff.z,
    radius: (td.body1.displayRadius || 0.02) * 1.6,
    color: parseInt(String(td.body1.color || '#00e676').replace('#', ''), 16),
    label: 'AT DEPARTURE',
  });
  setArrivalGhost({
    x: arr.x + arrOff.x, y: arr.y + arrOff.y, z: arr.z + arrOff.z,
    radius: (td.body2.displayRadius || 0.02) * 1.6,
    color: parseInt(String(td.body2.color || '#ff9800').replace('#', ''), 16),
    label: 'AT ARRIVAL',
  });
  // Date markers along the stable orbit only (skip dense ticks on multi-year TOFs)
  if (drawOrbit && td.transferTime / DAY < 4000) {
    addDateMarkersAlongOrbit(td, drawOrbit, depT, td.transferTime, 0xffd54f);
  }
}

// Choose tick cadence so a transfer gets ~10–14 minor ticks plus a few
// labelled major ticks.  For Earth→Mars (~258d) ticks are weekly-ish, for
// Earth→Jupiter (~1000d) they're monthly-ish. Short planet-relative TOFs
// use sub-day cadence.
function chooseTickIntervals(transferTimeDays) {
  if (transferTimeDays < 2)    return { minor: 0.25, major: 1 };
  if (transferTimeDays < 14)   return { minor: 1,    major: 3 };
  if (transferTimeDays < 90)   return { minor: 7,   major: 30  };
  if (transferTimeDays < 365)  return { minor: 30,  major: 90  };
  if (transferTimeDays < 1500) return { minor: 60,  major: 180 };
  return { minor: 180, major: 360 };
}

function addDateMarkersAlongOrbit(td, orbit, departSimTime, transferTime, color) {
  const { minor, major } = chooseTickIntervals(transferTime / DAY);
  for (let day = minor; day < transferTime / DAY; day += minor) {
    const dt = day * DAY;
    if (dt >= transferTime) break;
    const helio = orbitSampleHelioAU(td || {}, orbit, dt, departSimTime);
    if (!helio) continue;
    const off = getSunBarycentricOffset(departSimTime + dt);
    const isMajor = Math.abs(day % major) < 1e-6 || major < 1;
    addDateMarker(
      helio.x + off.x, helio.y + off.y, helio.z + off.z,
      color, isMajor,
    );
  }
}

function renderMultiLegVisual() {
  const td = state.transferData;
  for (let li = 0; li < td.legs.length; li++) {
    const leg = td.legs[li];
    if (!leg.ok) continue;
    // Same per-day vertex strategy as single-leg: each vertex is the
    // spacecraft's actual cartesian position on that day of the leg, plus
    // an exact arrival vertex at leg.tof.
    const legDays = Math.floor(leg.tof / DAY);
    const stride = Math.max(1, Math.ceil(legDays / 3000));
    const pts = [];
    if (leg.orbit) {
      for (let day = 0; day <= legDays; day += stride) {
        const dt = day * DAY;
        const pm = propVis(leg.orbit, dt);
        if (!pm) continue;
        const off = getSunBarycentricOffset(leg.departSimTime + dt);
        pts.push(new THREE.Vector3(pm[0]/AU + off.x, pm[1]/AU + off.y, pm[2]/AU + off.z));
      }
      const pm = propVis(leg.orbit, leg.tof);
      if (pm) {
        const off = getSunBarycentricOffset(leg.arriveSimTime);
        pts.push(new THREE.Vector3(pm[0]/AU + off.x, pm[1]/AU + off.y, pm[2]/AU + off.z));
      }
    } else {
      const a = leg.dep3D, b = leg.arr3D;
      const NF = 160;
      for (let i = 0; i <= NF; i++) {
        const t = i / NF;
        const blend = 0.5 - 0.5 * Math.cos(PI * t);
        const off = getSunBarycentricOffset(leg.departSimTime + t * leg.tof);
        pts.push(new THREE.Vector3(
          a.x + (b.x - a.x) * blend + off.x,
          a.y + (b.y - a.y) * blend + off.y,
          a.z + (b.z - a.z) * blend + off.z));
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({
      color: LEG_COLORS[li % LEG_COLORS.length],
      dashSize: 0.15, gapSize: 0.08,
      transparent: true, opacity: 0.75,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    addLegLine(line);
    // Per-leg date markers reveal Keplerian variable speed.
    if (leg.orbit) {
      addDateMarkersAlongOrbit(
        leg.orbit, leg.departSimTime, leg.tof,
        LEG_COLORS[li % LEG_COLORS.length],
      );
    }
  }

  const firstLeg = td.legs[0];
  const lastLeg  = td.legs[td.legs.length - 1];
  if (firstLeg && firstLeg.ok) {
    const o = getSunBarycentricOffset(firstLeg.departSimTime);
    transferMarkers.depart.position.set(firstLeg.dep3D.x + o.x, firstLeg.dep3D.y + o.y, firstLeg.dep3D.z + o.z);
    transferMarkers.depart.visible = true;
    setDepartureGhost({
      x: firstLeg.dep3D.x + o.x, y: firstLeg.dep3D.y + o.y, z: firstLeg.dep3D.z + o.z,
      radius: td.body1.displayRadius * 1.6,
      color: parseInt(td.body1.color.replace('#', ''), 16),
      label: 'AT DEPARTURE',
    });
  }
  if (lastLeg && lastLeg.ok) {
    const o = getSunBarycentricOffset(lastLeg.arriveSimTime);
    transferMarkers.arrive.position.set(lastLeg.arr3D.x + o.x, lastLeg.arr3D.y + o.y, lastLeg.arr3D.z + o.z);
    transferMarkers.arrive.visible = true;
    setArrivalGhost({
      x: lastLeg.arr3D.x + o.x, y: lastLeg.arr3D.y + o.y, z: lastLeg.arr3D.z + o.z,
      radius: td.body2.displayRadius * 1.6,
      color: parseInt(td.body2.color.replace('#', ''), 16),
      label: 'AT ARRIVAL',
    });
  }
  // Per-flyby ghosts at each intermediate planet, parked at the planned-flyby-
  // time position so the user sees the planet "where the ship will meet it"
  // even when sim time is currently elsewhere.
  for (let i = 1; i < td.waypoints.length - 1; i++) {
    const wp = td.waypoints[i];
    const p = getBodyPosition3D(wp.body, wp.simTime, true);
    const o = getSunBarycentricOffset(wp.simTime);
    addFlybyGhost({
      x: p.x + o.x, y: p.y + o.y, z: p.z + o.z,
      radius: wp.body.displayRadius * 1.5,
      color: parseInt(wp.body.color.replace('#', ''), 16),
      label: `AT FLYBY · ${wp.body.name}`,
    });
  }

  for (let i = 1; i < td.waypoints.length - 1; i++) {
    const wp = td.waypoints[i];
    const p = getBodyPosition3D(wp.body, wp.simTime, true);
    const o = getSunBarycentricOffset(wp.simTime);
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.018, 0.030, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd54f, side: THREE.DoubleSide,
        transparent: true, opacity: 0.85,
      }),
    );
    mesh.position.set(p.x + o.x, p.y + o.y, p.z + o.z);
    addFlybyMarker(mesh);
  }
}
