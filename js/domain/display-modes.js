/**
 * Named product modes — Present / Analyze / Compare / Ops.
 * Replaces combinatorial pathGeometry × mapMode × physicsAccurate for most users.
 */

import { state, PRODUCT_PATH_GEOMETRY, effectivePathGeometry } from '../state.js';

/** @typedef {'present'|'analyze'|'compare'|'ops'} ProductModeId */

export const PRODUCT_MODE_IDS = ['present', 'analyze', 'compare', 'ops'];

/**
 * @type {Record<ProductModeId, object>}
 */
export const PRODUCT_MODES = {
  present: {
    id: 'present',
    label: 'Present',
    displayMode: 'cinematic',
    mapMode: false,
    physicsAccurate: false,
    pathGeometry: PRODUCT_PATH_GEOMETRY, // physical solve + cinematic_endpoints display transform
    dualOverlay: false,
    flightOpsMode: false,
    nbodyOverlay: false,
    badge: 'VIEW: PRESENT · physical + display transform',
    title: 'Presentation — one physical Lambert + cinematic endpoint blend. Need stays physical.',
  },
  analyze: {
    id: 'analyze',
    label: 'Analyze',
    displayMode: 'schematic',
    mapMode: false,
    physicsAccurate: false,
    pathGeometry: 'physical',
    dualOverlay: false,
    flightOpsMode: false,
    nbodyOverlay: false,
    badge: 'VIEW: ANALYZE · physical path',
    title: 'Analysis — schematic frames · physical path ≡ Need plane · one arc.',
  },
  compare: {
    id: 'compare',
    label: 'Compare',
    displayMode: 'schematic',
    mapMode: true,
    physicsAccurate: false,
    pathGeometry: 'both',
    dualOverlay: true,
    flightOpsMode: false,
    nbodyOverlay: false,
    badge: 'VIEW: COMPARE · dual path',
    title: 'Compare — physical primary + visual twin overlay (honesty map).',
  },
  ops: {
    id: 'ops',
    label: 'Ops',
    displayMode: 'schematic',
    mapMode: true,
    physicsAccurate: true,
    pathGeometry: 'both',
    dualOverlay: true,
    flightOpsMode: true,
    nbodyOverlay: true,
    badge: 'VIEW: OPS · dual path · analysis',
    title: 'Ops review — dual path · sample-DE · residuals. Not flight release.',
  },
};

export function getProductMode() {
  const id = state.productMode;
  if (PRODUCT_MODE_IDS.includes(id)) return id;
  // Infer from legacy flags
  if (state.physicsAccurate || state.flightOpsMode) return 'ops';
  if (state.mapMode || effectivePathGeometry() === 'both') return 'compare';
  if (state.display?.mode === 'schematic') return 'analyze';
  return 'present';
}

/**
 * Dual overlay when Compare/Ops or Advanced both.
 */
export function wantDualPathOverlay(appState = state) {
  const mode = appState.productMode || getProductMode();
  if (mode === 'compare' || mode === 'ops') return true;
  if (PRODUCT_MODES[mode]?.dualOverlay) return true;
  return !!(appState.physicsAccurate || appState.mapMode
    || effectivePathGeometry() === 'both');
}

/**
 * Apply a named product mode.
 * @param {ProductModeId|string} modeId
 * @param {{ silent?: boolean, skipRecompute?: boolean }} [opts]
 */
export async function setProductMode(modeId, opts = {}) {
  const id = PRODUCT_MODE_IDS.includes(modeId) ? modeId : 'present';
  const preset = PRODUCT_MODES[id];
  state.productMode = id;
  state.mapMode = !!preset.mapMode;
  state.physicsAccurate = !!preset.physicsAccurate;
  state.pathGeometry = preset.pathGeometry;
  state.flightOpsMode = !!preset.flightOpsMode;
  if (state.pathAccuracy) {
    state.pathAccuracy.nbodyOverlay = !!preset.nbodyOverlay;
  }

  const { setDisplayMode } = await import('../display-scale.js');
  setDisplayMode(preset.displayMode);

  if (id === 'ops' || id === 'analyze' || id === 'compare') {
    state.ephemerisBackend = state.ephemerisBackend || 'sample-de';
    if (state.fidelityLevel === 'L1') state.fidelityLevel = 'L2-plan';
    if (id === 'ops') {
      state.ephemerisBackend = 'sample-de';
      state.fidelityLevel = 'L2-plan';
      try {
        const { ensureSampleTableLoaded } = await import('../physics/ephemeris-sample.js');
        await ensureSampleTableLoaded?.();
      } catch { /* */ }
    }
  }

  // Sync advanced controls if present
  try {
    const ephSel = document.getElementById('ephemeris-backend');
    if (ephSel) ephSel.value = state.ephemerisBackend;
    const geom = document.getElementById('path-geometry-select');
    if (geom) geom.value = effectivePathGeometry();
    const disp = document.getElementById('display-mode-select');
    if (disp) disp.value = state.display?.mode || 'cinematic';
    const flagNbody = document.getElementById('flag-nbody');
    if (flagNbody) flagNbody.checked = !!state.pathAccuracy?.nbodyOverlay;
    const modeSel = document.getElementById('product-mode-select');
    if (modeSel) modeSel.value = id;
  } catch { /* */ }

  try {
    const { rebuildOrbitLines, syncMapModeUi } = await import('../ui/map-mode.js');
    rebuildOrbitLines();
    syncMapModeUi();
  } catch { /* */ }
  try {
    const { syncPhysicsViewUi } = await import('../ui/physics-view.js');
    syncPhysicsViewUi();
  } catch { /* */ }
  try {
    const { applyBodyScales } = await import('../scene/body-scale.js');
    applyBodyScales();
  } catch { /* */ }
  try {
    const { updateViewBadge } = await import('../ui/share.js');
    updateViewBadge();
  } catch { /* */ }

  if (state.showTransferOrbit && state.transferData) {
    try {
      const { refreshVisualTransferGeometry } = await import('../physics/routing.js');
      refreshVisualTransferGeometry(state.transferData);
      const { updateTransferOrbitVisual } = await import('../ui/route-orbit-visual.js');
      updateTransferOrbitVisual?.();
    } catch { /* */ }
  }

  if (!opts.skipRecompute && id === 'ops' && state.routeOrigin && state.routeDestination) {
    try {
      const { computeRoute } = await import('../ui/route-planner.js');
      computeRoute();
    } catch { /* */ }
  }

  if (!opts.silent) {
    try {
      const { notify } = await import('../ui/format.js');
      notify(`${preset.label.toUpperCase()} MODE · ${preset.title}`);
    } catch { /* */ }
  }

  try {
    window.dispatchEvent(new CustomEvent('helios-product-mode', { detail: { mode: id } }));
  } catch { /* */ }

  return { ok: true, mode: id, preset };
}

export function productModeBadgeText() {
  const id = getProductMode();
  return PRODUCT_MODES[id]?.badge || 'VIEW: —';
}

export function productModeTitle() {
  const id = getProductMode();
  return PRODUCT_MODES[id]?.title || '';
}
