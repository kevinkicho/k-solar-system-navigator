/**
 * Compatibility shim — Mars moons dense SPICE via modular dense-spk packs.
 * Prefer dense-spk-pack.js for new code.
 */
import {
  ensureDenseSpkPacksLoaded,
  getDensePackMeta,
  setDensePackForTests,
  denseSpkAvailable,
  sampleDenseSpkAU,
  sampleDenseSpkVelocity_m_s,
} from './dense-spk-pack.js';

export async function ensureMarsMoonsDenseLoaded() {
  await ensureDenseSpkPacksLoaded();
  return getDensePackMeta('mars-moons');
}

export function getMarsMoonsDenseMeta() {
  return getDensePackMeta('mars-moons');
}

export function setMarsMoonsDenseForTests(meta, float32Array) {
  if (!meta) {
    setDensePackForTests('mars-moons', null, null);
    return;
  }
  const m = { ...meta, pack_id: 'mars-moons', bodies: meta.bodies || ['phobos', 'deimos'] };
  setDensePackForTests('mars-moons', m, float32Array);
}

export function marsMoonDenseAvailable(body, timeSec) {
  return denseSpkAvailable(body, timeSec);
}

export function sampleMarsMoonRelativeAU(body, timeSec) {
  return sampleDenseSpkAU(body, timeSec);
}

export function sampleMarsMoonRelativeVelocity_m_s(body, timeSec) {
  return sampleDenseSpkVelocity_m_s(body, timeSec);
}
