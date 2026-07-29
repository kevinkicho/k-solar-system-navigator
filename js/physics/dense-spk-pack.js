/**
 * Modular dense SPICE packs (Float32 LE xyz).
 * Loads assets/dense-spk/<pack>.meta.json + .bin produced by build-dense-spk-pack.py.
 *
 * Also supports legacy mars moons path (assets/ephemeris-mars-moons-dense.*).
 */

import { AU } from '../constants.js';
import { moonSampleCadenceOk, adaptiveVelocityDtSec } from './moon-fidelity.js';

/** @type {Map<string, { meta: object, f32: Float32Array }>} */
const _packs = new Map();
let _loadPromise = null;

const BODY_TO_PACK = {
  phobos: 'mars-moons',
  deimos: 'mars-moons',
  moon: 'earth-moon',
  mercury: 'planets-dense',
  venus: 'planets-dense',
  earth: 'planets-dense',
  mars: 'planets-dense',
  jupiter: 'planets-dense',
  saturn: 'planets-dense',
  uranus: 'planets-dense',
  neptune: 'planets-dense',
};

export function listLoadedDensePacks() {
  return [..._packs.keys()];
}

export function getDensePackMeta(packId) {
  return _packs.get(packId)?.meta || null;
}

export function setDensePackForTests(packId, meta, float32Array) {
  if (!meta || !float32Array) {
    _packs.delete(packId);
    return;
  }
  _packs.set(packId, { meta, f32: float32Array });
}

function bodyKey(body) {
  if (!body) return null;
  return (typeof body === 'string' ? body : (body.id || body.name || '')).toLowerCase().trim();
}

async function fetchPack(packId, base = '../../assets/dense-spk/') {
  if (_packs.has(packId)) return _packs.get(packId);
  if (typeof fetch !== 'function') return null;
  try {
    const metaUrl = new URL(`${base}${packId}.meta.json`, import.meta.url);
    const resM = await fetch(metaUrl);
    if (!resM.ok) return null;
    const meta = await resM.json();
    const binName = meta.bin || `${packId}.bin`;
    const binUrl = new URL(`${base}${binName}`, import.meta.url);
    const resB = await fetch(binUrl);
    if (!resB.ok) return null;
    const buf = await resB.arrayBuffer();
    const f32 = new Float32Array(buf);
    const entry = { meta, f32 };
    _packs.set(packId, entry);
    return entry;
  } catch {
    return null;
  }
}

/** Load legacy mars moons + new modular packs. */
export async function ensureDenseSpkPacksLoaded() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    // Legacy path (already committed product)
    try {
      if (typeof fetch === 'function' && !_packs.has('mars-moons')) {
        const metaUrl = new URL('../../assets/ephemeris-mars-moons-dense.meta.json', import.meta.url);
        const resM = await fetch(metaUrl);
        if (resM.ok) {
          const meta = await resM.json();
          meta.pack_id = meta.pack_id || 'mars-moons';
          meta.bodies = meta.bodies || ['phobos', 'deimos'];
          const binUrl = new URL(`../../assets/${meta.bin || 'ephemeris-mars-moons-dense.bin'}`, import.meta.url);
          const resB = await fetch(binUrl);
          if (resB.ok) {
            _packs.set('mars-moons', { meta, f32: new Float32Array(await resB.arrayBuffer()) });
          }
        }
      }
    } catch { /* */ }

    // Modular Tier A packs (optional if present)
    await fetchPack('earth-moon');
    await fetchPack('planets-dense');
    // Prefer modular mars-moons if present (overrides legacy only if both load — modular wins if later)
    const modularMars = await fetchPack('mars-moons');
    if (modularMars) _packs.set('mars-moons', modularMars);

    return listLoadedDensePacks();
  })();
  return _loadPromise;
}

function packForBody(body) {
  const key = bodyKey(body);
  if (!key) return null;
  const packId = BODY_TO_PACK[key];
  if (!packId) return null;
  return _packs.get(packId) || null;
}

function inWindow(meta, timeSec) {
  if (!meta) return false;
  const t0 = meta.t0_sim;
  const step = meta.step_sec;
  const n = meta.n;
  if (!(step > 0) || n < 2) return false;
  const t1 = t0 + (n - 1) * step;
  return timeSec >= t0 - 1e-6 && timeSec <= t1 + 1e-6;
}

