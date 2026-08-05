/**
 * Map mode — Compare product mode (schematic + dual path).
 * Prefer setProductMode('compare'|'present') from domain.
 *
 * State flags update **synchronously** so rapid toggles (and CI) see a
 * consistent pathGeometry; full display work is chained asynchronously.
 */
import * as THREE from 'three';
import { state, PRODUCT_PATH_GEOMETRY, effectivePathGeometry } from '../state.js';
import { isSchematic } from '../display-scale.js';
import { BODIES } from '../data/bodies.js';
import { generateOrbitPoints } from '../physics/kepler.js';
import { orbitLines } from '../scene/planets.js';
import { updateViewBadge } from './share.js';

/** Serialize mode switches so MAP on/off cannot race to leave pathGeometry=both. */
let _mapModeChain = Promise.resolve();

/**
 * Apply or clear map mode → product mode compare / present.
 * @param {boolean} on
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<object|void>}
 */
export function setMapMode(on, opts = {}) {
  const want = !!on;
  // Synchronous product flags — CI and double-clicks must not observe stale "both"
  if (want) {
    state.mapMode = true;
    state.productMode = 'compare';
    state.pathGeometry = 'both';
    state.physicsAccurate = false;
  } else {
    state.mapMode = false;
    state.productMode = 'present';
    state.pathGeometry = PRODUCT_PATH_GEOMETRY;
    state.physicsAccurate = false;
    state.flightOpsMode = false;
    if (state.pathAccuracy) state.pathAccuracy.nbodyOverlay = false;
  }
  // Sync selects immediately
  try {
    const geom = document.getElementById('path-geometry-select');
    if (geom) geom.value = effectivePathGeometry();
    const modeSel = document.getElementById('product-mode-select');
    if (modeSel) modeSel.value = state.productMode;
    const disp = document.getElementById('display-mode-select');
    if (disp) disp.value = want ? 'schematic' : 'cinematic';
  } catch { /* */ }
  syncMapModeUi();
  updateViewBadge();

  _mapModeChain = _mapModeChain
    .then(() => import('../domain/display-modes.js'))
    .then(({ setProductMode }) => setProductMode(want ? 'compare' : 'present', {
      silent: opts.silent,
      skipRecompute: true,
    }))
    .catch((e) => console.warn('[HELIOS] setMapMode', e));
  return _mapModeChain;
}

export function toggleMapMode() {
  // Prefer productMode so we do not flip twice during async lag
  const on = !(state.mapMode || state.productMode === 'compare' || state.productMode === 'ops');
  return setMapMode(on);
}

/** Rebuild planet orbit polylines after inclination scale change. */
export function rebuildOrbitLines() {
  for (const [name, data] of orbitLines) {
    const body = BODIES.find((b) => b.name === name);
    if (!body || !data.line) continue;
    const pts = generateOrbitPoints(body, 256).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    data.line.geometry.dispose();
    data.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    try {
      if (data.line.computeLineDistances) data.line.computeLineDistances();
    } catch { /* solid materials */ }
  }
}

export function syncMapModeUi() {
  const mapOn = !!(state.mapMode || state.productMode === 'compare');
  const title = mapOn
    ? 'Map mode ON — Compare dual path. Click for Present.'
    : 'Map mode — schematic frames + dual path overlay (Compare)';
  for (const id of ['btn-map-mode', 'btn-map-mode-view']) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.classList.toggle('active', mapOn);
    btn.setAttribute('aria-pressed', mapOn ? 'true' : 'false');
    btn.title = title;
  }
  const geom = document.getElementById('path-geometry-select');
  if (geom) geom.value = effectivePathGeometry();
  const disp = document.getElementById('display-mode-select');
  if (disp) disp.value = state.display?.mode || 'cinematic';
  const modeSel = document.getElementById('product-mode-select');
  if (modeSel && state.productMode) modeSel.value = state.productMode;
}

export function mapModeBadgeText() {
  if (state.mapMode || state.productMode === 'compare') {
    return 'VIEW: COMPARE · dual path · physical frames';
  }
  if (isSchematic()) {
    return 'VIEW: ANALYZE — physical path; numbers always physical';
  }
  return 'VIEW: PRESENT · physical + display transform';
}

export function wireMapMode() {
  for (const id of ['btn-map-mode', 'btn-map-mode-view']) {
    const btn = document.getElementById(id);
    if (btn) btn.onclick = () => { void toggleMapMode(); };
  }
  syncMapModeUi();
}
