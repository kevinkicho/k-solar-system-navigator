import { AU, DAY, G_CONST, PI } from '../constants.js';
import { SUN_DATA } from '../data/bodies.js';
import { v3mag, v3sub } from './vec3.js';
import { getBodyPosition3D, getBodyVelocity3D } from './kepler.js';
import {
  getPlanningPosition3D, getPlanningVelocity3D,
} from './ephemeris-provider.js';
import {
  buildTransferOrbit, buildHelioOrbit, propagateOrbit, propagateHelioOrbit,
} from './helio.js';
import { solveLambertBestBranch, solveLambertProblem } from './lambert.js';
import { gravityAssistInfo } from './gravity-assist.js';

/** Propagate visual transfer (ellipse or hyperbola). */
export function propagateVisualOrbit(orb, dt) {
  if (!orb) return null;
  if (orb.hyperbolic) return propagateHelioOrbit(orb, dt);
  return propagateOrbit(orb, dt);
}

/**
 * Build visual-orbit state from Lambert solution on exaggerated geometry.
 * Uses independent best branch + hyperbola-safe propagation.
 * @returns {{ orbit, visualFallback: null|'cosine' }}
 */
function tryBuildVisualOrbit(r1v, r2v, tof, mu, vBody1, vBody2, preferredLongWay = null) {
  // Prefer free best branch for visuals; fall back to preferred longWay if needed.
  let best = solveLambertBestBranch(r1v, r2v, tof, mu, vBody1, vBody2);
  if (!best && preferredLongWay != null) {
    const sol = solveLambertProblem(r1v, r2v, tof, mu, preferredLongWay);
    if (sol) {
      const orbEll = buildTransferOrbit(r1v, sol.v1, mu);
      const hit = propagateOrbit(orbEll, tof);
      if (v3mag(v3sub(hit, r2v)) < 1e6) {
        return { orbit: orbEll, visualFallback: null };
      }
      const orbH = buildHelioOrbit(r1v, sol.v1, mu);
      const hitH = propagateHelioOrbit(orbH, tof);
      if (v3mag(v3sub(hitH, r2v)) < 1e6) {
        return { orbit: orbH, visualFallback: null };
      }
    }
    return { orbit: null, visualFallback: 'cosine' };
  }
  if (!best) return { orbit: null, visualFallback: 'cosine' };
  // Hyperbola-safe first (covers e>1 and energy>0 edge cases)
  try {
    const orbH = buildHelioOrbit(r1v, best.sol.v1, mu);
    const hitH = propagateHelioOrbit(orbH, tof);
    if (v3mag(v3sub(hitH, r2v)) < 1e6) {
      return { orbit: orbH, visualFallback: null };
    }
  } catch {
    /* fall through */
  }
  try {
    const orbE = buildTransferOrbit(r1v, best.sol.v1, mu);
    const hitE = propagateOrbit(orbE, tof);
    if (v3mag(v3sub(hitE, r2v)) < 1e6) {
      return { orbit: orbE, visualFallback: null };
    }
  } catch {
    /* fall through */
  }
  return { orbit: null, visualFallback: 'cosine' };
}

/** Planning opts: backend 'approx'|'sample-de', classroomMode. Visual path always Kepler. */
function planOpts(tData) {
  return {
    backend: tData?.ephemerisBackend || tData?.backend || 'approx',
    classroomMode: !!tData?.classroomMode,
  };
}

/** Merge multi-leg plan opts from first waypoint or explicit route opts. */
function multiLegPlanOpts(waypoints, routeOpts = {}) {
  const w0 = waypoints?.[0] || {};
  return {
    backend: routeOpts.ephemerisBackend || routeOpts.backend || w0.ephemerisBackend || w0.backend || 'approx',
    classroomMode: !!(routeOpts.classroomMode ?? w0.classroomMode),
  };
}

// Nearest-feasible window search lives in nearest-feasible-search.js
// (sync pure + chunked async; UI uses worker wrapper). Re-export for callers.
export {
  MIN_PERIHELION_AU,
  findNearestFeasibleTransfer,
  DEFAULT_N_DEP,
  DEFAULT_N_TOF,
} from './nearest-feasible-search.js';

