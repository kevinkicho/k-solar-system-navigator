/**
 * Camera focus helpers — frame body + Hill sphere / SOI for relative scale.
 */
import * as THREE from 'three';
import { state } from '../state.js';
import { SUN_DATA } from '../data/bodies.js';
import { camera3D, controls } from '../scene/setup.js';
import { planetMeshes } from '../scene/planets.js';
import { moonMeshes } from '../scene/moons.js';
import { hillMeshes } from '../scene/gravity-field.js';
import { notify } from './format.js';

/**
 * Smooth-ish frame of selected body with Hill sphere context.
 * @param {object} [body] defaults to state.selectedBody
 */
export function focusBodyWithSoi(body = state.selectedBody) {
  if (!body) {
    notify('SELECT A BODY FIRST');
    return;
  }
  const mesh = planetMeshes.get(body.name) || moonMeshes.get(body.name);
  if (!mesh) {
    notify(`NO MESH FOR ${body.name.toUpperCase()}`);
    return;
  }

  state.followMode = true;
  state.followShip = false;
  state.selectedBody = body;

  const pos = mesh.position.clone();
  controls.target.copy(pos);

  // Hill radius (AU) if known; else use display radius × scale
  let rHill = 0.15;
  const hill = hillMeshes.get(body.name);
  if (hill?.rHillAU) rHill = hill.rHillAU;
  else if (body.a != null && body.mass != null && SUN_DATA?.mass) {
    rHill = body.a * Math.cbrt(body.mass / (3 * SUN_DATA.mass));
  } else if (body.displayRadius) {
    rHill = Math.max(0.05, body.displayRadius * 40);
  }

  const dist = Math.max(0.12, Math.min(25, rHill * 3.5));
  // Place camera along current view direction if possible
  const offset = new THREE.Vector3();
  offset.subVectors(camera3D.position, controls.target);
  if (offset.lengthSq() < 1e-8) offset.set(0.4, 0.6, 1);
  offset.normalize().multiplyScalar(dist);
  camera3D.position.copy(pos).add(offset);
  controls.update();

  notify(`FOCUS ${body.name.toUpperCase()} · Hill≈${rHill.toFixed(3)} AU`);
}

export function wireCameraFocus() {
  const btn = document.getElementById('view-focus-soi');
  if (btn) {
    btn.onclick = () => focusBodyWithSoi();
  }
}
