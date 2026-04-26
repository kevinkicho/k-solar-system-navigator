import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { DAY } from '../constants.js';
import { MOONS } from '../data/moons.js';
import { generateMoonOrbitPoints } from '../physics/kepler.js';
import { scene, texLoader } from './setup.js';
import { planetTextureTargets, TEX_BASE } from './planets.js';

export const moonMeshes = new Map();
export const moonLabels = new Map();
export const moonOrbitLines = new Map();

for (const moon of MOONS) {
  const moonMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(moon.color), emissive: new THREE.Color(moon.emissive),
    emissiveIntensity: 0.3, roughness: 0.8, metalness: 0.05,
  });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(moon.displayRadius, 16, 16),
    moonMat,
  );
  scene.add(mesh);
  moonMeshes.set(moon.name, mesh);

  // Only Earth's Moon gets a surface texture.
  if (moon.name === 'Moon') {
    texLoader.load(TEX_BASE + 'moonmap1k.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      moonMat.map = tex;
      moonMat.color.setHex(0xffffff);
      moonMat.emissiveIntensity = 0.06;
      moonMat.needsUpdate = true;
      planetTextureTargets.push({ map: tex, period: 27.322 * DAY });
    });
  }

  const div = document.createElement('div');
  div.className = 'planet-label';
  div.textContent = moon.name.toUpperCase();
  div.style.color = moon.color;
  div.style.fontSize = '8px';
  div.style.letterSpacing = '1px';
  div.style.opacity = '0.8';
  const label = new CSS2DObject(div);
  label.position.set(moon.displayRadius + 0.005, moon.displayRadius * 0.4, 0);
  mesh.add(label);
  moonLabels.set(moon.name, div);

  const orbitPts = generateMoonOrbitPoints(moon).map(p => new THREE.Vector3(p.x, p.y, p.z));
  const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
  const orbitMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(moon.color), transparent: true, opacity: 0.1,
  });
  const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
  scene.add(orbitLine);
  moonOrbitLines.set(moon.name, { line: orbitLine, material: orbitMat });
}