// Solve Lambert for the single-leg transfer described in tData and cache the orbit.
// We solve twice:
//   (1) PHYSICAL geometry (real inclinations) → orbit used for the Δv numbers,
//       so the mission cost is accurate.
//   (2) VISUAL geometry (exaggerated inclinations) → orbit used for the drawn
//       trajectory line and ship animation, so the ship lines up with the
//       visually-tilted planets.
// Each solve is rejected if propagating the orbit to tof misses r2 by > 1000 km.
export function solveTransferOrbit(tData) {
  const mu  = G_CONST * SUN_DATA.mass;
  const pOpts = planOpts(tData);

  const depP = getPlanningPosition3D(tData.body1, tData.departureSimTime, pOpts);
  const arrP = getPlanningPosition3D(tData.body2, tData.arrivalSimTime, pOpts);
  const r1vP = [depP.x * AU, depP.y * AU, depP.z * AU];
  const r2vP = [arrP.x * AU, arrP.y * AU, arrP.z * AU];
  const vBody1 = getPlanningVelocity3D(tData.body1, tData.departureSimTime, pOpts);
  const vBody2 = getPlanningVelocity3D(tData.body2, tData.arrivalSimTime, pOpts);
  const bestP = solveLambertBestBranch(r1vP, r2vP, tData.transferTime, mu, vBody1, vBody2);

  let physicsOk = false, chosenLongWay = null;
  if (bestP) {
    physicsOk = true;
    chosenLongWay = bestP.longWay;
    tData.orbitPhysical = bestP.orb;
    // Store the raw Lambert velocity vectors (heliocentric, m/s) so the
    // mission-budget calculator can compute V∞ relative to each SOI parent
    // (= V_lambert − V_parent_helio).  Required when an endpoint is a moon
    // and we want the patched-conic full mission Δv (escape + capture)
    // rather than just the heliocentric leg.
    tData.v1_lambert = bestP.sol.v1;
    tData.v2_lambert = bestP.sol.v2;
    tData.dv1_lambert = v3mag(v3sub(bestP.sol.v1, vBody1));
    tData.dv2_lambert = v3mag(v3sub(bestP.sol.v2, vBody2));
    tData.dvTotal_lambert = tData.dv1_lambert + tData.dv2_lambert;
    tData.longWay = chosenLongWay;
  }
  tData.lambertOk = physicsOk;

  const depV = getBodyPosition3D(tData.body1, tData.departureSimTime, true);
  const arrV = getBodyPosition3D(tData.body2, tData.arrivalSimTime, true);
  tData.dep3D = depV;
  tData.arr3D = arrV;
  tData.orbit = null;
  tData.visualFallback = null;
  if (physicsOk) {
    const r1vV = [depV.x * AU, depV.y * AU, depV.z * AU];
    const r2vV = [arrV.x * AU, arrV.y * AU, arrV.z * AU];
    const vBody1v = getBodyVelocity3D(tData.body1, tData.departureSimTime, true);
    const vBody2v = getBodyVelocity3D(tData.body2, tData.arrivalSimTime, true);
    // Independent visual branch (not forced physical longWay) + hyperbola-safe
    const vis = tryBuildVisualOrbit(
      r1vV, r2vV, tData.transferTime, mu, vBody1v, vBody2v, chosenLongWay,
    );
    tData.orbit = vis.orbit;
    tData.visualFallback = vis.visualFallback;
  }
}

/**
 * Refresh visual geometry (exaggerated positions / orbits) without changing
 * physics Δv. Call after display-mode cinematic ↔ schematic changes.
 */
export function refreshVisualTransferGeometry(td) {
  if (!td) return;
  if (!td.isMultiLeg) {
    solveTransferOrbit(td);
    return;
  }
  const mu = G_CONST * SUN_DATA.mass;
  const wps = td.waypoints || [];
  for (let i = 0; i < (td.legs || []).length; i++) {
    const L = td.legs[i];
    if (!L || !L.ok) continue;
    const a = wps[i], b = wps[i + 1];
    if (!a?.body || !b?.body) continue;
    const tof = L.tof;
    const pAV = getBodyPosition3D(a.body, a.simTime, true);
    const pBV = getBodyPosition3D(b.body, b.simTime, true);
    L.dep3D = pAV;
    L.arr3D = pBV;
    const r1V = [pAV.x * AU, pAV.y * AU, pAV.z * AU];
    const r2V = [pBV.x * AU, pBV.y * AU, pBV.z * AU];
    const vA = getBodyVelocity3D(a.body, a.simTime, true);
    const vB = getBodyVelocity3D(b.body, b.simTime, true);
    const vis = tryBuildVisualOrbit(r1V, r2V, tof, mu, vA, vB, L.longWay);
    L.orbit = vis.orbit;
    L.visualFallback = vis.visualFallback;
  }
  // Aggregate flag for UI
  td.visualFallback = (td.legs || []).some((L) => L.ok && L.visualFallback === 'cosine')
    ? 'cosine'
    : null;
}

