/**
 * Physics-accurate *view* mode.
 *
 * IMPORTANT: Three.js has no orbital-mechanics solver that makes HELIOS "physics accurate."
 * Accuracy comes from js/physics (Lambert, Kepler, ephemeris). This mode only aligns the
 * *scene* with physical frames (no inclination ×8, physical path, dual overlay).
 */
import { state } from '../state.js';
import { setDisplayMode } from '../display-scale.js';
import { rebuildOrbitLines, syncMapModeUi } from './map-mode.js';
import { updateViewBadge } from './share.js';
import { applyBodyScales } from '../scene/body-scale.js';

/**
 * @param {boolean} on
 * @param {{ silent?: boolean }} [opts]
 */
export function setPhysicsAccurateView(on, opts = {}) {
  const want = !!on;
  state.physicsAccurate = want;

  if (want) {
    state.mapMode = true;
    setDisplayMode('schematic');
    // Physical path is primary; also keep dual overlay so cinematic divergence is visible
    state.pathGeometry = 'both';
    state.pathOffsetPolicy = 'time_varying';
    // Prefer equal-time Kepler sampling (already default)
    state.pathSampleMode = 'equal_time';
    state.showDvArrows = true;
    state.showPathBead = true;
    // Higher planning fidelity (offline sample endpoints — not SPICE)
    if (!state.classroomMode) {
      state.ephemerisBackend = 'sample-de';
      state.fidelityLevel = 'L2-plan';
      if (state.pathAccuracy) {
        state.pathAccuracy.preferSampleDeOuter = true;
        // Educational residual only — does not change Need
        state.pathAccuracy.nbodyOverlay = true;
      }
      import('../physics/ephemeris-sample.js').then((m) => m.ensureSampleTableLoaded()).catch(() => {});
      const ephSel = document.getElementById('ephemeris-backend');
      if (ephSel) ephSel.value = 'sample-de';
      const flagNbody = document.getElementById('flag-nbody');
      if (flagNbody) flagNbody.checked = true;
    }
  } else {
    state.mapMode = false;
    setDisplayMode('cinematic');
    state.pathGeometry = 'visual';
    if (state.pathAccuracy) state.pathAccuracy.nbodyOverlay = false;
    const flagNbody = document.getElementById('flag-nbody');
    if (flagNbody) flagNbody.checked = false;
  }

  rebuildOrbitLines();
  applyBodyScales();
  syncMapModeUi();
  syncPhysicsViewUi();
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
        ? 'PHYSICS-ACCURATE · L2-plan sample-DE · schematic path · n-body residual overlay (Need unchanged) · Three.js display only'
        : 'CINEMATIC VIEW — exaggerated inclinations for readability');
    });
  }

  // Re-solve with sample-DE if a route is already up
  if (want && state.transferData && !state.classroomMode) {
    import('./route-planner.js').then(({ stampPlanningEphemeris, computeRoute }) => {
      // Prefer full recompute for consistent Need under L2-plan
      if (state.routeOrigin && state.routeDestination) computeRoute();
      else if (state.transferData) stampPlanningEphemeris(state.transferData);
    }).catch(() => {});
  }
}

export function togglePhysicsAccurateView() {
  setPhysicsAccurateView(!state.physicsAccurate);
}

export function setTrueScaleBodies(on, opts = {}) {
  state.trueScaleBodies = !!on;
  applyBodyScales();
  syncPhysicsViewUi();
  if (!opts.silent) {
    import('./format.js').then(({ notify }) => {
      notify(state.trueScaleBodies
        ? `TRUE-SCALE BODIES · R/AU × ${state.trueScaleBoost} (semi-true; 1:1 is invisible)`
        : 'DISPLAY RADII — cinematic planet sizes');
    });
  }
}

export function syncPhysicsViewUi() {
  const acc = document.getElementById('btn-physics-accurate');
  if (acc) {
    acc.classList.toggle('active', !!state.physicsAccurate);
    acc.setAttribute('aria-pressed', state.physicsAccurate ? 'true' : 'false');
  }
  const ts = document.getElementById('btn-true-scale');
  if (ts) {
    ts.classList.toggle('active', !!state.trueScaleBodies);
    ts.setAttribute('aria-pressed', state.trueScaleBodies ? 'true' : 'false');
  }
  const disp = document.getElementById('display-mode-select');
  if (disp) disp.value = state.display?.mode || 'cinematic';
  const geom = document.getElementById('path-geometry-select');
  if (geom) geom.value = state.pathGeometry || 'visual';
}

export function wirePhysicsView() {
  const acc = document.getElementById('btn-physics-accurate');
  if (acc) acc.onclick = () => togglePhysicsAccurateView();
  const ts = document.getElementById('btn-true-scale');
  if (ts) ts.onclick = () => setTrueScaleBodies(!state.trueScaleBodies);
  const tour = document.getElementById('btn-camera-tour');
  if (tour) {
    tour.onclick = () => {
      import('../scene/camera-tour.js').then((m) => m.startTransferTour?.());
    };
  }
  syncPhysicsViewUi();
}
