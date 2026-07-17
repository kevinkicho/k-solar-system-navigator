/**
 * Scene-side transfer orbit visuals: dashed transfer lines, date markers,
 * depart/arrive/flyby ghosts and ring markers.
 *
 * Transfer arcs are drawn as pure 2-body conic sections (sample by true anomaly).
 * Time-varying sun-barycentric wobble is NOT applied along the arc — it was
 * making multi-year paths look “squiggly” even with no third-body forces.
 * Ghosts still use epoch offsets so they sit on the live planets at burn times.
 */
import * as THREE from 'three';
import { AU, DAY, LEG_COLORS, PI, TWO_PI } from '../constants.js';
import { state } from '../state.js';
import { getBodyPosition3D, getSunBarycentricOffset } from '../physics/kepler.js';
import { propagateOrbit, propagateHelioOrbit } from '../physics/helio.js';
import { parentFrameToHelioAU } from '../physics/routing.js';
import { v3add, v3dot, v3mag, v3scale } from '../physics/vec3.js';
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

/** True anomaly of a heliocentric state on a known orbit frame (p_hat, q_hat). */
function trueAnomalyOfPos(orb, pos_m) {
  const r = v3mag(pos_m);
  if (!(r > 0) || !orb?.p_hat || !orb?.q_hat) return 0;
  const rhat = v3scale(pos_m, 1 / r);
  const cosNu = Math.max(-1, Math.min(1, v3dot(rhat, orb.p_hat)));
  const sinNu = v3dot(rhat, orb.q_hat);
  return Math.atan2(sinNu, cosNu);
}

/** Position on conic at true anomaly ν (metres, orbit frame). */
function posAtTrueAnomaly(orb, nu) {
  const e = orb.e;
  const p = orb.p;
  if (!(p > 0) || !isFinite(e)) return null;
  const den = 1 + e * Math.cos(nu);
  if (Math.abs(den) < 1e-12) return null;
  const r = p / den;
  if (!(r > 0) || !isFinite(r)) return null;
  return v3add(
    v3scale(orb.p_hat, r * Math.cos(nu)),
    v3scale(orb.q_hat, r * Math.sin(nu)),
  );
}

/**
 * Shortest signed Δν from a → b in (−π, π].
 */
function deltaNuShort(a, b) {
  let d = b - a;
  while (d > PI) d -= TWO_PI;
  while (d <= -PI) d += TWO_PI;
  return d;
}

/**
 * Sample a smooth conic arc by true anomaly (not time).
 * Works for ellipses and hyperbolas (r = p / (1 + e cos ν)).
 * Avoids Kepler-solver noise and time-varying wobble wiggles.
 * @returns {THREE.Vector3[]|null} heliocentric AU (no per-sample sun wobble)
 */
function sampleConicByTrueAnomaly(orb, r1_m, r2_m, nSamples = 256) {
  if (!orb?.p_hat || !orb?.q_hat || !(orb.p > 0) || !isFinite(orb.e)) return null;
  const nu1 = trueAnomalyOfPos(orb, r1_m);
  const nu2 = trueAnomalyOfPos(orb, r2_m);
  // Prefer short-way unless longWay flag set on orbit/transfer
  let dNu = deltaNuShort(nu1, nu2);
  if (orb.longWay === true) {
    dNu = dNu > 0 ? dNu - TWO_PI : dNu + TWO_PI;
  }
  // If nearly 0, still draw a tiny arc
  if (Math.abs(dNu) < 1e-6) dNu = 1e-6;

  // Hyperbola: true anomaly must stay inside asymptotes |ν| < acos(−1/e)
  if (orb.e > 1) {
    const nuMax = Math.acos(Math.max(-1, Math.min(1, -1 / orb.e))) - 1e-6;
    if (Math.abs(nu1) >= nuMax || Math.abs(nu2) >= nuMax) return null;
    for (let i = 0; i <= 8; i++) {
      const nu = nu1 + dNu * (i / 8);
      if (Math.abs(nu) >= nuMax) return null;
    }
  }

  const pts = [];
  const N = Math.max(48, Math.min(512, nSamples));
  for (let i = 0; i <= N; i++) {
    const nu = nu1 + dNu * (i / N);
    const pos_m = posAtTrueAnomaly(orb, nu);
    if (!pos_m || !isFinite(pos_m[0])) return null;
    pts.push(new THREE.Vector3(pos_m[0] / AU, pos_m[1] / AU, pos_m[2] / AU));
  }
  // Continuity: reject multi-AU jumps (wrong long/short way near singularity)
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].distanceTo(pts[i - 1]) > 12) return null;
  }
  return pts;
}

