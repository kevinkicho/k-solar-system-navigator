import * as THREE from 'three';
import { TWO_PI } from '../constants.js';
import { scene } from './setup.js';

const n = 3000, pos = new Float32Array(n * 3);
for (let i = 0; i < n; i++) {
  const a = Math.random() * TWO_PI, r = 2.1 + Math.random() * 1.2;
  pos[i*3] = Math.cos(a)*r;
  pos[i*3+1] = (Math.random()-0.5)*0.15;
  pos[i*3+2] = Math.sin(a)*r;
}
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
scene.add(new THREE.Points(g, new THREE.PointsMaterial({
  color: 0x8a7a60, size: 0.015, transparent: true, opacity: 0.35, sizeAttenuation: true,
})));
