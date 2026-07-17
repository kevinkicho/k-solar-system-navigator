import { AU, DAY, G_CONST, PI } from '../constants.js';
import { SUN_DATA } from '../data/bodies.js';
import { v3cross, v3mag, v3scale, v3sub } from './vec3.js';
import { getBodyPosition3D, getBodyVelocity3D } from './kepler.js';
import {
  getPlanningPosition3D, getPlanningVelocity3D,
} from './ephemeris-provider.js';
import {
  buildTransferOrbit, buildHelioOrbit, propagateOrbit, propagateHelioOrbit,
  propagateOrbitState, propagateHelioOrbitState,
} from './helio.js';
import { sampleTransferPathAtTime } from './transfer-path.js';
import { solveLambertBestBranch, solveLambertProblem } from './lambert.js';
import { gravityAssistInfo } from './gravity-assist.js';
import {
  applySurfaceEndpoint, isSurfacePointActive, surfacePointMeta,
  resolveParkingAlt_m,
} from './surface-point.js';
import {
  isPlanetRelativeRoute,
  resolvePlanetRelativeCentral,
  planetRelativePeriapsisOk,
  planetRelativeEndpointStates,
} from './planet-relative.js';

/**
 * Analytic coplanar Hohmann when Lambert is singular (~180° transfer).
 * r1, r2 in metres; velocities of the endpoints for prograde sense.
 * @returns {{ v1, v2, orb, transferTime }|null}
 */
function analyticCoplanarHohmann(r1v, r2v, mu, vBody1, vBody2) {
  const r1 = v3mag(r1v);
  const r2 = v3mag(r2v);
  if (!(r1 > 0 && r2 > 0 && mu > 0)) return null;
  const aT = (r1 + r2) / 2;
  if (!(aT > 0)) return null;
  const transferTime = PI * Math.sqrt((aT * aT * aT) / mu);
  const v1t = Math.sqrt(mu * (2 / r1 - 1 / aT));
  const v2t = Math.sqrt(mu * (2 / r2 - 1 / aT));

  // Transfer plane from r1 × r2; fall back to body velocity planes near 180°.
  let h = v3cross(r1v, r2v);
  if (v3mag(h) < 1e-6 * r1 * r2) {
    // Collinear: use r1 × v_body
    const vRef = vBody1 && v3mag(vBody1) > 1 ? vBody1 : vBody2;
    h = v3cross(r1v, vRef || [0, 0, 1]);
    if (v3mag(h) < 1e-12) h = v3cross(r1v, [0, 1, 0]);
    if (v3mag(h) < 1e-12) h = v3cross(r1v, [1, 0, 0]);
  }
  const hHat = v3scale(h, 1 / (v3mag(h) || 1));
  // Prograde tangential at r1: h × r
  let t1 = v3cross(hHat, r1v);
  let t2 = v3cross(hHat, r2v);
  if (v3mag(t1) < 1e-12 || v3mag(t2) < 1e-12) return null;
  t1 = v3scale(t1, 1 / v3mag(t1));
  t2 = v3scale(t2, 1 / v3mag(t2));
  // Outer apoapsis velocity is slower and still prograde along t2
  const v1 = v3scale(t1, v1t);
  const v2 = v3scale(t2, v2t);
  let orb;
  try {
    orb = buildTransferOrbit(r1v, v1, mu);
  } catch {
    return null;
  }
  if (!orb || !isFinite(orb.a) || !isFinite(orb.e)) return null;
  return { v1, v2, orb, transferTime };
}

/** Propagate visual transfer (ellipse or hyperbola). */
export function propagateVisualOrbit(orb, dt) {
  if (!orb) return null;
  if (orb.hyperbolic) return propagateHelioOrbit(orb, dt);
  return propagateOrbit(orb, dt);
}

/**
 * Propagate visual transfer with velocity (m, m/s).
 * @returns {{ r: number[], v: number[], r_mag: number, v_mag: number, nu: number }|null}
 */
export function propagateVisualOrbitState(orb, dt) {
  if (!orb) return null;
  if (orb.hyperbolic) return propagateHelioOrbitState(orb, dt);
  // Near-parabolic / e≥1 built via buildTransferOrbit may lack hyperbolic flag
  if (orb.e >= 1) return propagateHelioOrbitState({ ...orb, hyperbolic: true }, dt);
  return propagateOrbitState(orb, dt);
}