export function denseSpkAvailable(body, timeSec, opts = {}) {
  const entry = packForBody(body);
  if (!entry) return false;
  const key = bodyKey(body);
  if (!entry.meta.bodies?.includes(key)) return false;
  if (!inWindow(entry.meta, timeSec)) return false;
  // Relative moon packs: enforce cadence if period known
  if (opts.requireCadence !== false && body?.period > 0 && entry.meta.mode === 'relative') {
    if (!moonSampleCadenceOk(entry.meta.step_sec, body.period)) return false;
  }
  return true;
}

function readPos(entry, bodyName, i) {
  const { meta, f32 } = entry;
  const bi = meta.bodies.indexOf(bodyName);
  if (bi < 0) return null;
  const n = meta.n;
  const base = bi * n * 3 + i * 3;
  return { x: f32[base], y: f32[base + 1], z: f32[base + 2] };
}

/** Cubic Hermite sample of dense pack (AU). */
export function sampleDenseSpkAU(body, timeSec) {
  if (!denseSpkAvailable(body, timeSec, { requireCadence: false })) return null;
  const entry = packForBody(body);
  const key = bodyKey(body);
  const { meta } = entry;
  if (body?.period > 0 && meta.mode === 'relative' && !moonSampleCadenceOk(meta.step_sec, body.period)) {
    return null;
  }
  const u = (timeSec - meta.t0_sim) / meta.step_sec;
  if (u < 0 || u > meta.n - 1) return null;
  const n = meta.n;
  const i0 = Math.floor(u);
  const i1 = Math.min(n - 1, i0 + 1);
  const f = u - i0;
  if (i0 === i1 || n < 3) {
    const a = readPos(entry, key, i0);
    const b = readPos(entry, key, i1);
    if (!a || !b) return null;
    return {
      x: a.x + f * (b.x - a.x),
      y: a.y + f * (b.y - a.y),
      z: a.z + f * (b.z - a.z),
      source: meta.source || `dense-spk:${meta.pack_id}`,
      pack_id: meta.pack_id,
      mode: meta.mode,
    };
  }
  const im1 = Math.max(0, i0 - 1);
  const i2 = Math.min(n - 1, i1 + 1);
  const p0 = readPos(entry, key, im1);
  const p1 = readPos(entry, key, i0);
  const p2 = readPos(entry, key, i1);
  const p3 = readPos(entry, key, i2);
  if (!p0 || !p1 || !p2 || !p3) return null;
  const f2 = f * f;
  const f3 = f2 * f;
  const h00 = 2 * f3 - 3 * f2 + 1;
  const h10 = f3 - 2 * f2 + f;
  const h01 = -2 * f3 + 3 * f2;
  const h11 = f3 - f2;
  const out = [0, 0, 0];
  const keys = ['x', 'y', 'z'];
  for (let k = 0; k < 3; k++) {
    const kk = keys[k];
    const m1 = 0.5 * (p2[kk] - p0[kk]);
    const m2 = 0.5 * (p3[kk] - p1[kk]);
    out[k] = h00 * p1[kk] + h10 * m1 + h01 * p2[kk] + h11 * m2;
  }
  return {
    x: out[0], y: out[1], z: out[2],
    source: meta.source || `dense-spk:${meta.pack_id}`,
    pack_id: meta.pack_id,
    mode: meta.mode,
  };
}

export function sampleDenseSpkVelocity_m_s(body, timeSec) {
  if (!denseSpkAvailable(body, timeSec)) return null;
  const entry = packForBody(body);
  const dt = Math.min(
    adaptiveVelocityDtSec(body.period || 3600),
    Math.max(30, (entry.meta.step_sec || 600) * 0.5),
  );
  const ra = sampleDenseSpkAU(body, timeSec - dt);
  const rb = sampleDenseSpkAU(body, timeSec + dt);
  if (!ra || !rb) return null;
  return [
    (rb.x - ra.x) * AU / (2 * dt),
    (rb.y - ra.y) * AU / (2 * dt),
    (rb.z - ra.z) * AU / (2 * dt),
  ];
}

/** Summary for OPS / accuracy budget. */
export function denseSpkCoverageSummary() {
  const packs = [];
  for (const [id, { meta }] of _packs) {
    packs.push({
      pack_id: id,
      bodies: meta.bodies,
      step_min: meta.step_min ?? meta.step_sec / 60,
      t0: meta.t0_iso,
      t1: meta.t1_iso,
      size_miB: meta.size_miB,
      mode: meta.mode,
    });
  }
  return {
    n_packs: packs.length,
    packs,
    note: packs.length
      ? `Dense SPICE packs loaded: ${packs.map((p) => p.pack_id).join(', ')}`
      : 'No dense SPICE packs loaded — continuous Kepler / coarse samples.',
  };
}