/**
 * Build transfer polyline for the scene.
 * @returns {{ points: THREE.Vector3[], orbitUsed: object|null, fallback: null|'physical'|'cosine' }}
 */
function buildTransferPolyline(td, depT) {
  const dep = td.dep3D || getBodyPosition3D(td.body1, depT);
  const arr = td.arr3D || getBodyPosition3D(td.body2, td.arrivalSimTime);

  // Planet-relative: parent-frame orbit + central body at mid-epoch (stable)
  if (td.planetRelative && td.centralBody) {
    const midT = depT + td.transferTime / 2;
    const tryOrb = (orb, tag) => {
      if (!orb) return null;
      const r1 = propVis(orb, 0);
      const r2 = propVis(orb, td.transferTime);
      if (!r1 || !r2) return null;
      // Prefer true-anomaly if elliptic frame available
      let local = null;
      if (!orb.hyperbolic && orb.p_hat) {
        local = sampleConicByTrueAnomaly(orb, r1, r2, 200);
      }
      if (!local) {
        // time sample fallback
        local = [];
        const N = 128;
        for (let i = 0; i <= N; i++) {
          const p = propVis(orb, (i / N) * td.transferTime);
          if (!p) return null;
          local.push(new THREE.Vector3(p[0] / AU, p[1] / AU, p[2] / AU));
        }
      }
      const pts = [];
      for (const lp of local) {
        const helio = parentFrameToHelioAU(
          [lp.x * AU, lp.y * AU, lp.z * AU],
          td.centralBody,
          midT,
          true,
        );
        if (!helio) return null;
        pts.push(new THREE.Vector3(helio.x, helio.y, helio.z));
      }
      return { points: pts, orbitUsed: orb, fallback: tag };
    };
    return tryOrb(td.orbit, null)
      || tryOrb(td.orbitPhysical, 'physical')
      || cosineBlend(dep, arr, depT, td.transferTime);
  }

  // Heliocentric: sample conic in pure heliocentric frame (no sun wobble on arc).
  // Prefer visual orbit so the dashed line meets exaggerated planet ghosts.
  const tryHelio = (orb, tag) => {
    if (!orb) return null;
    const r1 = propVis(orb, 0);
    const r2 = propVis(orb, td.transferTime);
    if (!r1 || !r2) return null;
    // Stamp longWay from transfer for arc direction
    const orbDraw = { ...orb, longWay: !!td.longWay };
    let pts = null;
    if (orb.p_hat && isFinite(orb.e) && orb.e >= 0) {
      pts = sampleConicByTrueAnomaly(orbDraw, r1, r2, 320);
    }
    if (!pts) {
      // Time-uniform Kepler samples (still no per-point sun wobble)
      pts = [];
      const N = 256;
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const p = propVis(orb, (i / N) * td.transferTime);
        if (!p || !isFinite(p[0])) return null;
        const v = new THREE.Vector3(p[0] / AU, p[1] / AU, p[2] / AU);
        if (prev && v.distanceTo(prev) > 12) return null;
        pts.push(v);
        prev = v;
      }
    }
    // Soft endpoint snap only when conic already lands near ghosts (same frame).
    // Hard-snapping physical→visual mismatched ends caused kinks on outer trips.
    if (pts.length >= 2 && dep && arr) {
      const p0 = pts[0];
      const pN = pts[pts.length - 1];
      if (p0.distanceTo(new THREE.Vector3(dep.x, dep.y, dep.z)) < 0.75) {
        pts[0] = new THREE.Vector3(dep.x, dep.y, dep.z);
      }
      if (pN.distanceTo(new THREE.Vector3(arr.x, arr.y, arr.z)) < 0.75) {
        pts[pts.length - 1] = new THREE.Vector3(arr.x, arr.y, arr.z);
      }
    }
    return { points: pts, orbitUsed: orb, fallback: tag };
  };

  return tryHelio(td.orbit, null)
    || tryHelio(td.orbitPhysical, 'physical')
    || cosineBlend(dep, arr, depT, td.transferTime);
}

