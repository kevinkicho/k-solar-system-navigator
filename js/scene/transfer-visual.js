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

// Ghost mesh at the arrival point — a faded sphere sized to the destination
// planet, parked at "where the destination WILL BE at arrival time." Makes
// the trajectory's target visually obvious before launch and during flight,
// then hides once the mission has arrived (the rendezvous already happened).
export const arrivalGhost = new THREE.Mesh(
  new THREE.SphereGeometry(0.04, 24, 24),    // resized per route in setArrivalGhost
  new THREE.MeshBasicMaterial({
    color: 0xff9800, transparent: true, opacity: 0.22,
    depthWrite: false, side: THREE.DoubleSide,
  }),
);
arrivalGhost.visible = false;
arrivalGhost.renderOrder = 5;   // draw after planets so it shows through
scene.add(arrivalGhost);

export function setArrivalGhost({ x, y, z, radius, color }) {
  arrivalGhost.position.set(x, y, z);
  arrivalGhost.scale.setScalar(Math.max(radius, 0.03) / 0.04);
  arrivalGhost.material.color.setHex(color);
  arrivalGhost.visible = true;
}

export function hideArrivalGhost() { arrivalGhost.visible = false; }
