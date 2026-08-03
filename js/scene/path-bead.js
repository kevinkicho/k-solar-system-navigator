/**
 * Path scrubber bead — tracks sim time along the transfer (scene-frame).
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { state, pathSampleGeometry } from '../state.js';
import { sampleTransferPathAtTime } from '../physics/transfer-path.js';
import { scene } from './setup.js';
import { isSchematic } from '../display-scale.js';

/** @type {THREE.Mesh|null} */
let bead = null;
/** @type {CSS2DObject|null} */
let beadLabel = null;

export function clearPathBead() {
  if (bead) {
    scene.remove(bead);
    bead.geometry?.dispose?.();
    bead.material?.dispose?.();
    bead = null;
  }
  beadLabel = null;
}

function ensureBead() {
  if (bead) return bead;
  bead = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  bead.renderOrder = 10;
  const div = document.createElement('div');
  div.className = 'path-tick-label path-bead-label';
  div.textContent = 'NOW';
  beadLabel = new CSS2DObject(div);
  beadLabel.position.set(0, 0.03, 0);
  bead.add(beadLabel);
  scene.add(bead);
  return bead;
}

/**
 * Update bead position from current transfer + sim time.
 * @param {number} simTime
 */
export function updatePathBead(simTime) {
  if (state.showPathBead === false) {
    if (bead) bead.visible = false;
    return;
  }
  const td = state.transferData;
  if (!td || !state.showTransferOrbit || td.isMultiLeg) {
    if (bead) bead.visible = false;
    return;
  }
  const t0 = td.departureSimTime;
  const t1 = td.arrivalSimTime;
  if (t0 == null || t1 == null) {
    if (bead) bead.visible = false;
    return;
  }

  const geom = pathSampleGeometry();
  const sample = sampleTransferPathAtTime(td, simTime, {
    geometry: geom,
    exaggerate: geom !== 'physical' && !isSchematic() && !state.physicsAccurate,
    offsetPolicy: state.pathOffsetPolicy || 'time_varying',
  });
  if (!sample) {
    if (bead) bead.visible = false;
    return;
  }

  const m = ensureBead();
  m.visible = true;
  m.position.set(sample.x, sample.y, sample.z);

  const frac = Math.min(1, Math.max(0, (simTime - t0) / Math.max(1e-9, t1 - t0)));
  if (beadLabel?.element) {
    beadLabel.element.textContent = simTime < t0
      ? 'PRE'
      : (simTime > t1 ? 'POST' : `${(frac * 100).toFixed(0)}%`);
  }

  // Color: pre=dim, in=white, post=amber
  const col = simTime < t0 ? 0x78909c : (simTime > t1 ? 0xffb74d : 0xffffff);
  m.material.color.setHex(col);
}
