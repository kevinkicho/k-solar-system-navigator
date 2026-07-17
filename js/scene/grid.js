import * as THREE from 'three';
import { TWO_PI } from '../constants.js';
import { scene } from './setup.js';

// Ecliptic AU rings only — radial spokes from the Sun were visually noisy
// (read as black lines against the dark sky) and added no scale cue the
// concentric rings don't already provide.
const g = new THREE.Group();
const ringMat = new THREE.LineBasicMaterial({ color: 0x003060, transparent: true, opacity: 0.12 });
for (let i = 1; i <= 35; i++) {
  const pts = [];
  for (let j = 0; j <= 128; j++) {
    const a = (j / 128) * TWO_PI;
    pts.push(new THREE.Vector3(Math.cos(a) * i, 0, Math.sin(a) * i));
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
}
scene.add(g);
