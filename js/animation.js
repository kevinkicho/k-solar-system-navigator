import { state } from './state.js';
import { BODIES } from './data/bodies.js';
import { MOONS } from './data/moons.js';
import { listDwarfs, listNeos, listWaypoints } from './data/catalog.js';
import { SPACECRAFT } from './data/spacecraft.js';
import { getBodyPosition3D, getMoonPosition, getSunBarycentricOffset } from './physics/kepler.js';
import { getSpacecraftPosition } from './physics/helio.js';
import { camera3D, composer, controls, labelRenderer, renderer, scene } from './scene/setup.js';
import { sunGlowSprite, sunMesh } from './scene/sun.js';
import { moonMeshes, moonOrbitLines } from './scene/moons.js';
import { orbitLines, planetMeshes, planetTextureTargets } from './scene/planets.js';
import { spacecraftMeshes } from './scene/spacecraft.js';
import { selectionRing } from './scene/selection-ring.js';
import { flybyMarkers, transferMarkers } from './scene/transfer-visual.js';
import { FX, prefersReducedMotion, updateHillSpheres, updatePotentialField } from './scene/gravity-field.js';
import { updateBodyList } from './ui/body-list.js';
import { updateInfoPanel } from './ui/info-panel.js';
import { timeState } from './ui/time-system.js';
import { updateFlybyPulses, updateMission } from './mission.js';

let frameCount = 0, lastFpsTime = 0, fps = 60;
let lastFrameTime = performance.now();

export function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  frameCount++;
  if (now - lastFpsTime > 500) {
    fps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
    frameCount = 0; lastFpsTime = now;
    document.getElementById('fps-display').textContent = fps + ' FPS';
  }

  if (timeState.timeScale !== 0) {
    let newSim = timeState.simTime + timeState.timeScale * dt;
    // If we'd cross the planned arrival of an active mission this frame,
    // clamp simTime to *exactly* arrivalSimTime so the rendezvous geometry
    // matches what Lambert solved for. Without this, fast-forwarding can
    // carry simTime past arrival before updateMission detects it, leaving
    // the ship snapped to "destination wherever it is now" instead of
    // "destination at the planned arrival moment."
    const m = state.mission;
    if (m.active && !m.arrived && timeState.timeScale > 0
        && timeState.simTime < m.arrivalSimTime
        && newSim >= m.arrivalSimTime) {
      newSim = m.arrivalSimTime;
    }
    timeState.simTime = newSim;
    timeState.updateDisplay();
  }

  // Sun's barycentric wobble — compute once per frame, then apply to everything
  // that should follow the Sun (planets, orbit lines, spacecraft).
  const sunOff = getSunBarycentricOffset(timeState.simTime);
  sunMesh.position.set(sunOff.x, sunOff.y, sunOff.z);
  sunMesh.rotation.y += dt * 0.05;
  // Soft-disable corona pulse when the user prefers reduced motion (PR 18).
  const reduceMotion = prefersReducedMotion();
  const glowPulse = reduceMotion ? 0.58 : 0.58 + 0.06 * Math.sin(now * 0.0015);
  sunGlowSprite.scale.set(glowPulse, glowPulse, 1);

  // Planet axial spin via UV offset on equirectangular textures.
  for (const t of planetTextureTargets) {
    t.map.offset.x = (timeState.simTime / t.period) % 1;
  }

  const extraBodies = [...listDwarfs(), ...listNeos(), ...listWaypoints()];
  for (const body of [...BODIES, ...extraBodies]) {
    const helio = getBodyPosition3D(body, timeState.simTime);
    const scenePos = {
      x: helio.x + sunOff.x, y: helio.y + sunOff.y, z: helio.z + sunOff.z,
      r: helio.r, v: helio.v, E: helio.E,
    };
    state.bodyPositions.set(body.name, scenePos);
    const mesh = planetMeshes.get(body.name);
    if (mesh) mesh.position.set(scenePos.x, scenePos.y, scenePos.z);
  }

  for (const { line } of orbitLines.values()) {
    line.position.set(sunOff.x, sunOff.y, sunOff.z);
  }

  for (const sc of SPACECRAFT) {
    const mesh = spacecraftMeshes.get(sc.name);
    if (!mesh) continue;
    const pos = getSpacecraftPosition(sc, timeState.simTime);
    if (!pos) { mesh.visible = false; continue; }
    mesh.visible = true;
    mesh.position.set(pos.x + sunOff.x, pos.y + sunOff.y, pos.z + sunOff.z);
    mesh.rotation.y += dt * 1.2;
    mesh.rotation.x += dt * 0.7;
  }

  for (const moon of MOONS) {
    const parentPos = state.bodyPositions.get(moon.parent);
    if (!parentPos) continue;
    const localPos = getMoonPosition(moon, timeState.simTime);
    const wx = parentPos.x + localPos.x;
    const wy = parentPos.y + localPos.y;
    const wz = parentPos.z + localPos.z;
    state.moonPositions.set(moon.name, { x: wx, y: wy, z: wz });
    const mesh = moonMeshes.get(moon.name);
    if (mesh) mesh.position.set(wx, wy, wz);
    const orbitData = moonOrbitLines.get(moon.name);
    if (orbitData) orbitData.line.position.set(parentPos.x, parentPos.y, parentPos.z);
  }

  // Hill spheres are cheap (per planet); potential well is 14400 × N_bodies ops,
  // so refresh every 6th frame — planets move slowly enough to hide the stepping.
  // Heavy potential rebuilds are also gated by FX.allowHeavyFx (reduced-motion).
  if (FX.hill) updateHillSpheres();
  if (FX.potential && FX.allowHeavyFx && (frameCount % 6 === 0)) updatePotentialField();

  if (state.selectedBody && selectionRing.visible) {
    const mesh = planetMeshes.get(state.selectedBody.name) || moonMeshes.get(state.selectedBody.name);
    if (mesh) {
      selectionRing.position.copy(mesh.position);
      selectionRing.lookAt(camera3D.position);
      const pulse = reduceMotion ? 1 : 1 + 0.08 * Math.sin(now * 0.004);
      const s = state.selectedBody.displayRadius * 1.8 * pulse;
      selectionRing.scale.set(s, s, s);
    }
  }

  if (transferMarkers.depart.visible) {
    transferMarkers.depart.lookAt(camera3D.position);
    transferMarkers.arrive.lookAt(camera3D.position);
  }
  for (const m of flybyMarkers) m.lookAt(camera3D.position);

  updateMission();
  updateFlybyPulses(now);

  if (state.followMode && state.selectedBody) {
    const mesh = planetMeshes.get(state.selectedBody.name) || moonMeshes.get(state.selectedBody.name);
    if (mesh) controls.target.copy(mesh.position);
  }

  if (frameCount % 15 === 0) {
    updateBodyList();
    if (state.selectedBody) updateInfoPanel();
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera3D);
}