// waypoints: [{body, simTime}, …] with length ≥ 2. First is origin, last is
// destination, everything in between is a flyby. Returns a structure similar
// in spirit to single-leg transferData, plus per-leg orbits and per-flyby
// feasibility info.
export function solveMultiLegRoute(waypoints, routeOpts = {}) {
  const mu = G_CONST * SUN_DATA.mass;
  const pOpts = multiLegPlanOpts(waypoints, routeOpts);
  const legs = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const tof = b.simTime - a.simTime;
    if (tof <= 0) { legs.push({ ok: false, reason: 'non-positive TOF' }); continue; }

    // Multi-leg planning positions via provider; visual still Kepler exaggerated.
    const pA = getPlanningPosition3D(a.body, a.simTime, pOpts);
    const pB = getPlanningPosition3D(b.body, b.simTime, pOpts);
    const r1P = [pA.x*AU, pA.y*AU, pA.z*AU];
    const r2P = [pB.x*AU, pB.y*AU, pB.z*AU];
    const vA = getPlanningVelocity3D(a.body, a.simTime, pOpts);
    const vB = getPlanningVelocity3D(b.body, b.simTime, pOpts);
    const bestP = solveLambertBestBranch(r1P, r2P, tof, mu, vA, vB);

    const pAV = getBodyPosition3D(a.body, a.simTime, true);
    const pBV = getBodyPosition3D(b.body, b.simTime, true);

    let orbP = null, orbV = null, ok = false, v1 = null, v2 = null, visualFallback = null;
    if (bestP) {
      orbP = bestP.orb;
      v1 = bestP.sol.v1; v2 = bestP.sol.v2; ok = true;
      const r1V = [pAV.x*AU, pAV.y*AU, pAV.z*AU];
      const r2V = [pBV.x*AU, pBV.y*AU, pBV.z*AU];
      const vAv = getBodyVelocity3D(a.body, a.simTime, true);
      const vBv = getBodyVelocity3D(b.body, b.simTime, true);
      const vis = tryBuildVisualOrbit(r1V, r2V, tof, mu, vAv, vBv, bestP.longWay);
      orbV = vis.orbit;
      visualFallback = vis.visualFallback;
    }

    legs.push({
      ok,
      from: a.body.name, to: b.body.name,
      departSimTime: a.simTime, arriveSimTime: b.simTime, tof,
      v1, v2,
      orbitPhysical: orbP,
      orbit: orbV,
      visualFallback,
      dep3D: pAV, arr3D: pBV,
      longWay: bestP ? bestP.longWay : null,
    });
  }

  const maneuvers = [];
  const flybys = [];
  let dvTotal = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const vPlanet = getPlanningVelocity3D(wp.body, wp.simTime, pOpts);
    if (i === 0) {
      const L = legs[0];
      if (L && L.ok) {
        const dv = v3mag(v3sub(L.v1, vPlanet));
        maneuvers.push({ type: 'depart', body: wp.body.name, simTime: wp.simTime, dv });
        dvTotal += dv;
      }
    } else if (i === waypoints.length - 1) {
      const L = legs[i - 1];
      if (L && L.ok) {
        const dv = v3mag(v3sub(L.v2, vPlanet));
        maneuvers.push({ type: 'arrive', body: wp.body.name, simTime: wp.simTime, dv });
        dvTotal += dv;
      }
    } else {
      const Lin = legs[i - 1], Lout = legs[i];
      if (Lin && Lin.ok && Lout && Lout.ok) {
        const vInfIn  = v3sub(Lin.v2, vPlanet);
        const vInfOut = v3sub(Lout.v1, vPlanet);
        const info = gravityAssistInfo(wp.body, vInfIn, vInfOut);
        flybys.push({ body: wp.body.name, simTime: wp.simTime, ...info });
        maneuvers.push({ type: 'flyby', body: wp.body.name, simTime: wp.simTime, dv: info.dvFlyby, info });
        dvTotal += info.dvFlyby;
      }
    }
  }

  return {
    isMultiLeg: true,
    waypoints,
    legs, maneuvers, flybys,
    dvTotalMultiLeg: dvTotal,
    body1: waypoints[0].body,
    body2: waypoints[waypoints.length - 1].body,
    departureSimTime: waypoints[0].simTime,
    arrivalSimTime:   waypoints[waypoints.length - 1].simTime,
    transferTime:     waypoints[waypoints.length - 1].simTime - waypoints[0].simTime,
    allLegsOk: legs.every(l => l.ok),
    visualFallback: legs.some((l) => l.ok && l.visualFallback === 'cosine') ? 'cosine' : null,
  };
}

