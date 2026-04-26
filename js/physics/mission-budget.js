// Patched-conic mission Δv budget for transfers that touch a moon.
//
// The Lambert solver gives us the heliocentric arc; for planet-to-planet
// missions the V∞ values relative to each planet are exactly Δv1 / Δv2
// (since v_planet_helio is what we subtract from v_lambert).  But when a
// moon is involved, the "interplanetary leg only" Δv is misleading — the
// real mission needs to escape the parent's gravity well and capture into
// (or from) the moon's parent.  This module computes those extra phases.
//
// Model:
//   ORIGIN side:
//     Planet origin: spacecraft starts in low planet parking orbit; one burn
//       to escape with V∞ relative to planet.  Δv = √(V∞² + 2μ/r) − √(μ/r).
//     Moon origin:   spacecraft starts in low moon parking orbit.
//       Phase 1: escape moon SOI (V∞ rel moon → 0).  Δv = (√2−1)·v_circ_moon.
//       Phase 2: at moon's distance from parent, burn to escape parent SOI
//                with V∞ relative to parent.  Δv = √(V∞² + 2μ_p/r_moon) − v_circ_at_moon.
//
//   ARRIVAL side: mirror image.
//     Planet arrival: capture into low planet parking orbit from V∞.
//     Moon arrival:   capture into circular orbit at moon's distance, then
//                     transfer down to low moon orbit.
//
// Assumptions: 100 km parking-orbit altitude (typical for both planets and
// moons); idealised impulsive burns at periapsis; gravity assists not
// modelled (would lower Δv significantly).

import { G_CONST } from '../constants.js';
import { BODIES } from '../data/bodies.js';
import { v3mag, v3sub } from './vec3.js';
import { getBodyVelocity3D } from './kepler.js';

const PARKING_ALT_M = 100e3;

function getSOIParent(body) {
  if (body.parent) return BODIES.find(b => b.name === body.parent);
  return body;
}

// Δv from low circular parking orbit to a hyperbolic escape with V∞ at infinity.
function escapeFromLowOrbitDV(mu, radius_m, vInf_mps, alt = PARKING_ALT_M) {
  const r = radius_m + alt;
  return Math.sqrt(vInf_mps * vInf_mps + 2 * mu / r) - Math.sqrt(mu / r);
}

// Δv to escape a moon's SOI from low parking orbit (V∞ rel moon = 0 at infinity).
function moonEscapeDV(moon, alt = PARKING_ALT_M) {
  const mu = G_CONST * moon.mass;
  const r = moon.radius + alt;
  return (Math.sqrt(2) - 1) * Math.sqrt(mu / r);
}

// Δv to capture from V∞ at parent SOI infinity into a circular orbit at the
// moon's heliocentric-equivalent radius (= moon's distance from parent).
// This is the same impulse as escaping in reverse.
function captureToMoonOrbitDV(parent, moon, vInfParent_mps) {
  const mu = G_CONST * parent.mass;
  const r = moon.a_km * 1000;
  const v_circ = Math.sqrt(mu / r);
  const v_periapsis = Math.sqrt(vInfParent_mps * vInfParent_mps + 2 * mu / r);
  return v_periapsis - v_circ;
}

// `td` must be a single-leg transferData with v1_lambert/v2_lambert stored
// (set by solveTransferOrbit).  Returns null if Lambert hasn't solved.
export function computeMissionBudget(td) {
  if (!td || !td.lambertOk || !td.v1_lambert || !td.v2_lambert) return null;

  const origin = td.body1, dest = td.body2;
  const originSOIParent = getSOIParent(origin);
  const destSOIParent   = getSOIParent(dest);

  // V∞ relative to each SOI parent (parent for moons, the body itself for planets).
  const vDepParent = getBodyVelocity3D(originSOIParent, td.departureSimTime, false);
  const vArrParent = getBodyVelocity3D(destSOIParent,   td.arrivalSimTime,   false);
  const vInfDep_vec = v3sub(td.v1_lambert, vDepParent);
  const vInfArr_vec = v3sub(td.v2_lambert, vArrParent);
  const vInfDep = v3mag(vInfDep_vec);
  const vInfArr = v3mag(vInfArr_vec);

  // ── DEPARTURE ───────────────────────────────────────────────────────────
  const dep = { phases: [], total: 0, vInf: vInfDep };
  if (origin.parent) {
    // From low moon parking orbit.
    const dvLift = moonEscapeDV(origin);
    dep.phases.push({ label: `Lift off ${origin.name} (low orbit → SOI escape)`, dv: dvLift });
    // After moon SOI escape: at parent at moon's orbital radius, V≈v_moon.
    const parent = originSOIParent;
    const mu_p = G_CONST * parent.mass;
    const r_moon = origin.a_km * 1000;
    const v_circ = Math.sqrt(mu_p / r_moon);
    const v_required = Math.sqrt(vInfDep * vInfDep + 2 * mu_p / r_moon);
    const dvParentEscape = v_required - v_circ;
    dep.phases.push({ label: `Escape ${parent.name} from ${origin.name} orbit (V∞ = ${(vInfDep/1000).toFixed(2)} km/s)`, dv: dvParentEscape });
    dep.total = dvLift + dvParentEscape;
  } else {
    // From low planet parking orbit.
    const dv = escapeFromLowOrbitDV(G_CONST * origin.mass, origin.radius, vInfDep);
    dep.phases.push({ label: `Escape ${origin.name} from low parking orbit (V∞ = ${(vInfDep/1000).toFixed(2)} km/s)`, dv });
    dep.total = dv;
  }

  // ── ARRIVAL ─────────────────────────────────────────────────────────────
  const arr = { phases: [], total: 0, vInf: vInfArr };
  if (dest.parent) {
    const parent = destSOIParent;
    const dvParentCapture = captureToMoonOrbitDV(parent, dest, vInfArr);
    arr.phases.push({ label: `Capture into ${parent.name} at ${dest.name} orbit (V∞ = ${(vInfArr/1000).toFixed(2)} km/s)`, dv: dvParentCapture });
    const dvMoonCapture = moonEscapeDV(dest);   // mirror burn at moon
    arr.phases.push({ label: `Insert into low ${dest.name} parking orbit`, dv: dvMoonCapture });
    arr.total = dvParentCapture + dvMoonCapture;
  } else {
    const dv = escapeFromLowOrbitDV(G_CONST * dest.mass, dest.radius, vInfArr);
    arr.phases.push({ label: `Capture into low ${dest.name} parking orbit (V∞ = ${(vInfArr/1000).toFixed(2)} km/s)`, dv });
    arr.total = dv;
  }

  return {
    parkingAlt_m: PARKING_ALT_M,
    departure: dep,
    arrival: arr,
    totalMission: dep.total + arr.total,
  };
}
