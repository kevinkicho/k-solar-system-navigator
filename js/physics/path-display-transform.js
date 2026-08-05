/**
 * Display-only path transforms — do not change Need / Lambert Δv.
 *
 * cinematic_endpoints: sample the **physical** transfer orbit, then blend
 * endpoint offsets so the drawn arc meets exaggerated (cinematic) body
 * positions. One solve, two projections — Present mode product path.
 */

import { getBodyPosition3D } from './kepler.js';

/**
 * Linear blend of (visual − physical) endpoint offsets along TOF.
 * @param {{x:number,y:number,z:number}} hHelio physical heliocentric AU
 * @param {object} td transferData
 * @param {number} tAbs absolute sim time
 * @param {{ tDep: number, tArr: number, tof: number }} cfg
 * @returns {{x:number,y:number,z:number}}
 */
export function cinematicEndpointBlend(hHelio, td, tAbs, cfg) {
  if (!hHelio || !td?.body1 || !td?.body2) return hHelio;
  const tDep = cfg.tDep ?? td.departureSimTime ?? 0;
  const tof = cfg.tof ?? td.transferTime ?? 0;
  const tArr = cfg.tArr ?? td.arrivalSimTime ?? (tDep + tof);
  const f = tof > 0 ? Math.max(0, Math.min(1, (tAbs - tDep) / tof)) : 0;

  const depP = getBodyPosition3D(td.body1, tDep, false);
  const depV = getBodyPosition3D(td.body1, tDep, true);
  const arrP = getBodyPosition3D(td.body2, tArr, false);
  const arrV = getBodyPosition3D(td.body2, tArr, true);
  if (!depP || !depV || !arrP || !arrV) return hHelio;

  const ox = (depV.x - depP.x) * (1 - f) + (arrV.x - arrP.x) * f;
  const oy = (depV.y - depP.y) * (1 - f) + (arrV.y - arrP.y) * f;
  const oz = (depV.z - depP.z) * (1 - f) + (arrV.z - arrP.z) * f;

  return {
    x: hHelio.x + ox,
    y: hHelio.y + oy,
    z: hHelio.z + oz,
  };
}

/**
 * @param {object|null} hHelio helio sample (may include v, nu, …)
 * @param {object} td
 * @param {number} tAbs
 * @param {object} cfg resolvePathOpts result
 */
export function applyDisplayTransformHelio(hHelio, td, tAbs, cfg) {
  if (!hHelio || !cfg?.displayTransform) return hHelio;
  if (cfg.displayTransform === 'cinematic_endpoints') {
    const p = cinematicEndpointBlend(hHelio, td, tAbs, cfg);
    return {
      ...hHelio,
      x: p.x,
      y: p.y,
      z: p.z,
      displayTransform: 'cinematic_endpoints',
    };
  }
  return hHelio;
}