// Bind multi-leg window search to solveMultiLegRoute (avoids circular imports).
import {
  bindSolveMultiLegRoute,
  findMultiLegWindow as findMultiLegWindowImpl,
} from './multi-leg-window-search.js';

bindSolveMultiLegRoute(solveMultiLegRoute);

/**
 * Coarse multi-leg launch-window search (local seed — not global optimum).
 * Optional 6th arg `opts` supports onProgress / shouldCancel.
 */
export function findMultiLegWindow(origin, dest, flybyHints, depHint, routeOpts = {}, opts = {}) {
  return findMultiLegWindowImpl(origin, dest, flybyHints, depHint, routeOpts, opts);
}

// Ship position using real orbital mechanics. Handles single-leg (tData.orbit)
// and multi-leg (tData.legs) routes. Returns heliocentric scene coords (AU);
// callers add getSunBarycentricOffset(t) for barycentric placement. For multi-leg,
// the returned object also carries `legIndex` (UI shows "LEG n/N") and `legProgress`.
export function getShipPositionOnTransfer(departureSimTime, tData, currentSimTime) {
  if (tData.isMultiLeg) {
    const legs = tData.legs;
    let active = null, activeIdx = -1;
    const totalTime = tData.transferTime;
    const totalElapsed = Math.max(0, currentSimTime - departureSimTime);
    const overallProgress = Math.max(0, Math.min(1, totalElapsed / totalTime));

    for (let i = 0; i < legs.length; i++) {
      const L = legs[i];
      if (!L.ok) continue;
      if (currentSimTime <= L.arriveSimTime) { active = L; activeIdx = i; break; }
    }
    if (!active) {
      const last = [...legs].reverse().find(l => l.ok);
      if (!last) return null;
      if (last.orbit) {
        const pos_m = propagateVisualOrbit(last.orbit, last.tof);
        if (pos_m) {
          return { x: pos_m[0]/AU, y: pos_m[1]/AU, z: pos_m[2]/AU,
                   progress: 1, legIndex: legs.length - 1, legProgress: 1, currentLeg: last };
        }
      }
      const arr = last.arr3D;
      if (arr) return { x: arr.x, y: arr.y, z: arr.z, progress: 1, legIndex: legs.length - 1, legProgress: 1, currentLeg: last };
      return null;
    }

    const elapsed = Math.max(0, currentSimTime - active.departSimTime);
    const legProgress = Math.max(0, Math.min(1, elapsed / active.tof));
    if (active.orbit) {
      const pos_m = propagateVisualOrbit(active.orbit, elapsed);
      if (pos_m) {
        return { x: pos_m[0]/AU, y: pos_m[1]/AU, z: pos_m[2]/AU,
                 progress: overallProgress, legIndex: activeIdx, legProgress, currentLeg: active };
      }
    }
    const dep = active.dep3D, arr = active.arr3D;
    const blend = 0.5 - 0.5 * Math.cos(PI * legProgress);
    return {
      x: dep.x + (arr.x - dep.x) * blend,
      y: dep.y + (arr.y - dep.y) * blend,
      z: dep.z + (arr.z - dep.z) * blend,
      progress: overallProgress, legIndex: activeIdx, legProgress, currentLeg: active,
    };
  }

  const elapsed = currentSimTime - departureSimTime;
  const progress = Math.max(0, Math.min(1, elapsed / tData.transferTime));

  if (tData.orbit) {
    const pos_m = propagateVisualOrbit(tData.orbit, elapsed);
    if (pos_m) {
      return { x: pos_m[0] / AU, y: pos_m[1] / AU, z: pos_m[2] / AU, progress };
    }
  }

  const dep = tData.dep3D || getBodyPosition3D(tData.body1, departureSimTime);
  const arr = tData.arr3D || getBodyPosition3D(tData.body2, departureSimTime + tData.transferTime);
  const blend = 0.5 - 0.5 * Math.cos(PI * progress);
  return {
    x: dep.x + (arr.x - dep.x) * blend,
    y: dep.y + (arr.y - dep.y) * blend,
    z: dep.z + (arr.z - dep.z) * blend,
    progress,
  };
}
