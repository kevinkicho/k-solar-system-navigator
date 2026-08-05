// Simple meshes for dwarfs, NEOs, and waypoints (solid color, no textures).
// Default: scene-hidden (sceneVisible:false) — still trip-plannable via body picker.
// When a plan uses a small body as o/d, call ensureSceneBody(body) to show it.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { listDwarfs, listNeos, listWaypoints, isSceneVisible } from '../data/catalog.js';
import { generateOrbitPoints } from '../physics/kepler.js';
import { scene } from './setup.js';
import { planetMeshes, orbitLines } from './planets.js';

const _built = new Set();

function addSimpleBody(body, { orbit = true, force = false } = {}) {
  if (!body || planetMeshes.has(body.name)) {
    if (body && planetMeshes.has(body.name)) {
      const g = planetMeshes.get(body.name);
      if (g) g.visible = true;
      const ol = orbitLines.get(body.name);
      if (ol?.line) ol.line.visible = true;
    }
    return;
  }
  if (!force && !isSceneVisible(body)) return;

  const group = new THREE.Group();
  group.userData.planOnlyBody = body.sceneVisible === false;
  scene.add(group);
  planetMeshes.set(body.name, group);
  _built.add(body.name);

  const r = body.displayRadius || 0.008;
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(r, 24, 24),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(body.color || '#aaa'),
      emissive: new THREE.Color(body.emissive || '#222'),
      emissiveIntensity: 0.35,
      roughness: 0.9,
      metalness: 0.05,
    }),
  );
  group.add(sphere);

  const div = document.createElement('div');
  div.className = 'planet-label';
  div.textContent = body.name.toUpperCase();
  div.style.color = body.color || '#aaa';
  div.style.fontSize = '9px';
  const label = new CSS2DObject(div);
  label.position.set(r + 0.01, r * 0.5, 0);
  group.add(label);

  if (orbit && body.a && body.period) {
    try {
      const pts = generateOrbitPoints(body, 128).map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(body.color || '#888'),
          transparent: true,
          opacity: 0.15,
        }),
      );
      scene.add(line);
      orbitLines.set(body.name, { line, material: line.material });
    } catch { /* waypoints have no Kepler a */ }
  }
}

/**
 * Lazily create mesh when user plans a trip to a scene-hidden body.
 * @param {object|null} body
 */
export function ensureSceneBody(body) {
  if (!body) return;
  addSimpleBody(body, { orbit: !!body.a, force: true });
}

/** Prefetch only scene-visible extras (none by product default). */
export function buildExtraBodies() {
  for (const b of listDwarfs()) addSimpleBody(b, { orbit: true });
  for (const b of listNeos()) addSimpleBody(b, { orbit: true });
  for (const b of listWaypoints()) addSimpleBody(b, { orbit: false });
}

// Boot: no-op for sceneVisible:false catalog
buildExtraBodies();
