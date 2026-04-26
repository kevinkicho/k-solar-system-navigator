import * as THREE from 'three';
import {
  AU, FIELD_DEPTH, FIELD_EXTENT, FIELD_GRID, FIELD_R_MIN, G_CONST, PI,
} from '../constants.js';
import { BODIES, SUN_DATA } from '../data/bodies.js';
import { state } from '../state.js';
import { scene } from './setup.js';
import { sunMesh } from './sun.js';

export const FX = { potential: false, hill: false };

// Rubber-sheet potential well: a mesh on the ecliptic (y=0), with vertex y
// displaced by Φ = -Σ Gmᵢ/rᵢ from all major bodies, log-scaled. Updated on
// demand, not every frame (O(grid × bodies)).
export const potentialGeo = new THREE.PlaneGeometry(
  FIELD_EXTENT * 2, FIELD_EXTENT * 2, FIELD_GRID - 1, FIELD_GRID - 1,
);
potentialGeo.rotateX(-PI / 2);
const potentialColor = new Float32Array(potentialGeo.attributes.position.count * 3);
potentialGeo.setAttribute('color', new THREE.BufferAttribute(potentialColor, 3));
const potentialMat = new THREE.MeshBasicMaterial({
  vertexColors: true, wireframe: true, transparent: true, opacity: 0.45,
  depthWrite: false,
});
export const potentialMesh = new THREE.Mesh(potentialGeo, potentialMat);
potentialMesh.visible = false;
potentialMesh.renderOrder = -1;
scene.add(potentialMesh);

export function updatePotentialField() {
  if (!potentialMesh.visible) return;
  const pos = potentialGeo.attributes.position;
  const col = potentialGeo.attributes.color;
  const sunX = sunMesh.position.x, sunZ = sunMesh.position.z;
  const masses = [{ m: SUN_DATA.mass, x: sunX, z: sunZ }];
  for (const b of BODIES) {
    const p = state.bodyPositions.get(b.name);
    if (p) masses.push({ m: b.mass, x: p.x, z: p.z });
  }
  const PHI_REF = G_CONST * SUN_DATA.mass / AU;
  const N = pos.count;
  for (let i = 0; i < N; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let phi = 0;
    for (let k = 0; k < masses.length; k++) {
      const m = masses[k];
      const dx = x - m.x, dz = z - m.z;
      const r = Math.max(Math.sqrt(dx * dx + dz * dz), FIELD_R_MIN);
      phi -= G_CONST * m.m / (r * AU);
    }
    const normDepth = Math.log1p(Math.abs(phi) / PHI_REF);
    pos.setY(i, -FIELD_DEPTH * normDepth);
    const t = Math.min(1, normDepth / 3.0);
    col.setXYZ(i, 0.0 + t * 1.0, 0.4 + t * 0.1, 0.8 - t * 0.8);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
}

// Hill spheres: R_H = a · cbrt(m / 3M_sun). Region where this planet's gravity
// dominates over the Sun's tidal force. Real scales — Jupiter's is huge, Mercury's tiny.
export const hillMeshes = new Map();
for (const b of BODIES) {
  const rHillAU = b.a * Math.cbrt(b.mass / (3 * SUN_DATA.mass));
  const geo = new THREE.SphereGeometry(rHillAU, 32, 20);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(b.color),
    transparent: true, opacity: 0.09, depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  scene.add(mesh);
  hillMeshes.set(b.name, { mesh, rHillAU });
}

export function updateHillSpheres() {
  if (!FX.hill) return;
  for (const b of BODIES) {
    const p = state.bodyPositions.get(b.name);
    const h = hillMeshes.get(b.name);
    if (p && h) h.mesh.position.set(p.x, p.y, p.z);
  }
}
