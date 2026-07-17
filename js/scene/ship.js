import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { MAX_TRAIL_POINTS } from '../constants.js';
import { scene } from './setup.js';

export const shipGroup = new THREE.Group();
shipGroup.visible = false;
scene.add(shipGroup);

const shipMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.012, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0x00ff88 }),
);
shipGroup.add(shipMesh);

{
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const cx = c.getContext('2d');
  const grad = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,255,136,0.8)');
  grad.addColorStop(0.3, 'rgba(0,230,118,0.3)');
  grad.addColorStop(1, 'rgba(0,200,100,0)');
  cx.fillStyle = grad; cx.fillRect(0, 0, 64, 64);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, transparent: true,
  }));
  sprite.scale.set(0.12, 0.12, 1);
  shipGroup.add(sprite);
}

// Velocity arrow: points along Kepler velocity (local +Z of shipGroup after lookAt)
const velArrow = new THREE.ArrowHelper(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, 0),
  0.08,
  0x69f0ae,
  0.02,
  0.012,
);
velArrow.visible = false;
shipGroup.add(velArrow);

export const shipLabelDiv = document.createElement('div');
shipLabelDiv.className = 'ship-label';
shipLabelDiv.textContent = '';
// Hidden until a mission is in flight — CSS2D often still paints labels when
// the parent group is .visible=false, which left "SHIP 0%" stuck on the Sun.
shipLabelDiv.style.display = 'none';
const shipLabel = new CSS2DObject(shipLabelDiv);
shipLabel.position.set(0.02, 0.02, 0);
shipLabel.visible = false;
shipGroup.add(shipLabel);

/** Show/hide the CSS2D progress label (mission flight only). */
export function setShipLabelVisible(on) {
  shipLabel.visible = !!on;
  shipLabelDiv.style.display = on ? '' : 'none';
  if (!on) {
    shipLabelDiv.textContent = '';
    velArrow.visible = false;
  }
}

/**
 * Point ship velocity arrow along helio/parent velocity (m/s).
 * Arrow length scales gently with |v| so fast perihelion legs read as longer.
 */
export function setShipVelocityDirection(vx, vy, vz, v_km_s = null) {
  if (vx == null || vy == null || vz == null) {
    velArrow.visible = false;
    return;
  }
  const dir = new THREE.Vector3(vx, vy, vz);
  if (dir.lengthSq() < 1e-18) {
    velArrow.visible = false;
    return;
  }
  dir.normalize();
  velArrow.setDirection(dir);
  const vk = v_km_s != null ? v_km_s : Math.hypot(vx, vy, vz) / 1000;
  // ~0.04 AU at 10 km/s → ~0.2 AU at 60 km/s (screen units)
  const len = Math.min(0.35, Math.max(0.04, 0.004 * Math.max(vk, 1)));
  velArrow.setLength(len, len * 0.28, len * 0.16);
  velArrow.visible = true;
}

const trailPositions = new Float32Array(MAX_TRAIL_POINTS * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
trailGeo.setDrawRange(0, 0);
export const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
  color: 0x00e676, transparent: true, opacity: 0.4,
}));
trailLine.visible = false;
scene.add(trailLine);
let trailCount = 0;

export function resetTrail() {
  trailCount = 0;
  trailGeo.setDrawRange(0, 0);
  trailLine.visible = false;
}

export function addTrailPoint(x, y, z) {
  if (trailCount < MAX_TRAIL_POINTS) {
    trailPositions[trailCount * 3] = x;
    trailPositions[trailCount * 3 + 1] = y;
    trailPositions[trailCount * 3 + 2] = z;
    trailCount++;
    trailGeo.setDrawRange(0, trailCount);
    trailGeo.attributes.position.needsUpdate = true;
    trailLine.visible = true;
  }
}
