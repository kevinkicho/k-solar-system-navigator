import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { scene } from './setup.js';

// Single transfer-orbit dashed line (recreated each route compute).
export let transferLine = null;
export function setTransferLine(line) {
  if (transferLine) scene.remove(transferLine);
  transferLine = line;
  if (line) scene.add(line);
}

/** Optional second line for physical-geometry overlay (pathGeometry === 'both'). */
export let physicalTransferLine = null;
export function setPhysicalTransferLine(line) {
  if (physicalTransferLine) scene.remove(physicalTransferLine);
  physicalTransferLine = line;
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
  clearFlybyGhosts();
  clearDateMarkers();
  setPhysicalTransferLine(null);
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
// CSS2D labels clarify burn-time positions vs live planets.
function makeGhost(defaultColor) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 24, 24),
    new THREE.MeshBasicMaterial({
      color: defaultColor, transparent: true, opacity: 0.22,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  m.visible = false;
  m.renderOrder = 5;
  const div = document.createElement('div');
  div.className = 'planet-label ghost-label';
  div.textContent = '';
  const label = new CSS2DObject(div);
  label.position.set(0, 0.08, 0);
  label.visible = false;
  m.add(label);
  m.userData.ghostLabel = label;
  m.userData.ghostLabelDiv = div;
  return m;
}

export const arrivalGhost   = makeGhost(0xff9800);
export const departureGhost = makeGhost(0x00e676);   // green, mirrors depart marker
scene.add(arrivalGhost);
scene.add(departureGhost);

function placeGhost(mesh, { x, y, z, radius, color, label }) {
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(Math.max(radius, 0.03) / 0.04);
  mesh.material.color.setHex(color);
  mesh.visible = true;
  const lbl = mesh.userData.ghostLabel;
  const div = mesh.userData.ghostLabelDiv;
  if (lbl && div) {
    if (label) {
      div.textContent = label;
      lbl.visible = true;
      // Counteract parent scale so text stays readable
      const s = mesh.scale.x || 1;
      lbl.scale.setScalar(1 / s);
    } else {
      div.textContent = '';
      lbl.visible = false;
    }
  }
}

export function setArrivalGhost(opts)   { placeGhost(arrivalGhost, opts); }
export function setDepartureGhost(opts) { placeGhost(departureGhost, opts); }
export function hideArrivalGhost() {
  arrivalGhost.visible = false;
  if (arrivalGhost.userData.ghostLabel) arrivalGhost.userData.ghostLabel.visible = false;
}
export function hideDepartureGhost() {
  departureGhost.visible = false;
  if (departureGhost.userData.ghostLabel) departureGhost.userData.ghostLabel.visible = false;
}

// Per-flyby ghosts — for multi-leg routes, mirror the arrivalGhost pattern
// at each intermediate flyby planet's planned-flyby-time position.  Created
// on demand and reset by clearMultiLegVisuals.
export const flybyGhosts = [];
export function addFlybyGhost(opts) {
  const m = makeGhost(opts.color);
  placeGhost(m, opts);
  scene.add(m);
  flybyGhosts.push(m);
}
export function clearFlybyGhosts() {
  for (const g of flybyGhosts) scene.remove(g);
  flybyGhosts.length = 0;
}

// Date markers along a transfer trajectory — small spheres at fixed-time
// intervals.  Visually they cluster near perihelion (where Kepler's 2nd law
// makes the spacecraft sweep arc fast) and spread out toward apoapsis (slow).
// This is the visual cue that distinguishes a real Keplerian transfer from
// a uniform spline interpolation, which is what most users expect to see.
export const dateMarkers = [];
export function addDateMarker(x, y, z, color = 0xffd54f, isMajor = false) {
  const r = isMajor ? 0.012 : 0.007;
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 12, 12),
    new THREE.MeshBasicMaterial({
      color, transparent: true,
      opacity: isMajor ? 0.95 : 0.55,
      depthWrite: false,
    }),
  );
  m.position.set(x, y, z);
  m.renderOrder = 6;
  scene.add(m);
  dateMarkers.push(m);
}
export function clearDateMarkers() {
  for (const m of dateMarkers) scene.remove(m);
  dateMarkers.length = 0;
}
