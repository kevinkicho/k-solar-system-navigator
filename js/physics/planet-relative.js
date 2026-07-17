/**
 * Planet-relative (parent-centered) transfers for same-SOI pairs:
 *   moon ↔ parent   (e.g. Earth → Moon)
 *   co-parent moons (e.g. Europa → Io)
 *
 * Heliocentric Lambert is dishonest inside one planetary SOI — the craft
 * never leaves the parent's gravity well.  These helpers size a parent-frame
 * Hohmann seed and expose relative state for parent-μ Lambert.
 *
 * Concept-grade patched-conic sketch, not CR3BP / n-body.
 */

import { AU, DAY, G_CONST, PI, TWO_PI } from '../constants.js';
import { BODIES } from '../data/bodies.js';
import { getBodyPosition3D, getBodyVelocity3D } from './kepler.js';
import { defaultParkingAlt_m } from './surface-point.js';
import { v3cross, v3mag, v3scale, v3sub } from './vec3.js';

/**
 * True when origin and destination share a gravity well such that a
 * heliocentric Lambert arc would be the wrong model.
 */
export function isPlanetRelativeRoute(b1, b2) {
  return !!resolvePlanetRelativeCentral(b1, b2);
}

/**
 * Central body for a planet-relative pair, or null if heliocentric.
 * - moon → parent / parent → moon → the planet
 * - co-parent moons → shared parent
 */
export function resolvePlanetRelativeCentral(b1, b2) {
  if (!b1 || !b2) return null;
  if (b1.parent && b1.parent === b2.name) {
    return BODIES.find((b) => b.name === b2.name) || b2;
  }
  if (b2.parent && b2.parent === b1.name) {
    return BODIES.find((b) => b.name === b1.name) || b1;
  }
  if (b1.parent && b2.parent && b1.parent === b2.parent) {
    return BODIES.find((b) => b.name === b1.parent) || null;
  }
  return null;
}

/** Mean orbital / parking radius about `central` (m). */
export function bodyOrbitalRadius_m(body, central) {
  if (!body || !central) return 0;
  if (body.name === central.name) {
    return central.radius + defaultParkingAlt_m(central);
  }
  if (body.a_km != null && isFinite(body.a_km) && body.a_km > 0) {
    return body.a_km * 1000;
  }
  return (body.radius || 0) + defaultParkingAlt_m(body);
}

/**
 * Position (AU, parent-centered) and velocity (m/s, parent-relative)
 * of `body` about `central` at `timeSec`.
 *
 * When `body` is the central planet, uses a circular parking-orbit state
 * in the direction of `towardBody` (or +X) so Lambert is well-posed.
 */
export function parentRelativeState(body, central, timeSec, opts = {}) {
  const exaggerate = !!opts.exaggerate;
  const towardBody = opts.towardBody || null;
  const parkingAlt_m = opts.parkingAlt_m != null
    ? opts.parkingAlt_m
    : defaultParkingAlt_m(central);

  if (body.name === central.name) {
    // Parking orbit about the central body (not r=0).
    let toward_m;
    if (towardBody && towardBody.name !== central.name) {
      const st = parentRelativeState(towardBody, central, timeSec, {
        exaggerate,
        // no nesting of parking
      });
      toward_m = [
        st.posAU.x * AU,
        st.posAU.y * AU,
        st.posAU.z * AU,
      ];
    } else {
      toward_m = [1, 0, 0];
    }
    const magT = v3mag(toward_m) || 1;
    const rHat = v3scale(toward_m, 1 / magT);
    const rPark = central.radius + parkingAlt_m;
    const pos_m = v3scale(rHat, rPark);
    // Circular velocity in the plane ⊥ rHat, preferring ecliptic-normal-ish (scene y).
    const mu = G_CONST * central.mass;
    let tHat = v3cross([0, 1, 0], rHat);
    if (v3mag(tHat) < 1e-12) tHat = v3cross([1, 0, 0], rHat);
    const tMag = v3mag(tHat) || 1;
    tHat = v3scale(tHat, 1 / tMag);
    // Match orbital sense of the other body when available (prograde-ish).
    if (towardBody && towardBody.name !== central.name) {
      const stO = parentRelativeState(towardBody, central, timeSec, { exaggerate });
      const h = v3cross(pos_m, stO.vel);
      // If our tHat is anti-aligned with expected prograde, flip.
      const vTrial = v3scale(tHat, Math.sqrt(mu / rPark));
      const prograde = v3cross(pos_m, vTrial);
      if (v3mag(h) > 0 && prograde[0] * h[0] + prograde[1] * h[1] + prograde[2] * h[2] < 0) {
        tHat = v3scale(tHat, -1);
      }
    }
    const vCirc = Math.sqrt(mu / rPark);
    const vel = v3scale(tHat, vCirc);
    return {
      posAU: {
        x: pos_m[0] / AU,
        y: pos_m[1] / AU,
        z: pos_m[2] / AU,
        r: rPark / AU,
      },
      vel,
      isParking: true,
    };
  }

  // Moon (or other satellite) relative to parent: heliocentric difference.
  const pB = getBodyPosition3D(body, timeSec, exaggerate);
  const pC = getBodyPosition3D(central, timeSec, exaggerate);
  const vB = getBodyVelocity3D(body, timeSec, exaggerate);
  const vC = getBodyVelocity3D(central, timeSec, exaggerate);
  const x = pB.x - pC.x;
  const y = pB.y - pC.y;
  const z = pB.z - pC.z;
  return {
    posAU: { x, y, z, r: Math.sqrt(x * x + y * y + z * z) },
    vel: v3sub(vB, vC),
    isParking: false,
  };
}

