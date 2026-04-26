import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { AU } from '../constants.js';
import { SPACECRAFT } from '../data/spacecraft.js';
import { scene } from './setup.js';

export const spacecraftMeshes = new Map();
export const spacecraftLabels = new Map();
export const spacecraftTrails = new Map();

for (const sc of SPACECRAFT) {
  // Tetrahedron marker reads as "spacecraft" at a glance and is distinct from
  // the round planet/moon spheres.
  const mesh = new THREE.Mesh(
    new THREE.TetrahedronGeometry(0.18, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(sc.color) }),
  );
  scene.add(mesh);
  spacecraftMeshes.set(sc.name, mesh);

  const div = document.createElement('div');
  div.className = 'planet-label';
  div.textContent = sc.name.toUpperCase();
  div.style.color = sc.color;
  div.style.fontSize = '9px';
  div.style.letterSpacing = '1px';
  div.style.opacity = '0.85';
  const label = new CSS2DObject(div);
  label.position.set(0.25, 0.15, 0);
  mesh.add(label);
  spacecraftLabels.set(sc.name, div);

  // Trail line points back along the velocity vector; length scales with speed.
  const speedAU_yr = Math.hypot(...sc.vel_m_s) * (86400 * 365.25) / AU;
  const trailLen = Math.min(4, speedAU_yr * 0.8);
  const m = Math.hypot(...sc.vel_m_s);
  const vUnit = [sc.vel_m_s[0]/m, sc.vel_m_s[1]/m, sc.vel_m_s[2]/m];
  const trailGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-vUnit[0] * trailLen, -vUnit[1] * trailLen, -vUnit[2] * trailLen),
  ]);
  const trailMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(sc.color), transparent: true, opacity: 0.35,
  });
  const trail = new THREE.Line(trailGeo, trailMat);
  mesh.add(trail);
  spacecraftTrails.set(sc.name, trail);
}
