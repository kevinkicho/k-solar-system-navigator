/**
 * Arrival-epoch destination body mesh — path end, not the live planet.
 * Display only; does not affect Need.
 */

import * as THREE from 'three';
import { scene } from './setup.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

let epochMesh = null;
let epochLabel = null;

function ensure() {
  if (epochMesh) return epochMesh;
  epochMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 28),
    new THREE.MeshBasicMaterial({
      color: 0xff9800,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      wireframe: false,
    }),
  );
  epochMesh.visible = false;
  epochMesh.renderOrder = 6;
  const div = document.createElement('div');
  div.className = 'planet-label ghost-label epoch-body-label';
  div.textContent = '';
  epochLabel = new CSS2DObject(div);
  epochLabel.position.set(0, 1.4, 0);
  epochLabel.visible = false;
  epochMesh.add(epochLabel);
  epochMesh.userData.labelDiv = div;
  scene.add(epochMesh);
  return epochMesh;
}

/**
 * Place semi-transparent dest body at ARR path end.
 * @param {{ x,y,z, radius?, color?, label? }|null} opts
 */
export function setEpochDestinationBody(opts) {
  const m = ensure();
  if (!opts) {
    hideEpochDestinationBody();
    return;
  }
  m.position.set(opts.x, opts.y, opts.z);
  const r = Math.max(opts.radius || 0.04, 0.025);
  m.scale.setScalar(r);
  if (opts.color != null) m.material.color.setHex(opts.color);
  m.visible = true;
  const div = m.userData.labelDiv;
  if (div && epochLabel) {
    div.textContent = opts.label || 'DEST @ ARR (path end)';
    epochLabel.visible = true;
    epochLabel.scale.setScalar(1 / Math.max(r, 0.01));
  }
}

export function hideEpochDestinationBody() {
  if (!epochMesh) return;
  epochMesh.visible = false;
  if (epochLabel) epochLabel.visible = false;
}