/**
 * Hohmann-class seed for a planet-relative transfer (TOF + rough Δv).
 * Uses mean orbital radii about the shared parent.
 */
export function planetRelativeTransferSeed(body1, body2, departureSimTime) {
  const central = resolvePlanetRelativeCentral(body1, body2);
  if (!central) {
    throw new Error('planetRelativeTransferSeed: not a planet-relative pair');
  }
  const mu = G_CONST * central.mass;
  const r1 = bodyOrbitalRadius_m(body1, central);
  const r2 = bodyOrbitalRadius_m(body2, central);
  const aT_m = (r1 + r2) / 2;
  const transferTime = PI * Math.sqrt((aT_m * aT_m * aT_m) / mu);

  const v1c = Math.sqrt(mu / r1);
  const v1t = Math.sqrt(mu * (2 / r1 - 1 / aT_m));
  const dv1 = Math.abs(v1t - v1c);
  const v2c = Math.sqrt(mu / r2);
  const v2t = Math.sqrt(mu * (2 / r2 - 1 / aT_m));
  const dv2 = Math.abs(v2c - v2t);

  // Phase for coplanar circular model (same formula as heliocentric Hohmann).
  const phaseAngle = PI * (1 - Math.pow((r1 + r2) / (2 * r2), 1.5));

  // Approximate current phase from parent-relative positions at departure.
  const s1 = parentRelativeState(body1, central, departureSimTime, { towardBody: body2 });
  const s2 = parentRelativeState(body2, central, departureSimTime, { towardBody: body1 });
  const angle1 = Math.atan2(s1.posAU.z, s1.posAU.x);
  const angle2 = Math.atan2(s2.posAU.z, s2.posAU.x);
  const currentPhase = ((angle2 - angle1) % TWO_PI + TWO_PI) % TWO_PI;

  // Mean motions from orbital radii (circular).
  const n1 = Math.sqrt(mu / (r1 * r1 * r1));
  const n2 = Math.sqrt(mu / (r2 * r2 * r2));
  const relativeRate = n2 - n1;
  const phaseDiff = ((phaseAngle - currentPhase) % TWO_PI + TWO_PI) % TWO_PI;
  const timeToWindow = Math.abs(relativeRate) > 1e-20
    ? phaseDiff / Math.abs(relativeRate)
    : Infinity;

  const arrivalSimTime = departureSimTime + transferTime;
  const pos1 = getBodyPosition3D(body1, departureSimTime);
  const pos2 = getBodyPosition3D(body2, departureSimTime);
  const posArrival = getBodyPosition3D(body2, arrivalSimTime);

  return {
    transferTime,
    dv1,
    dv2,
    dvTotal: dv1 + dv2,
    aT: aT_m,
    r1,
    r2,
    phaseAngle,
    currentPhase,
    timeToWindow,
    pos1,
    pos2,
    posArrival,
    body1,
    body2,
    departureSimTime,
    arrivalSimTime,
    planetRelative: true,
    centralBody: central,
    centralBodyName: central.name,
    // Rough circular period of intermediate orbit (for UI).
    periodHint_d: (2 * transferTime) / DAY,
  };
}

/** Periapsis distance (m) of a parent-frame orbit about `central`. */
export function planetRelativePeriapsis_m(orbit) {
  if (!orbit || !isFinite(orbit.a) || !isFinite(orbit.e)) return null;
  // Hyperbolic / negative-a: use |a|(e-1) periapsis formula when e≥1
  if (orbit.e >= 1 || orbit.a < 0) {
    const aAbs = Math.abs(orbit.a);
    return aAbs * (orbit.e - 1);
  }
  return orbit.a * (1 - orbit.e);
}

/**
 * True if parent-frame periapsis clears the central body.
 * Uses absolute clearance (default 1 km) so LEO-class parking at R+100 km
 * is not rejected by a 2% radius margin (which sits above 100 km altitude).
 */
export function planetRelativePeriapsisOk(orbit, central, clearance_m = 1000) {
  const peri = planetRelativePeriapsis_m(orbit);
  if (peri == null || !central) return false;
  return peri >= central.radius + clearance_m;
}

