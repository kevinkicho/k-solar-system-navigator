/**
 * Physics-accurate *view* mode → product mode Ops.
 *
 * IMPORTANT: Three.js has no orbital-mechanics solver that makes HELIOS "physics accurate."
 * Accuracy comes from js/physics (Lambert, Kepler, ephemeris). This mode only aligns the
 * *scene* with physical frames (no inclination ×8, dual path for honesty).
 */
import { state, PRODUCT_PATH_GEOMETRY, effectivePathGeometry } from '../state.js';
import { applyBodyScales } from '../scene/body-scale.js';

let _accurateChain = Promise.resolve();

/**
 * @param {boolean} on
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<object|void>}
 */
export function setPhysicsAccurateView(on, opts = {}) {
  const want = !!on;
  // Sync flags first (avoid race with MAP / product mode)
  if (want) {
    state.physicsAccurate = true;
    state.mapMode = true;
    state.productMode = 'ops';
    state.pathGeometry = 'both';
    state.flightOpsMode = true;
    if (state.pathAccuracy) state.pathAccuracy.nbodyOverlay = true;
  } else {
    state.physicsAccurate = false;
    state.mapMode = false;
    state.productMode = 'present';
    state.pathGeometry = PRODUCT_PATH_GEOMETRY;
    state.flightOpsMode = false;
    if (state.pathAccuracy) state.pathAccuracy.nbodyOverlay = false;
  }
  syncPhysicsViewUi();

  _accurateChain = _accurateChain
    .then(() => import('../domain/display-modes.js'))
    .then(({ setProductMode }) => setProductMode(want ? 'ops' : 'present', {
      silent: opts.silent,
      skipRecompute: !want,
    }))
    .then(() => {
      syncPhysicsViewUi();
      if (want && state.routeOrigin && state.routeDestination) {
        return import('./route-planner.js').then(({ computeRoute }) => computeRoute());
      }
    })
    .catch((e) => console.warn('[HELIOS] setPhysicsAccurateView', e));
  return _accurateChain;
}

export function togglePhysicsAccurateView() {
  const on = !(state.physicsAccurate || state.productMode === 'ops');
  return setPhysicsAccurateView(on);
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
    const on = !!(state.physicsAccurate || state.productMode === 'ops');
    acc.classList.toggle('active', on);
    acc.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  const ts = document.getElementById('btn-true-scale');
  if (ts) {
    ts.classList.toggle('active', !!state.trueScaleBodies);
    ts.setAttribute('aria-pressed', state.trueScaleBodies ? 'true' : 'false');
  }
  const disp = document.getElementById('display-mode-select');
  if (disp) disp.value = state.display?.mode || 'cinematic';
  const geom = document.getElementById('path-geometry-select');
  if (geom) geom.value = effectivePathGeometry();
  const modeSel = document.getElementById('product-mode-select');
  if (modeSel && state.productMode) modeSel.value = state.productMode;
}

export function wirePhysicsView() {
  const acc = document.getElementById('btn-physics-accurate');
  if (acc) acc.onclick = () => { void togglePhysicsAccurateView(); };
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
