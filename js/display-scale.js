// Display-scale multipliers for the 3D scene.
// Physics (Δv, Lambert) always uses real geometry via exaggerate=false.

import { INCL_EXAGGERATION, SUN_WOBBLE_EXAGGERATION } from './constants.js';
import { state } from './state.js';

/** Inclination multiplier for scene geometry (cinematic=8, schematic=1). */
export function inclMultiplier() {
  return state.display?.mode === 'schematic' ? 1 : INCL_EXAGGERATION;
}

/** Sun barycentric wobble multiplier for scene. */
export function sunWobbleMultiplier() {
  return state.display?.mode === 'schematic' ? 1 : SUN_WOBBLE_EXAGGERATION;
}

export function isSchematic() {
  return state.display?.mode === 'schematic';
}

export function setDisplayMode(mode) {
  if (mode !== 'cinematic' && mode !== 'schematic') return;
  state.display.mode = mode;
}

export function displayModeBadge() {
  if (isSchematic()) {
    return 'VIEW: SCHEMATIC — incl. & sun wobble physical; moon orbits still layout-scaled; numbers always physical';
  }
  return 'VIEW: CINEMATIC (exaggerated incl. / wobble)';
}
