/**
 * Map mode — Compare product mode (schematic + dual path).
 * Prefer setProductMode('compare'|'present') from domain.
 */
import * as THREE from 'three';
import { state, effectivePathGeometry } from '../state.js';
import { isSchematic } from '../display-scale.js';
import { BODIES } from '../data/bodies.js';
import { generateOrbitPoints } from '../physics/kepler.js';
import { orbitLines } from '../scene/planets.js';
import { updateViewBadge } from './share.js';

/**
 * Apply or clear map mode → product mode compare / present.
 * @param {boolean} on
 * @param {{ silent?: boolean }} [opts]
 */
export function setMapMode(on, opts = {}) {
  import('../domain/display-modes.js').then(({ setProductMode }) => {
    setProductMode(on ? 'compare' : 'present', { silent: opts.silent, skipRecompute: true });
  });
}

export function toggleMapMode() {
  setMapMode(!state.mapMode);
}

/** Rebuild planet orbit polylines after inclination scale change. */
export function rebuildOrbitLines() {
  for (const [name, data] of orbitLines) {
    const body = BODIES.find((b) => b.name === name);
    if (!body || !data.line) continue;
    const pts = generateOrbitPoints(body, 256).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    data.line.geometry.dispose();
    data.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }
}

export function syncMapModeUi() {
  const title = state.mapMode
    ? 'Map mode ON — schematic + dual path. Click for cinematic.'
    : 'Map mode — schematic frames + dual path overlay (honest mapping)';
  for (const id of ['btn-map-mode', 'btn-map-mode-view']) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.classList.toggle('active', !!state.mapMode);
    btn.setAttribute('aria-pressed', state.mapMode ? 'true' : 'false');
    btn.title = title;
  }
  const geom = document.getElementById('path-geometry-select');
  if (geom) geom.value = effectivePathGeometry();
  const disp = document.getElementById('display-mode-select');
  if (disp) disp.value = state.display?.mode || 'cinematic';
}

export function mapModeBadgeText() {
  if (state.mapMode || state.productMode === 'compare') {
    return 'VIEW: COMPARE · dual path · physical frames';
  }
  if (isSchematic()) {
    return 'VIEW: ANALYZE — physical path; numbers always physical';
  }
  return 'VIEW: PRESENT (cinematic display orbit)';
}

export function wireMapMode() {
  for (const id of ['btn-map-mode', 'btn-map-mode-view']) {
    const btn = document.getElementById(id);
    if (btn) btn.onclick = () => toggleMapMode();
  }
  syncMapModeUi();
}