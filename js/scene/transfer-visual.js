import * as THREE from 'three';
import { scene } from './setup.js';

// Single transfer-orbit dashed line (recreated each route compute).
export let transferLine = null;
export function setTransferLine(line) {
  if (transferLine) scene.remove(transferLine);
  transferLine = line;
  if (line) scene.add(line);
}

// Multi-leg route: one dashed line per leg, plus ring markers per intermediate flyby.
export const extraLegLines = [];
export const flybyMarkers = [];

export function addLegLine(line) { extraLegLines.push(line); scene.add(line); }
export function addFlybyMarker(mesh) { flybyMarkers.push(mesh); scene.add(mesh); }

export function clearMultiLegVisuals() {
  for (const l of extraLegLines) scene.remove(l);
  extraLegLines.length = 0;
  for (const m of flybyMarkers) scene.remove(m);
  flybyMarkers.length = 0;
}

// Persistent depart/arrive ring markers (visibility toggled by route logic).
export const transferMarkers = {
  depart: new THREE.Mesh(
    new THREE.RingGeometry(0.015, 0.025, 32),
    new THREE.MeshBasicMaterial({ color: 0x00e676, side: THREE.DoubleSide }),
  ),
  arrive: new THREE.Mesh(
    new THREE.RingGeometry(0.015, 0.025, 32),
    new THREE.MeshBasicMaterial({ color: 0xff9800, side: THREE.DoubleSide }),
  ),
};
transferMarkers.depart.visible = false;
transferMarkers.arrive.visible = false;
scene.add(transferMarkers.depart);
scene.add(transferMarkers.arrive);
