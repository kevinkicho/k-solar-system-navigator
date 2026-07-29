/**
 * Burn Δv direction arrows at departure / arrival (Three.js ArrowHelper).
 * Directions from physical Lambert Δv vectors when available — educational, not thruster geometry.
 */
import * as THREE from 'three';
import { AU } from '../constants.js';
import { state } from '../state.js';
import { getSunBarycentricOffset } from '../physics/kepler.js';
import { scene } from './setup.js';

/** @type {THREE.ArrowHelper|null} */
let depArrow = null;
/** @type {THREE.ArrowHelper|null} */
let arrArrow = null;

function clearOne(a) {
  if (!a) return;
  scene.remove(a);
  a.dispose?.();
}

export function clearDvArrows() {
  clearOne(depArrow); depArrow = null;
  clearOne(arrArrow); arrArrow = null;
}

function makeArrow(dir, origin, color, len) {
  const d = dir.clone().normalize();
  const a = new THREE.ArrowHelper(d, origin, len, color, len * 0.28, len * 0.14);
  a.renderOrder = 8;
  scene.add(a);
  return a;
}

/**
 * Place dep/arr Δv arrows from transfer data (physical preferred).
 * @param {object} td
 * @param {{ depMark?: {x,y,z}, arrMark?: {x,y,z} }} [marks] scene-frame positions
 */
export function setDvArrows(td, marks = {}) {
  clearDvArrows();
  if (!td || state.showDvArrows === false) return;
  if (td.isMultiLeg) return;

  // Δv vectors: v_transfer − v_body (m/s), physical Lambert
  const dv1 = td.v1_lambert && td.v_body1
    ? sub3(td.v1_lambert, td.v_body1)
    : (td.v1_lambert && td.v_planet1 ? sub3(td.v1_lambert, td.v_planet1) : null);
  // Arrival burn direction ~ v_body − v_transfer for capture-class insert
  const dv2 = td.v2_lambert && td.v_body2
    ? sub3(td.v_body2, td.v2_lambert)
    : (td.v2_lambert && td.v_planet2 ? sub3(td.v_planet2, td.v2_lambert) : null);

  // Fallback: transfer velocity at endpoints if absolute vectors exist
  const depDir = asVec(dv1) || asVec(td.v1_lambert) || asVec(td.v1);
  const arrDir = asVec(dv2) || asVec(td.v2_lambert) || asVec(td.v2);
  if (!depDir && !arrDir) return;

  const depT = td.departureSimTime ?? 0;
  const arrT = td.arrivalSimTime ?? depT;
  const depOff = getSunBarycentricOffset(depT);
  const arrOff = getSunBarycentricOffset(arrT);

  const depOrigin = marks.depMark
    ? new THREE.Vector3(marks.depMark.x, marks.depMark.y, marks.depMark.z)
    : new THREE.Vector3(
      (td.dep3D?.x || 0) + depOff.x,
      (td.dep3D?.y || 0) + depOff.y,
      (td.dep3D?.z || 0) + depOff.z,
    );
  const arrOrigin = marks.arrMark
    ? new THREE.Vector3(marks.arrMark.x, marks.arrMark.y, marks.arrMark.z)
    : new THREE.Vector3(
      (td.arr3D?.x || 0) + arrOff.x,
      (td.arr3D?.y || 0) + arrOff.y,
      (td.arr3D?.z || 0) + arrOff.z,
    );

  const mag1 = td.dv1_lambert ?? td.dv1 ?? 3000;
  const mag2 = td.dv2_lambert ?? td.dv2 ?? 3000;
  const len1 = Math.min(0.45, Math.max(0.06, (mag1 / 1000) * 0.05));
  const len2 = Math.min(0.45, Math.max(0.06, (mag2 / 1000) * 0.05));

  if (depDir) depArrow = makeArrow(depDir, depOrigin, 0x00e676, len1);
  if (arrDir) arrArrow = makeArrow(arrDir, arrOrigin, 0xff9800, len2);
}

function asVec(v) {
  if (!v) return null;
  if (Array.isArray(v) && v.length >= 3) {
    const t = new THREE.Vector3(v[0], v[1], v[2]);
    return t.lengthSq() > 1e-24 ? t : null;
  }
  if (typeof v === 'object' && v.x != null) {
    const t = new THREE.Vector3(v.x, v.y, v.z);
    return t.lengthSq() > 1e-24 ? t : null;
  }
  return null;
}

function sub3(a, b) {
  if (!a || !b) return null;
  const ax = Array.isArray(a) ? a[0] : a.x;
  const ay = Array.isArray(a) ? a[1] : a.y;
  const az = Array.isArray(a) ? a[2] : a.z;
  const bx = Array.isArray(b) ? b[0] : b.x;
  const by = Array.isArray(b) ? b[1] : b.y;
  const bz = Array.isArray(b) ? b[2] : b.z;
  return [ax - bx, ay - by, az - bz];
}

// silence unused
void AU;
