/**
 * Main-belt asteroids — InstancedMesh for denser, cheaper draw than raw Points.
 */
import * as THREE from 'three';
import { TWO_PI } from '../constants.js';
import { scene } from './setup.js';

const N = 4000;
const geo = new THREE.SphereGeometry(0.006, 4, 3);
const mat = new THREE.MeshBasicMaterial({
  color: 0x8a7a60,
  transparent: true,
  opacity: 0.4,
});
const mesh = new THREE.InstancedMesh(geo, mat, N);
mesh.frustumCulled = true;
mesh.name = 'asteroid-belt';

const dummy = new THREE.Object3D();
const color = new THREE.Color();
for (let i = 0; i < N; i++) {
  const a = Math.random() * TWO_PI;
  const r = 2.1 + Math.random() * 1.2;
  const y = (Math.random() - 0.5) * 0.15;
  dummy.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
  const s = 0.4 + Math.random() * 1.4;
  dummy.scale.setScalar(s);
  dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
  // Slight color variation
  color.setHSL(0.08, 0.15, 0.35 + Math.random() * 0.25);
  if (mesh.setColorAt) mesh.setColorAt(i, color);
}
mesh.instanceMatrix.needsUpdate = true;
if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
scene.add(mesh);

export const asteroidBelt = mesh;
