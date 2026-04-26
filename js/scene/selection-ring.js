import * as THREE from 'three';
import { scene } from './setup.js';

export const selectionRing = new THREE.Mesh(
  new THREE.RingGeometry(1, 1.15, 64),
  new THREE.MeshBasicMaterial({
    color: 0x00d4ff, side: THREE.DoubleSide, transparent: true, opacity: 0.6,
  }),
);
selectionRing.visible = false;
scene.add(selectionRing);
