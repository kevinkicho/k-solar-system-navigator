import * as THREE from 'three';
import { TWO_PI } from '../constants.js';
import { scene } from './setup.js';

const g = new THREE.Group();
const ringMat = new THREE.LineBasicMaterial({ color: 0x003060, transparent: true, opacity: 0.12 });
for (let i = 1; i <= 35; i++) {
  const pts = [];
  for (let j = 0; j <= 128; j++) {
    const a = (j / 128) * TWO_PI;
    pts.push(new THREE.Vector3(Math.cos(a)*i, 0, Math.sin(a)*i));
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
}
const radMat = new THREE.LineBasicMaterial({ color: 0x003060, transparent: true, opacity: 0.06 });
for (let i = 0; i < 24; i++) {
  const a = (i / 24) * TWO_PI;
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a)*35, 0, Math.sin(a)*35),
  ]), radMat));
}
scene.add(g);