function cosineBlend(dep, arr, depT, transferTime) {
  // Pure geometric blend — no sun wobble (keeps path smooth)
  const NF = 200;
  const cosPts = [];
  for (let i = 0; i <= NF; i++) {
    const t = i / NF;
    const blend = 0.5 - 0.5 * Math.cos(PI * t);
    cosPts.push(new THREE.Vector3(
      dep.x + (arr.x - dep.x) * blend,
      dep.y + (arr.y - dep.y) * blend,
      dep.z + (arr.z - dep.z) * blend,
    ));
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

  const depT = td.departureSimTime;
  const arrT = td.arrivalSimTime;
  const dep = td.dep3D || getBodyPosition3D(td.body1, depT);
  const arr = td.arr3D || getBodyPosition3D(td.body2, arrT);
  // Ghosts use epoch-specific sun offset so they match live planets at burn times.
  const depOff = getSunBarycentricOffset(depT);
  const arrOff = getSunBarycentricOffset(arrT);

  const built = buildTransferPolyline(td, depT);
  const points = built.points;
  if (built.fallback === 'physical') td.visualFallback = 'physical';
  else if (built.fallback === 'cosine') td.visualFallback = 'cosine';

  // Optional: translate entire pure-heliocentric arc by mid-epoch offset so it
  // sits near the currently displayed (wobbled) solar system without warping.
  const midOff = getSunBarycentricOffset(depT + td.transferTime / 2);
  const drawPts = points.map((p) => new THREE.Vector3(
    p.x + midOff.x, p.y + midOff.y, p.z + midOff.z,
  ));

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

  transferMarkers.depart.position.set(dep.x + depOff.x, dep.y + depOff.y, dep.z + depOff.z);
  transferMarkers.depart.visible = true;
  transferMarkers.arrive.position.set(arr.x + arrOff.x, arr.y + arrOff.y, arr.z + arrOff.z);
  transferMarkers.arrive.visible = true;

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

  // Sparse date ticks on the pure conic (mid-offset) for shorter transfers only
  if (built.orbitUsed && td.transferTime / DAY < 3000) {
    addDateMarkersAlongOrbit(td, built.orbitUsed, depT, td.transferTime, 0xffd54f, midOff);
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

function addDateMarkersAlongOrbit(td, orbit, departSimTime, transferTime, color, midOff) {
  const { minor, major } = chooseTickIntervals(transferTime / DAY);
  const off = midOff || { x: 0, y: 0, z: 0 };
  for (let day = minor; day < transferTime / DAY; day += minor) {
    const dt = day * DAY;
    if (dt >= transferTime) break;
    const pos_m = propVis(orbit, dt);
    if (!pos_m) continue;
    let x = pos_m[0] / AU;
    let y = pos_m[1] / AU;
    let z = pos_m[2] / AU;
    if (td.planetRelative && td.centralBody) {
      const h = parentFrameToHelioAU(pos_m, td.centralBody, departSimTime + dt, true);
      if (!h) continue;
      x = h.x; y = h.y; z = h.z;
    }
    const isMajor = Math.abs(day % major) < 1e-6 || major < 1;
    addDateMarker(x + off.x, y + off.y, z + off.z, color, isMajor);
  }
}

function renderMultiLegVisual() {
  const td = state.transferData;
  for (let li = 0; li < td.legs.length; li++) {
    const leg = td.legs[li];
    if (!leg.ok) continue;
    const color = LEG_COLORS[li % LEG_COLORS.length];
    const points = [];
    const transferDays = Math.floor(leg.tof / DAY);
    const stride = Math.max(1, Math.ceil(transferDays / 400));
    const midOff = getSunBarycentricOffset(leg.departSimTime + leg.tof / 2);

    if (leg.orbit && !leg.orbit.hyperbolic && leg.orbit.p_hat) {
      const r1 = propVis(leg.orbit, 0);
      const r2 = propVis(leg.orbit, leg.tof);
      const conic = r1 && r2 ? sampleConicByTrueAnomaly(leg.orbit, r1, r2, 160) : null;
      if (conic) {
        for (const p of conic) {
          points.push(new THREE.Vector3(p.x + midOff.x, p.y + midOff.y, p.z + midOff.z));
        }
      }
    }
    if (!points.length && leg.orbit) {
      for (let day = 0; day <= transferDays; day += stride) {
        const pos_m = propVis(leg.orbit, day * DAY);
        if (!pos_m) continue;
        points.push(new THREE.Vector3(
          pos_m[0] / AU + midOff.x,
          pos_m[1] / AU + midOff.y,
          pos_m[2] / AU + midOff.z,
        ));
      }
      const end = propVis(leg.orbit, leg.tof);
      if (end) {
        points.push(new THREE.Vector3(
          end[0] / AU + midOff.x, end[1] / AU + midOff.y, end[2] / AU + midOff.z,
        ));
      }
    }
    if (!points.length) {
      const dep = leg.dep3D;
      const arr = leg.arr3D;
      if (dep && arr) {
        const NF = 80;
        for (let i = 0; i <= NF; i++) {
          const t = i / NF;
          const blend = 0.5 - 0.5 * Math.cos(PI * t);
          points.push(new THREE.Vector3(
            dep.x + (arr.x - dep.x) * blend + midOff.x,
            dep.y + (arr.y - dep.y) * blend + midOff.y,
            dep.z + (arr.z - dep.z) * blend + midOff.z,
          ));
        }
      }
    }
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