function v3norm(a) {
  const m = v3mag(a);
  if (m < 1e-18) return [1, 0, 0];
  return v3scale(a, 1 / m);
}

/**
 * Endpoint states for a parent-frame Lambert solve.
 * Moon–moon: true parent-relative ephemeris.
 * Parent↔moon: coplanar 180° Hohmann geometry so periapsis sits on the
 * parking orbit (avoids Earth-grazing ellipses from naive “toward moon”
 * parking placement).
 *
 * @returns {{ st1, st2 }}
 */
export function planetRelativeEndpointStates(body1, body2, central, depT, arrT, opts = {}) {
  const alt1 = opts.parkingAlt1_m != null ? opts.parkingAlt1_m : defaultParkingAlt_m(
    body1.name === central.name ? central : body1,
  );
  const alt2 = opts.parkingAlt2_m != null ? opts.parkingAlt2_m : defaultParkingAlt_m(
    body2.name === central.name ? central : body2,
  );
  const exaggerate = !!opts.exaggerate;
  const originIsCentral = body1.name === central.name;
  const destIsCentral = body2.name === central.name;

  if (!originIsCentral && !destIsCentral) {
    return {
      st1: parentRelativeState(body1, central, depT, { exaggerate }),
      st2: parentRelativeState(body2, central, arrT, { exaggerate }),
    };
  }

  const mu = G_CONST * central.mass;
  const moon = originIsCentral ? body2 : body1;
  const moonDep = parentRelativeState(moon, central, depT, { exaggerate });
  const moonArr = parentRelativeState(moon, central, arrT, { exaggerate });
  const rPark1 = central.radius + alt1;
  const rPark2 = central.radius + alt2;

  if (originIsCentral && !destIsCentral) {
    // LEO-class → moon: parking at periapsis, 180° from moon arrival position.
    const r2_m = [moonArr.posAU.x * AU, moonArr.posAU.y * AU, moonArr.posAU.z * AU];
    const r2hat = v3norm(r2_m);
    const r1_m = v3scale(r2hat, -rPark1);
    // Prograde circular parking (preferred); Lambert overwrites sc velocity.
    let tHat = v3cross([0, 1, 0], r1_m);
    if (v3mag(tHat) < 1e-12) tHat = v3cross([1, 0, 0], r1_m);
    tHat = v3norm(tHat);
    // Match moon orbital sense at arrival
    const hMoon = v3cross(r2_m, moonArr.vel);
    const vTrial = v3scale(tHat, Math.sqrt(mu / rPark1));
    const hPark = v3cross(r1_m, vTrial);
    if (v3mag(hMoon) > 0
        && hPark[0] * hMoon[0] + hPark[1] * hMoon[1] + hPark[2] * hMoon[2] < 0) {
      tHat = v3scale(tHat, -1);
    }
    const vel1 = v3scale(tHat, Math.sqrt(mu / rPark1));
    return {
      st1: {
        posAU: {
          x: r1_m[0] / AU, y: r1_m[1] / AU, z: r1_m[2] / AU, r: rPark1 / AU,
        },
        vel: vel1,
        isParking: true,
      },
      st2: moonArr,
    };
  }

  if (!originIsCentral && destIsCentral) {
    // Moon → LEO-class: parking at periapsis, 180° from moon departure.
    const r1_m = [moonDep.posAU.x * AU, moonDep.posAU.y * AU, moonDep.posAU.z * AU];
    const r1hat = v3norm(r1_m);
    const r2_m = v3scale(r1hat, -rPark2);
    let tHat = v3cross([0, 1, 0], r2_m);
    if (v3mag(tHat) < 1e-12) tHat = v3cross([1, 0, 0], r2_m);
    tHat = v3norm(tHat);
    const hMoon = v3cross(r1_m, moonDep.vel);
    const vTrial = v3scale(tHat, Math.sqrt(mu / rPark2));
    const hPark = v3cross(r2_m, vTrial);
    if (v3mag(hMoon) > 0
        && hPark[0] * hMoon[0] + hPark[1] * hMoon[1] + hPark[2] * hMoon[2] < 0) {
      tHat = v3scale(tHat, -1);
    }
    const vel2 = v3scale(tHat, Math.sqrt(mu / rPark2));
    return {
      st1: moonDep,
      st2: {
        posAU: {
          x: r2_m[0] / AU, y: r2_m[1] / AU, z: r2_m[2] / AU, r: rPark2 / AU,
        },
        vel: vel2,
        isParking: true,
      },
    };
  }

  // parent → parent (shouldn't happen)
  return {
    st1: parentRelativeState(body1, central, depT, { exaggerate, towardBody: body2, parkingAlt_m: alt1 }),
    st2: parentRelativeState(body2, central, arrT, { exaggerate, towardBody: body1, parkingAlt_m: alt2 }),
  };
}
