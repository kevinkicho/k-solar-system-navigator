import { AU, G_CONST, PI } from '../constants.js';
import { SUN_DATA } from '../data/bodies.js';
import { v3mag, v3sub } from './vec3.js';
import { getBodyPosition3D, getBodyVelocity3D } from './kepler.js';
import { buildTransferOrbit, propagateOrbit } from './helio.js';
import { solveLambertBestBranch, solveLambertProblem } from './lambert.js';
import { gravityAssistInfo } from './gravity-assist.js';

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

  const depP = getBodyPosition3D(tData.body1, tData.departureSimTime, false);
  const arrP = getBodyPosition3D(tData.body2, tData.arrivalSimTime, false);
  const r1vP = [depP.x * AU, depP.y * AU, depP.z * AU];
  const r2vP = [arrP.x * AU, arrP.y * AU, arrP.z * AU];
  const vBody1 = getBodyVelocity3D(tData.body1, tData.departureSimTime, false);
  const vBody2 = getBodyVelocity3D(tData.body2, tData.arrivalSimTime, false);
  const bestP = solveLambertBestBranch(r1vP, r2vP, tData.transferTime, mu, vBody1, vBody2);

  let physicsOk = false, chosenLongWay = null;
  if (bestP) {
    physicsOk = true;
    chosenLongWay = bestP.longWay;
    tData.orbitPhysical = bestP.orb;
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
  if (physicsOk) {
    const r1vV = [depV.x * AU, depV.y * AU, depV.z * AU];
    const r2vV = [arrV.x * AU, arrV.y * AU, arrV.z * AU];
    const solV = solveLambertProblem(r1vV, r2vV, tData.transferTime, mu, chosenLongWay);
    if (solV) {
      const orb = buildTransferOrbit(r1vV, solV.v1, mu);
      const hit = propagateOrbit(orb, tData.transferTime);
      if (v3mag(v3sub(hit, r2vV)) < 1e6) tData.orbit = orb;
    }
  }
}

// waypoints: [{body, simTime}, …] with length ≥ 2. First is origin, last is
// destination, everything in between is a flyby. Returns a structure similar
// in spirit to single-leg transferData, plus per-leg orbits and per-flyby
// feasibility info.
export function solveMultiLegRoute(waypoints) {
  const mu = G_CONST * SUN_DATA.mass;
  const legs = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const tof = b.simTime - a.simTime;
    if (tof <= 0) { legs.push({ ok: false, reason: 'non-positive TOF' }); continue; }

    const pA = getBodyPosition3D(a.body, a.simTime, false);
    const pB = getBodyPosition3D(b.body, b.simTime, false);
    const r1P = [pA.x*AU, pA.y*AU, pA.z*AU];
    const r2P = [pB.x*AU, pB.y*AU, pB.z*AU];
    const vA = getBodyVelocity3D(a.body, a.simTime, false);
    const vB = getBodyVelocity3D(b.body, b.simTime, false);
    const bestP = solveLambertBestBranch(r1P, r2P, tof, mu, vA, vB);

    const pAV = getBodyPosition3D(a.body, a.simTime, true);
    const pBV = getBodyPosition3D(b.body, b.simTime, true);

    let orbP = null, orbV = null, ok = false, v1 = null, v2 = null;
    if (bestP) {
      orbP = bestP.orb;
      v1 = bestP.sol.v1; v2 = bestP.sol.v2; ok = true;
      const r1V = [pAV.x*AU, pAV.y*AU, pAV.z*AU];
      const r2V = [pBV.x*AU, pBV.y*AU, pBV.z*AU];
      const solV = solveLambertProblem(r1V, r2V, tof, mu, bestP.longWay);
      if (solV) {
        const o = buildTransferOrbit(r1V, solV.v1, mu);
        const hit = propagateOrbit(o, tof);
        if (v3mag(v3sub(hit, r2V)) < 1e6) orbV = o;
      }
    }

    legs.push({
      ok,
      from: a.body.name, to: b.body.name,
      departSimTime: a.simTime, arriveSimTime: b.simTime, tof,
      v1, v2,
      orbitPhysical: orbP,
      orbit: orbV,
      dep3D: pAV, arr3D: pBV,
      longWay: bestP ? bestP.longWay : null,
    });
  }

  const maneuvers = [];
  const flybys = [];
  let dvTotal = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const vPlanet = getBodyVelocity3D(wp.body, wp.simTime, false);
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
  };
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
      const pos_m = propagateOrbit(last.orbit, last.tof);
      return { x: pos_m[0]/AU, y: pos_m[1]/AU, z: pos_m[2]/AU,
               progress: 1, legIndex: legs.length - 1, legProgress: 1, currentLeg: last };
    }

    const elapsed = Math.max(0, currentSimTime - active.departSimTime);
    const legProgress = Math.max(0, Math.min(1, elapsed / active.tof));
    if (active.orbit) {
      const pos_m = propagateOrbit(active.orbit, elapsed);
      return { x: pos_m[0]/AU, y: pos_m[1]/AU, z: pos_m[2]/AU,
               progress: overallProgress, legIndex: activeIdx, legProgress, currentLeg: active };
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
    const pos_m = propagateOrbit(tData.orbit, elapsed);
    return { x: pos_m[0] / AU, y: pos_m[1] / AU, z: pos_m[2] / AU, progress };
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
