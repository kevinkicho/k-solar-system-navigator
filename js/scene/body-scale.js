/**
 * Planet/sun display scale: cinematic displayRadius vs semi-true R/AU×boost.
 * Pure 1:1 AU planet radii are ~1e-5 AU — invisible at solar-system framing.
 *
 * bodySceneRadius is pure (no Three.js / DOM) for offline tests.
 * applyBodyScales() touches the scene (browser only).
 */
import { AU } from '../constants.js';
import { state } from '../state.js';
import { BODIES, SUN_DATA } from '../data/bodies.js';

/**
 * Scene radius (AU units of the HELIOS scene) for a body.
 * @param {{ radius?: number, displayRadius?: number }} body
 */
export function bodySceneRadius(body) {
  if (!body) return 0.02;
  if (!state.trueScaleBodies) return body.displayRadius ?? 0.02;
  const rAU = (body.radius || 1e6) / AU;
  const boost = state.trueScaleBoost || 200;
  return Math.max(rAU * boost, 0.0015);
}

/** Apply scale to planet mesh groups relative to their baseline displayRadius. */
export function applyBodyScales() {
  // Dynamic import keeps offline unit tests free of DOM/WebGL
  import('./planets.js').then(({ planetMeshes }) => {
    for (const body of BODIES) {
      const group = planetMeshes.get(body.name);
      if (!group) continue;
      const base = body.displayRadius || 0.02;
      const want = bodySceneRadius(body);
      group.scale.setScalar(want / base);
    }
  }).catch(() => {});
  import('./sun.js').then(({ sunMesh }) => {
    if (!sunMesh) return;
    const base = SUN_DATA.displayRadius || 0.06;
    const want = bodySceneRadius(SUN_DATA);
    sunMesh.scale.setScalar(want / base);
  }).catch(() => {});
}
