/**
 * Transfer path ribbon (TubeGeometry) + percent time ticks for rich Three.js viz.
 * Samples come from the shared transfer-path pipeline (not independent geometry).
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { scene } from './setup.js';

/** @type {THREE.Mesh|null} */
let ribbonMesh = null;
/** @type {THREE.Group|null} */
let tickGroup = null;

export function clearTransferRibbon() {
  if (ribbonMesh) {
    scene.remove(ribbonMesh);
    ribbonMesh.geometry?.dispose?.();
    ribbonMesh.material?.dispose?.();
    ribbonMesh = null;
  }
  if (tickGroup) {
    scene.remove(tickGroup);
    tickGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) obj.material.dispose?.();
    });
    tickGroup = null;
  }
}

/**
 * @param {THREE.Vector3[]} points scene-frame AU
 * @param {{ color?: number, radius?: number, labels?: Array<{frac:number,text:string}>, highE?: boolean }} [opts]
 */
export function setTransferRibbon(points, opts = {}) {
  clearTransferRibbon();
  if (!points || points.length < 2) return;

  // Distinct transfer color (not Neptune/Uranus cyan planet orbits)
  const color = opts.color ?? 0x00e5ff;
  const radius = opts.radius ?? estimateRadius(points);
  const highE = !!opts.highE || pathLooksHighE(points);

  try {
    let curve;
    if (highE || points.length > 200) {
      // High-e / long paths: chordal polyline curve — NO CatmullRom overshoot (fake multi-bows)
      curve = buildPolylineCurve(points);
    } else {
      // Smooth inner-system arcs only
      curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    }
    const tubular = Math.min(320, Math.max(64, points.length));
    const geo = new THREE.TubeGeometry(curve, tubular, radius, 8, false);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    ribbonMesh = new THREE.Mesh(geo, mat);
    ribbonMesh.renderOrder = 3;
    ribbonMesh.name = 'transfer-ribbon';
    scene.add(ribbonMesh);
  } catch (err) {
    console.warn('[HELIOS] transfer ribbon failed', err);
    try {
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.9, linewidth: true,
      });
      ribbonMesh = new THREE.Line(geo, mat);
      ribbonMesh.name = 'transfer-ribbon-fallback';
      scene.add(ribbonMesh);
    } catch { /* */ }
    return;
  }

  const labels = opts.labels || defaultLabels();
  tickGroup = new THREE.Group();
  tickGroup.name = 'transfer-ribbon-ticks';
  for (const L of labels) {
    const frac = Math.min(1, Math.max(0, L.frac));
    const idx = Math.min(points.length - 1, Math.round(frac * (points.length - 1)));
    const p = points[idx];
    if (!p) continue;

    const r = frac === 0 || frac === 1 ? 0.014 : 0.01;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 10),
      new THREE.MeshBasicMaterial({
        color: frac === 0 ? 0x00e676 : (frac === 1 ? 0xff9800 : 0xffd54f),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    sphere.position.copy(p);
    sphere.renderOrder = 7;
    tickGroup.add(sphere);

    if (L.text) {
      const div = document.createElement('div');
      div.className = 'path-tick-label';
      div.textContent = L.text;
      const lab = new CSS2DObject(div);
      lab.position.set(0, r * 2.2, 0);
      sphere.add(lab);
    }
  }
  scene.add(tickGroup);
}

function defaultLabels() {
  return [
    { frac: 0, text: 'DEP' },
    { frac: 0.5, text: 'MID' },
    { frac: 1, text: 'ARR' },
  ];
}

function estimateRadius(points) {
  let pathLen = 0;
  for (let i = 1; i < points.length; i++) pathLen += points[i].distanceTo(points[i - 1]);
  // Scale tube with path length so inner-system ribbons aren’t huge
  return Math.min(0.035, Math.max(0.005, pathLen / 140));
}

/** True when samples span a large radial range (high-e outer transfers). */
function pathLooksHighE(points) {
  let rMin = Infinity;
  let rMax = 0;
  for (const p of points) {
    const r = Math.hypot(p.x, p.y, p.z);
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
  }
  if (!(rMax > 0) || !(rMin < Infinity)) return false;
  // e_proxy ≈ (rMax-rMin)/(rMax+rMin); Mercury→Neptune class is ~0.97
  return (rMax - rMin) / (rMax + rMin) > 0.55 || rMax > 12;
}

/**
 * Exact sample polyline as a THREE curve (no interpolation overshoot).
 * @param {THREE.Vector3[]} points
 */
function buildPolylineCurve(points) {
  // THREE.CurvePath of LineCurves through every sample — preserves Lambert geometry
  const path = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) {
    path.add(new THREE.LineCurve3(points[i - 1], points[i]));
  }
  // TubeGeometry needs getPoint(t) on [0,1] — CurvePath supports that
  return path;
}
