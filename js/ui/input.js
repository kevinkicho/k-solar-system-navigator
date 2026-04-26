import * as THREE from 'three';
import { AU, SUN_WOBBLE_EXAGGERATION } from '../constants.js';
import { SUN_DATA } from '../data/bodies.js';
import { state } from '../state.js';
import { getSunBarycentricOffset } from '../physics/kepler.js';
import { camera3D, controls, renderer } from '../scene/setup.js';
import { moonMeshes } from '../scene/moons.js';
import { planetMeshes } from '../scene/planets.js';
import { formatDist, formatMass, formatTime } from './format.js';
import { getIntersectedBody, raycaster } from './raycaster.js';
import { setRouteDestination, setRouteOrigin } from './route-planner.js';
import { selectBody } from './selection.js';
import { timeState } from './time-system.js';

export function wireInput() {
  renderer.domElement.addEventListener('click', (e) => {
    const body = getIntersectedBody(e);
    selectBody(body && body !== SUN_DATA ? body : null);
  });

  renderer.domElement.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const body = getIntersectedBody(e);
    if (body && body !== SUN_DATA) {
      if (!state.routeOrigin) setRouteOrigin(body);
      else if (!state.routeDestination && body !== state.routeOrigin) setRouteDestination(body);
      else { setRouteOrigin(body); setRouteDestination(null); }
    }
  });

  renderer.domElement.addEventListener('mousemove', (e) => {
    state.hoveredBody = getIntersectedBody(e);
    const tooltip = document.getElementById('tooltip');
    if (state.hoveredBody) {
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 16) + 'px';
      tooltip.style.top = (e.clientY - 10) + 'px';
      if (state.hoveredBody === SUN_DATA) {
        const phys = getSunBarycentricOffset(timeState.simTime, false);
        const offAU = Math.sqrt(phys.x*phys.x + phys.y*phys.y + phys.z*phys.z);
        const offSolarRadii = offAU * AU / SUN_DATA.radius;
        tooltip.innerHTML = `<b style="color:#fff4d6">Sun</b><br>Mass: ${formatMass(SUN_DATA.mass)}<br>Wobble: ${offSolarRadii.toFixed(2)} R☉ (×${SUN_WOBBLE_EXAGGERATION} shown)`;
      } else if (state.hoveredBody.parent) {
        tooltip.innerHTML = `<b style="color:${state.hoveredBody.color}">${state.hoveredBody.name}</b><br><span style="opacity:0.6">${state.hoveredBody.parent} satellite</span><br>Period: ${formatTime(state.hoveredBody.period)}`;
      } else {
        const pos = state.bodyPositions.get(state.hoveredBody.name);
        const dist = pos ? pos.r : 0;
        tooltip.innerHTML = `<b style="color:${state.hoveredBody.color}">${state.hoveredBody.name}</b><br>Dist: ${formatDist(dist*AU)}<br>Period: ${formatTime(state.hoveredBody.period)}`;
      }
      renderer.domElement.style.cursor = 'pointer';
    } else {
      tooltip.style.display = 'none';
      renderer.domElement.style.cursor = '';
    }
    raycaster.setFromCamera(new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1,
    ), camera3D);
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0), 0), pt)) {
      document.getElementById('cursor-coords').textContent = Math.sqrt(pt.x*pt.x + pt.z*pt.z).toFixed(3) + ' AU';
    }
  });

  renderer.domElement.addEventListener('dblclick', (e) => {
    const body = getIntersectedBody(e);
    if (body && body !== SUN_DATA) {
      const mesh = planetMeshes.get(body.name) || moonMeshes.get(body.name);
      if (mesh) controls.target.copy(mesh.position);
    } else controls.target.set(0, 0, 0);
  });
}
