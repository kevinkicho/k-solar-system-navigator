import * as THREE from 'three';
import { BODIES, SUN_DATA } from '../data/bodies.js';
import { MOONS } from '../data/moons.js';
import { camera3D, renderer } from '../scene/setup.js';
import { moonMeshes } from '../scene/moons.js';
import { planetMeshes } from '../scene/planets.js';
import { sunMesh } from '../scene/sun.js';

export const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

export function getIntersectedBody(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera3D);
  let closest = null, closestDist = Infinity;
  for (const body of BODIES) {
    const mesh = planetMeshes.get(body.name);
    if (!mesh) continue;
    const sphere = new THREE.Sphere(mesh.position.clone(), Math.max(body.displayRadius * 1.8, 0.03));
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectSphere(sphere, target)) {
      const d = target.distanceTo(camera3D.position);
      if (d < closestDist) { closestDist = d; closest = body; }
    }
  }
  for (const moon of MOONS) {
    const mesh = moonMeshes.get(moon.name);
    if (!mesh) continue;
    const sphere = new THREE.Sphere(mesh.position.clone(), Math.max(moon.displayRadius * 2.5, 0.015));
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectSphere(sphere, target)) {
      const d = target.distanceTo(camera3D.position);
      if (d < closestDist) { closestDist = d; closest = moon; }
    }
  }
  // Sun sphere tracks the wobbled mesh position.
  const sphere = new THREE.Sphere(sunMesh.position, SUN_DATA.displayRadius * 1.5);
  const target = new THREE.Vector3();
  if (raycaster.ray.intersectSphere(sphere, target)) {
    const d = target.distanceTo(camera3D.position);
    if (d < closestDist) { closest = SUN_DATA; }
  }
  return closest;
}

// Re-export so other modules don't have to import THREE just to make a Vector2.
export { mouse };
