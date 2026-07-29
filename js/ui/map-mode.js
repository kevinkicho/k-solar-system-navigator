/**
 * Map mode — schematic frames + dual path overlay for honest trajectory mapping.
 * Cinematic stays the default “wow” view; map mode is one click for teaching/map truth.
 */
import * as THREE from 'three';
import { state } from '../state.js';
import { setDisplayMode, isSchematic } from '../display-scale.js';
import { BODIES } from '../data/bodies.js';
import { generateOrbitPoints } from '../physics/kepler.js';
import { orbitLines } from '../scene/planets.js';
import { updateViewBadge } from './share.js';

/**
 * Apply or clear map mode.
 * @param {boolean} on
 * @param {{ silent?: boolean }} [opts]
 */
export function setMapMode(on, opts = {}) {
  const want = !!on;
  state.mapMode = want;

  if (want) {
    setDisplayMode('schematic');
    // Dual overlay: bright cinematic-capable line + faint physical (real-I) line
    state.pathGeometry = 'both';
  } else {
    // Return to cinematic wow; keep pathGeometry visual unless user set otherwise
    if (state.display?.mode === 'schematic') setDisplayMode('cinematic');
    if (state.pathGeometry === 'both') state.pathGeometry = 'visual';
  }

  rebuildOrbitLines();
  syncMapModeUi();
  updateViewBadge();

  if (state.showTransferOrbit && state.transferData) {
    import('../physics/routing.js').then(({ refreshVisualTransferGeometry }) => {
      refreshVisualTransferGeometry(state.transferData);
      return import('./route-orbit-visual.js');
    }).then((m) => m?.updateTransferOrbitVisual?.());
  }

  if (!opts.silent) {
    import('./format.js').then(({ notify }) => {
      notify(want
        ? 'MAP MODE — schematic frames · dual path (physical + visual)'
        : 'CINEMATIC VIEW — exaggerated inclinations / sun wobble');
    });
  }
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
  if (geom) geom.value = state.pathGeometry || 'visual';
  const disp = document.getElementById('display-mode-select');
  if (disp) disp.value = state.display?.mode || 'cinematic';
}

export function mapModeBadgeText() {
  if (state.mapMode) return 'VIEW: MAP · dual path · physical frames';
  if (isSchematic()) {
    return 'VIEW: SCHEMATIC — incl. & sun wobble physical; moons still layout-scaled; numbers always physical';
  }
  return 'VIEW: CINEMATIC (exaggerated incl. / wobble)';
}

export function wireMapMode() {
  for (const id of ['btn-map-mode', 'btn-map-mode-view']) {
    const btn = document.getElementById(id);
    if (btn) btn.onclick = () => toggleMapMode();
  }
  syncMapModeUi();
}