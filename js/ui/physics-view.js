/**
 * Physics-accurate *view* mode.
 *
 * IMPORTANT: Three.js has no orbital-mechanics solver that makes HELIOS "physics accurate."
 * Accuracy comes from js/physics (Lambert, Kepler, ephemeris). This mode only aligns the
 * *scene* with physical frames (no inclination ×8, physical path, dual overlay).
 */
import { state, effectivePathGeometry } from '../state.js';
import { applyBodyScales } from '../scene/body-scale.js';

/**
 * @param {boolean} on
 * @param {{ silent?: boolean }} [opts]
 */
export function setPhysicsAccurateView(on, opts = {}) {
  // Domain product modes: ACCURATE → ops, off → present
  import('../domain/display-modes.js').then(({ setProductMode }) => {
    setProductMode(on ? 'ops' : 'present', {
      silent: opts.silent,
      skipRecompute: !on,
    }).then(() => {
      syncPhysicsViewUi();
      if (on && state.routeOrigin && state.routeDestination) {
        import('./route-planner.js').then(({ computeRoute }) => computeRoute()).catch(() => {});
      }
    });
  });
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
  if (geom) geom.value = effectivePathGeometry();
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
