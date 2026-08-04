/**
 * Simple camera tour: dolly along current transfer from departure toward arrival.
 */
import * as THREE from 'three';
import { state, scenePathGeometry } from '../state.js';
import { camera3D, controls } from './setup.js';
import { buildTransferPathSamples } from '../physics/transfer-path.js';
import { notify } from '../ui/format.js';

let _raf = 0;
let _running = false;

export function stopCameraTour() {
  _running = false;
  if (_raf) cancelAnimationFrame(_raf);
  _raf = 0;
}

/**
 * Animate camera along transfer path (~6s).
 */
export function startTransferTour() {
  stopCameraTour();
  const td = state.transferData;
  if (!td || !state.showTransferOrbit) {
    notify('COMPUTE A TRANSFER FIRST');
    return;
  }
  if (td.isMultiLeg) {
    notify('TOUR: single-leg only for now');
    return;
  }

  const geom = scenePathGeometry();
  const built = buildTransferPathSamples(td, {
    geometry: geom,
    exaggerate: geom === 'visual',
    nSamples: 80,
    offsetPolicy: state.pathOffsetPolicy || 'time_varying',
  });
  const pts = built?.points;
  if (!pts || pts.length < 4) {
    notify('TOUR: no path samples');
    return;
  }

  state.followMode = false;
  state.followShip = false;
  _running = true;
  notify('CAMERA TOUR · transfer path');

  const durationMs = 7000;
  const t0 = performance.now();
  const up = new THREE.Vector3(0, 1, 0);

  function frame(now) {
    if (!_running) return;
    const u = Math.min(1, (now - t0) / durationMs);
    // Ease in-out
    const e = u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2;
    const idx = Math.min(pts.length - 2, Math.floor(e * (pts.length - 1)));
    const p = pts[idx];
    const p2 = pts[Math.min(pts.length - 1, idx + 1)];
    const target = new THREE.Vector3(p.x, p.y, p.z);
    const ahead = new THREE.Vector3(p2.x - p.x, p2.y - p.y, p2.z - p.z);
    if (ahead.lengthSq() < 1e-12) ahead.set(0, 0.2, 1);
    ahead.normalize();
    // Camera sits slightly above and behind the path direction
    const offset = ahead.clone().multiplyScalar(-0.55).add(up.clone().multiplyScalar(0.25));
    camera3D.position.copy(target).add(offset);
    controls.target.copy(target);
    controls.update();

    if (u < 1) {
      _raf = requestAnimationFrame(frame);
    } else {
      _running = false;
      notify('TOUR COMPLETE');
    }
  }
  _raf = requestAnimationFrame(frame);
}