/**
 * Build orbit from Lambert v1; prefer hyperbola-safe build, validate hit.
 * @returns {object|null} orbit
 */
function orbitFromLambertV1(r1v, r2v, tof, mu, v1) {
  try {
    const orbH = buildHelioOrbit(r1v, v1, mu);
    const hitH = propagateHelioOrbit(orbH, tof);
    if (hitH && v3mag(v3sub(hitH, r2v)) < 1e6) return orbH;
  } catch { /* fall through */ }
  try {
    const orbE = buildTransferOrbit(r1v, v1, mu);
    const hitE = propagateOrbit(orbE, tof);
    if (hitE && v3mag(v3sub(hitE, r2v)) < 1e6) return orbE;
  } catch { /* fall through */ }
  return null;
}

/**
 * Build visual-orbit state from Lambert on exaggerated geometry.
 *
 * Phase 1 PR2: force visual longWay = physical when possible, so transfer-angle
 * story matches Δv numbers. Only fall back to free best if forced fails.
 *
 * @returns {{
 *   orbit: object|null,
 *   visualFallback: null|'cosine',
 *   visualLongWay: boolean|null,
 *   visualBranchDiverged: boolean,
 * }}
 */
function tryBuildVisualOrbit(r1v, r2v, tof, mu, vBody1, vBody2, preferredLongWay = null) {
  // 1) Forced physical longWay first (PR2)
  if (preferredLongWay != null) {
    const sol = solveLambertProblem(r1v, r2v, tof, mu, preferredLongWay);
    if (sol) {
      const orb = orbitFromLambertV1(r1v, r2v, tof, mu, sol.v1);
      if (orb) {
        return {
          orbit: orb,
          visualFallback: null,
          visualLongWay: preferredLongWay,
          visualBranchDiverged: false,
        };
      }
    }
  }

  // 2) Free best branch (may diverge from physical longWay)
  const best = solveLambertBestBranch(r1v, r2v, tof, mu, vBody1, vBody2);
  if (best?.sol?.v1) {
    const orb = orbitFromLambertV1(r1v, r2v, tof, mu, best.sol.v1)
      || best.orb
      || null;
    // Validate best.orb if orbitFromLambertV1 failed but best.orb exists
    let useOrb = orb;
    if (!useOrb && best.orb) {
      try {
        const hit = best.orb.hyperbolic
          ? propagateHelioOrbit(best.orb, tof)
          : propagateOrbit(best.orb, tof);
        if (hit && v3mag(v3sub(hit, r2v)) < 1e6) useOrb = best.orb;
      } catch { /* */ }
    }
    if (useOrb) {
      const diverged = preferredLongWay != null && best.longWay !== preferredLongWay;
      return {
        orbit: useOrb,
        visualFallback: null,
        visualLongWay: best.longWay,
        visualBranchDiverged: !!diverged,
      };
    }
  }

  // 3) Cosine fallback
  return {
    orbit: null,
    visualFallback: 'cosine',
    visualLongWay: preferredLongWay,
    visualBranchDiverged: preferredLongWay != null,
  };
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

/**
 * Parent-frame Lambert for same-SOI pairs (Europa→Io, Earth→Moon).
 * Orbit state is stored in parent-centered meters; ship/visual add the
 * central body's heliocentric position at each epoch.
 */
function solvePlanetRelativeTransferOrbit(tData) {
  const central = tData.centralBody || resolvePlanetRelativeCentral(tData.body1, tData.body2);
  if (!central) {
    tData.lambertOk = false;
    return;
  }
  tData.planetRelative = true;
  tData.centralBody = central;
  tData.centralBodyName = central.name;
  tData.orbitFrame = 'planetocentric';

  const mu = G_CONST * central.mass;
  const originPt = tData.surfaceOriginPoint || null;
  const destPt = tData.surfaceDestPoint || null;
  const altDep = resolveParkingAlt_m(tData.body1, originPt);
  const altArr = resolveParkingAlt_m(tData.body2, destPt);

  // Physical (real-inclination) parent-relative states.
  // Parent↔moon uses coplanar Hohmann endpoint construction.
  const { st1, st2 } = planetRelativeEndpointStates(
    tData.body1, tData.body2, central,
    tData.departureSimTime, tData.arrivalSimTime,
    { parkingAlt1_m: altDep, parkingAlt2_m: altArr, exaggerate: false },
  );
  let depS = applySurfaceEndpoint(
    st1.posAU, st1.vel, tData.body1, tData.departureSimTime, originPt,
  );
  let arrS = applySurfaceEndpoint(
    st2.posAU, st2.vel, tData.body2, tData.arrivalSimTime, destPt,
  );
  const depP = depS.pos;
  const arrP = arrS.pos;
  const vBody1 = depS.vel;
  const vBody2 = arrS.vel;
  const r1vP = [depP.x * AU, depP.y * AU, depP.z * AU];
  const r2vP = [arrP.x * AU, arrP.y * AU, arrP.z * AU];

  // Prefer Lambert. Analytic coplanar Hohmann only for parent↔moon parking
  // endpoints (~180° singular geometry) — never for moon↔moon, where a fixed
  // Hohmann TOF at the wrong phase would invent a non-intercepting arc.
  const allowAnalytic = !!(st1.isParking || st2.isParking);
  let bestP = solveLambertBestBranch(
    r1vP, r2vP, tData.transferTime, mu, vBody1, vBody2,
  );
  let usedAnalyticHohmann = false;

  function lambertMissOk(orb, tof, r2) {
    if (!orb) return false;
    try {
      const hit = propagateOrbit(orb, tof);
      if (!hit) return false;
      return v3mag(v3sub(hit, r2)) < 1e6; // 1000 km
    } catch {
      return false;
    }
  }

  if (bestP) {
    if (!planetRelativePeriapsisOk(bestP.orb, central)
        || !lambertMissOk(bestP.orb, tData.transferTime, r2vP)) {
      bestP = null;
    }
  }
  if (!bestP && allowAnalytic) {
    const analytic = analyticCoplanarHohmann(r1vP, r2vP, mu, vBody1, vBody2);
    if (analytic && planetRelativePeriapsisOk(analytic.orb, central)
        && lambertMissOk(analytic.orb, analytic.transferTime, r2vP)) {
      bestP = { sol: { v1: analytic.v1, v2: analytic.v2 }, orb: analytic.orb, longWay: false };
      usedAnalyticHohmann = true;
      if (analytic.transferTime > 0) {
        tData.transferTime = analytic.transferTime;
        tData.arrivalSimTime = tData.departureSimTime + analytic.transferTime;
      }
    }
  }

  let physicsOk = false;
  let chosenLongWay = null;
  if (bestP) {
    physicsOk = true;
    chosenLongWay = bestP.longWay;
    tData.orbitPhysical = bestP.orb;
    // Parent-frame velocities (m/s relative to central).
    tData.v1_lambert = bestP.sol.v1;
    tData.v2_lambert = bestP.sol.v2;
    tData.dv1_lambert = v3mag(v3sub(bestP.sol.v1, vBody1));
    tData.dv2_lambert = v3mag(v3sub(bestP.sol.v2, vBody2));
    tData.dvTotal_lambert = tData.dv1_lambert + tData.dv2_lambert;
    tData.longWay = chosenLongWay;
    tData.analyticHohmann = usedAnalyticHohmann;
    tData.surfaceOriginMeta = surfacePointMeta(tData.body1, originPt);
    tData.surfaceDestMeta = surfacePointMeta(tData.body2, destPt);
    tData.surfaceOriginOffset_m = depS.offset_m || 0;
    tData.surfaceDestOffset_m = arrS.offset_m || 0;
    tData.originIsParking = !!st1.isParking;
    tData.destIsParking = !!st2.isParking;
    tData.hohmannNote = tData.hohmannNote
      || 'Impulsive parent-centered Hohmann (days-scale for Galilean moons) — not a multi-month gravity-assist tour.';
  }
  tData.lambertOk = physicsOk;

  // Heliocentric markers for ghosts / cosine fallback (exaggerated scene).
  const depV0 = getBodyPosition3D(tData.body1, tData.departureSimTime, true);
  const arrV0 = getBodyPosition3D(tData.body2, tData.arrivalSimTime, true);
  const depVs = applySurfaceEndpoint(depV0, [0, 0, 0], tData.body1, tData.departureSimTime, originPt);
  const arrVs = applySurfaceEndpoint(arrV0, [0, 0, 0], tData.body2, tData.arrivalSimTime, destPt);
  tData.dep3D = depVs.pos;
  tData.arr3D = arrVs.pos;
  tData.orbit = null;
  tData.visualFallback = null;
  tData.visualLongWay = null;
  tData.visualBranchDiverged = false;

  if (physicsOk) {
    // Visual: same parent-frame construction (exaggerated central heliocentric
    // placement is applied later when converting parent-frame → scene).
    const { st1: st1v, st2: st2v } = planetRelativeEndpointStates(
      tData.body1, tData.body2, central,
      tData.departureSimTime, tData.arrivalSimTime,
      { parkingAlt1_m: altDep, parkingAlt2_m: altArr, exaggerate: true },
    );
    const depSv = applySurfaceEndpoint(
      st1v.posAU, st1v.vel, tData.body1, tData.departureSimTime, originPt,
    );
    const arrSv = applySurfaceEndpoint(
      st2v.posAU, st2v.vel, tData.body2, tData.arrivalSimTime, destPt,
    );
    const r1vV = [depSv.pos.x * AU, depSv.pos.y * AU, depSv.pos.z * AU];
    const r2vV = [arrSv.pos.x * AU, arrSv.pos.y * AU, arrSv.pos.z * AU];
    if (usedAnalyticHohmann) {
      const aVis = analyticCoplanarHohmann(r1vV, r2vV, mu, depSv.vel, arrSv.vel);
      tData.orbit = aVis?.orb || tData.orbitPhysical;
      tData.visualFallback = aVis ? null : 'cosine';
      tData.visualLongWay = false;
      tData.visualBranchDiverged = false;
    } else {
      const vis = tryBuildVisualOrbit(
        r1vV, r2vV, tData.transferTime, mu, depSv.vel, arrSv.vel, chosenLongWay,
      );
      tData.orbit = vis.orbit;
      tData.visualFallback = vis.visualFallback;
      tData.visualLongWay = vis.visualLongWay;
      tData.visualBranchDiverged = !!vis.visualBranchDiverged;
    }
  }
}

// Solve Lambert for the single-leg transfer described in tData and cache the orbit.
// We solve twice:
//   (1) PHYSICAL geometry (real inclinations) → orbit used for the Δv numbers,
//       so the mission cost is accurate.
//   (2) VISUAL geometry (exaggerated inclinations) → orbit used for the drawn
//       trajectory line and ship animation, so the ship lines up with the
//       visually-tilted planets.
// Optional surface points (lat/lon/alt) offset r and v at each endpoint.
// Each solve is rejected if propagating the orbit to tof misses r2 by > 1000 km.
// Planet-relative pairs use parent μ (see solvePlanetRelativeTransferOrbit).
export function solveTransferOrbit(tData) {
  if (!tData?.body1 || !tData?.body2) {
    if (tData) tData.lambertOk = false;
    return;
  }
  // Preserve seed flag or re-detect
  if (tData.planetRelative || isPlanetRelativeRoute(tData.body1, tData.body2)) {
    solvePlanetRelativeTransferOrbit(tData);
    return;
  }

  const mu  = G_CONST * SUN_DATA.mass;
  const pOpts = planOpts(tData);
  const originPt = tData.surfaceOriginPoint || null;
  const destPt = tData.surfaceDestPoint || null;

  const depP0 = getPlanningPosition3D(tData.body1, tData.departureSimTime, pOpts);
  const arrP0 = getPlanningPosition3D(tData.body2, tData.arrivalSimTime, pOpts);
  const vBody1_0 = getPlanningVelocity3D(tData.body1, tData.departureSimTime, pOpts);
  const vBody2_0 = getPlanningVelocity3D(tData.body2, tData.arrivalSimTime, pOpts);
  const depS = applySurfaceEndpoint(depP0, vBody1_0, tData.body1, tData.departureSimTime, originPt);
  const arrS = applySurfaceEndpoint(arrP0, vBody2_0, tData.body2, tData.arrivalSimTime, destPt);
  const depP = depS.pos;
  const arrP = arrS.pos;
  const vBody1 = depS.vel;
  const vBody2 = arrS.vel;
  const r1vP = [depP.x * AU, depP.y * AU, depP.z * AU];
  const r2vP = [arrP.x * AU, arrP.y * AU, arrP.z * AU];
  const maxRev = Math.max(0, Math.min(2, Math.floor(tData.maxRevolutions ?? 0)));
  const bestP = solveLambertBestBranch(
    r1vP, r2vP, tData.transferTime, mu, vBody1, vBody2, { maxRevolutions: maxRev },
  );

  let physicsOk = false, chosenLongWay = null;
  if (bestP) {
    physicsOk = true;
    chosenLongWay = bestP.longWay;
    tData.orbitPhysical = bestP.orb;
    tData.revolutions = bestP.revolutions ?? 0;
    // Store the raw Lambert velocity vectors (heliocentric, m/s) so the
    // mission-budget calculator can compute V∞ relative to each SOI parent
    // (= V_lambert − V_parent_helio).  Required when an endpoint is a moon
    // and we want the patched-conic full mission Δv (escape + capture)
    // rather than just the heliocentric leg.
    tData.v1_lambert = bestP.sol.v1;
    tData.v2_lambert = bestP.sol.v2;
    // Δv vs surface-inertial velocity when surface points active (includes spin),
    // else classic body-center velocity.
    tData.dv1_lambert = v3mag(v3sub(bestP.sol.v1, vBody1));
    tData.dv2_lambert = v3mag(v3sub(bestP.sol.v2, vBody2));
    tData.dvTotal_lambert = tData.dv1_lambert + tData.dv2_lambert;
    tData.longWay = chosenLongWay;
    tData.surfaceOriginMeta = surfacePointMeta(tData.body1, originPt);
    tData.surfaceDestMeta = surfacePointMeta(tData.body2, destPt);
    tData.surfaceOriginOffset_m = depS.offset_m || 0;
    tData.surfaceDestOffset_m = arrS.offset_m || 0;
  }
  tData.lambertOk = physicsOk;
  tData.planetRelative = false;
  tData.orbitFrame = 'heliocentric';

  const depV0 = getBodyPosition3D(tData.body1, tData.departureSimTime, true);
  const arrV0 = getBodyPosition3D(tData.body2, tData.arrivalSimTime, true);
  const depVs = applySurfaceEndpoint(depV0, [0, 0, 0], tData.body1, tData.departureSimTime, originPt);
  const arrVs = applySurfaceEndpoint(arrV0, [0, 0, 0], tData.body2, tData.arrivalSimTime, destPt);
  const depV = depVs.pos;
  const arrV = arrVs.pos;
  tData.dep3D = depV;
  tData.arr3D = arrV;
  tData.orbit = null;
  tData.visualFallback = null;
  tData.visualLongWay = null;
  tData.visualBranchDiverged = false;
  if (physicsOk) {
    const r1vV = [depV.x * AU, depV.y * AU, depV.z * AU];
    const r2vV = [arrV.x * AU, arrV.y * AU, arrV.z * AU];
    const v1vis0 = getBodyVelocity3D(tData.body1, tData.departureSimTime, true);
    const v2vis0 = getBodyVelocity3D(tData.body2, tData.arrivalSimTime, true);
    const vBody1v = applySurfaceEndpoint(
      depV0, v1vis0, tData.body1, tData.departureSimTime, originPt,
    ).vel;
    const vBody2v = applySurfaceEndpoint(
      arrV0, v2vis0, tData.body2, tData.arrivalSimTime, destPt,
    ).vel;
    // PR2: force visual longWay = physical when valid
    const vis = tryBuildVisualOrbit(
      r1vV, r2vV, tData.transferTime, mu, vBody1v, vBody2v, chosenLongWay,
    );
    tData.orbit = vis.orbit;
    tData.visualFallback = vis.visualFallback;
    tData.visualLongWay = vis.visualLongWay;
    tData.visualBranchDiverged = !!vis.visualBranchDiverged;
  }
}

/** Heliocentric ship/arc position from parent-frame orbit + central body. */
export function parentFrameToHelioAU(orbitPos_m, central, timeSec, exaggerate = true) {
  if (!orbitPos_m || !central) return null;
  const p = getBodyPosition3D(central, timeSec, exaggerate);
  return {
    x: p.x + orbitPos_m[0] / AU,
    y: p.y + orbitPos_m[1] / AU,
    z: p.z + orbitPos_m[2] / AU,
  };
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
  // Re-solve visual with terminal geographic sites preserved
  const rebuilt = solveMultiLegRoute(td.waypoints || [], {
    ephemerisBackend: td.ephemerisBackend,
    classroomMode: td.classroomMode,
    surfaceOriginPoint: td.surfaceOriginPoint,
    surfaceDestPoint: td.surfaceDestPoint,
  });
  if (rebuilt?.legs) {
    td.legs = rebuilt.legs;
    td.visualFallback = rebuilt.visualFallback;
    td.surfaceOriginMeta = rebuilt.surfaceOriginMeta;
    td.surfaceDestMeta = rebuilt.surfaceDestMeta;
  }
}

// waypoints: [{body, simTime}, …] with length ≥ 2. First is origin, last is
// destination, everything in between is a flyby. Returns a structure similar
// in spirit to single-leg transferData, plus per-leg orbits and per-flyby
// feasibility info.
// routeOpts.surfaceOriginPoint / surfaceDestPoint: convenience for terminals.
// Per-waypoint surfacePoint on each waypoint overrides when active (incl. flybys).
export function solveMultiLegRoute(waypoints, routeOpts = {}) {
  const mu = G_CONST * SUN_DATA.mass;
  const pOpts = multiLegPlanOpts(waypoints, routeOpts);
  const originPt = routeOpts.surfaceOriginPoint || null;
  const destPt = routeOpts.surfaceDestPoint || null;
  const nWp = waypoints.length;

  /** Resolve geographic site for waypoint index. */
  function siteFor(i) {
    const wp = waypoints[i];
    if (wp?.surfacePoint && isSurfacePointActive(wp.surfacePoint)) return wp.surfacePoint;
    if (i === 0 && isSurfacePointActive(originPt)) return originPt;
    if (i === nWp - 1 && isSurfacePointActive(destPt)) return destPt;
    return null;
  }

  const legs = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const tof = b.simTime - a.simTime;
    if (tof <= 0) { legs.push({ ok: false, reason: 'non-positive TOF' }); continue; }

    const ptA = siteFor(i);
    const ptB = siteFor(i + 1);

    // Multi-leg planning positions via provider; visual still Kepler exaggerated.
    let pA = getPlanningPosition3D(a.body, a.simTime, pOpts);
    let pB = getPlanningPosition3D(b.body, b.simTime, pOpts);
    let vA = getPlanningVelocity3D(a.body, a.simTime, pOpts);
    let vB = getPlanningVelocity3D(b.body, b.simTime, pOpts);
    if (ptA) {
      const s = applySurfaceEndpoint(pA, vA, a.body, a.simTime, ptA);
      pA = s.pos; vA = s.vel;
    }
    if (ptB) {
      const s = applySurfaceEndpoint(pB, vB, b.body, b.simTime, ptB);
      pB = s.pos; vB = s.vel;
    }
    const r1P = [pA.x*AU, pA.y*AU, pA.z*AU];
    const r2P = [pB.x*AU, pB.y*AU, pB.z*AU];
    const bestP = solveLambertBestBranch(r1P, r2P, tof, mu, vA, vB);

    let pAV = getBodyPosition3D(a.body, a.simTime, true);
    let pBV = getBodyPosition3D(b.body, b.simTime, true);
    if (ptA) pAV = applySurfaceEndpoint(pAV, [0, 0, 0], a.body, a.simTime, ptA).pos;
    if (ptB) pBV = applySurfaceEndpoint(pBV, [0, 0, 0], b.body, b.simTime, ptB).pos;

    let orbP = null, orbV = null, ok = false, v1 = null, v2 = null;
    let visualFallback = null, visualLongWay = null, visualBranchDiverged = false;
    if (bestP) {
      orbP = bestP.orb;
      v1 = bestP.sol.v1; v2 = bestP.sol.v2; ok = true;
      const r1V = [pAV.x*AU, pAV.y*AU, pAV.z*AU];
      const r2V = [pBV.x*AU, pBV.y*AU, pBV.z*AU];
      let vAv = getBodyVelocity3D(a.body, a.simTime, true);
      let vBv = getBodyVelocity3D(b.body, b.simTime, true);
      if (ptA) vAv = applySurfaceEndpoint(pAV, vAv, a.body, a.simTime, ptA).vel;
      if (ptB) vBv = applySurfaceEndpoint(pBV, vBv, b.body, b.simTime, ptB).vel;
      // PR2: force visual longWay = physical leg longWay
      const vis = tryBuildVisualOrbit(r1V, r2V, tof, mu, vAv, vBv, bestP.longWay);
      orbV = vis.orbit;
      visualFallback = vis.visualFallback;
      visualLongWay = vis.visualLongWay;
      visualBranchDiverged = !!vis.visualBranchDiverged;
    }

    legs.push({
      ok,
      from: a.body.name, to: b.body.name,
      departSimTime: a.simTime, arriveSimTime: b.simTime, tof,
      v1, v2,
      orbitPhysical: orbP,
      orbit: orbV,
      visualFallback,
      visualLongWay,
      visualBranchDiverged,
      dep3D: pAV, arr3D: pBV,
      longWay: bestP ? bestP.longWay : null,
      geoSiteFrom: !!ptA,
      geoSiteTo: !!ptB,
    });
  }

  const maneuvers = [];
  const flybys = [];
  let dvTotal = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    let vPlanet = getPlanningVelocity3D(wp.body, wp.simTime, pOpts);
    const pt = siteFor(i);
    if (pt) {
      const p0 = getPlanningPosition3D(wp.body, wp.simTime, pOpts);
      vPlanet = applySurfaceEndpoint(p0, vPlanet, wp.body, wp.simTime, pt).vel;
    }
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

  const body1 = waypoints[0].body;
  const body2 = waypoints[waypoints.length - 1].body;
  return {
    isMultiLeg: true,
    waypoints,
    legs, maneuvers, flybys,
    dvTotalMultiLeg: dvTotal,
    body1,
    body2,
    departureSimTime: waypoints[0].simTime,
    arrivalSimTime:   waypoints[waypoints.length - 1].simTime,
    transferTime:     waypoints[waypoints.length - 1].simTime - waypoints[0].simTime,
    allLegsOk: legs.every(l => l.ok),
    visualFallback: legs.some((l) => l.ok && l.visualFallback === 'cosine')
      ? 'cosine'
      : (legs.some((l) => l.ok && l.visualFallback === 'physical') ? 'physical' : null),
    visualBranchDiverged: legs.some((l) => l.ok && l.visualBranchDiverged),
    longWay: legs.find((l) => l.ok)?.longWay ?? null,
    surfaceOriginPoint: originPt,
    surfaceDestPoint: destPt,
    surfaceOriginMeta: surfacePointMeta(body1, originPt),
    surfaceDestMeta: surfacePointMeta(body2, destPt),
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

/**
 * Ship position on the planned transfer — **same pipeline as the dashed path**.
 *
 * BREAKING (Phase 1): returns **scene-frame** positions when offset policy is
 * not `none` (default `time_varying`). Callers must NOT re-add
 * `getSunBarycentricOffset`. Heliocentric coords are in `r_helio`.
 * Velocity remains heliocentric 2-body (vis-viva), not scene-tangent.
 *
 * @returns {object|null} { x,y,z, r_helio, frame, offsetPolicy, progress, mode, v_* }
 */
export function getShipPositionOnTransfer(departureSimTime, tData, currentSimTime) {
  if (!tData) return null;
  // Ensure departure epoch is consistent with transfer record
  if (tData.departureSimTime == null && departureSimTime != null) {
    tData = { ...tData, departureSimTime };
  }
  return sampleTransferPathAtTime(tData, currentSimTime, {
    offsetPolicy: tData.pathOffsetPolicy || 'time_varying',
    geometry: 'visual',
  });
}
