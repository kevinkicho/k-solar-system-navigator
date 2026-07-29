/**
 * Modular dense SPICE packs (Float32 LE xyz) with lazy Tier-B loading.
 *
 * Tier A (mars-moons, earth-moon, planets-dense): loaded at ephemeris init.
 * Tier B (galilean, titan-triton): loaded on demand when a route needs them.
 *
 * Bake: python scripts/build-dense-spk-pack.py --all-tier-a|--all-tier-b
 */

import { AU } from '../constants.js';
import { moonSampleCadenceOk, adaptiveVelocityDtSec } from './moon-fidelity.js';

/** @type {Map<string, { meta: object, f32: Float32Array }>} */
const _packs = new Map();
/** @type {object|null} registry.json */
let _registry = null;
/** @type {Set<string>} */
const _loading = new Set();
/** @type {Promise<string[]>|null} */
let _tierAPromise = null;

const TIER_A_PACKS = ['mars-moons', 'earth-moon', 'planets-dense'];

/** Static fallback map when registry not yet loaded. */
const BODY_TO_PACK_FALLBACK = {
  phobos: 'mars-moons',
  deimos: 'mars-moons',
  moon: 'earth-moon',
  io: 'galilean',
  europa: 'galilean',
  ganymede: 'galilean',
  callisto: 'galilean',
  titan: 'titan',
  triton: 'triton',
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

export function getDenseRegistry() {
  return _registry;
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

export function packIdForBody(body) {
  const key = bodyKey(body);
  if (!key) return null;
  if (_registry?.body_to_pack?.[key]) return _registry.body_to_pack[key];
  return BODY_TO_PACK_FALLBACK[key] || null;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function fetchPack(packId) {
  if (_packs.has(packId)) return _packs.get(packId);
  if (_loading.has(packId)) {
    // Wait briefly for in-flight load
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 25));
      if (_packs.has(packId)) return _packs.get(packId);
      if (!_loading.has(packId)) break;
    }
  }
  if (typeof fetch !== 'function') return null;
  _loading.add(packId);
  try {
    // 1) Firebase Storage CDN (when Firebase enabled and pack uploaded)
    try {
      const cloud = await import('../firebase/dense-spk-cloud.js');
      if (cloud.isDenseCloudAvailable?.()) {
        const names = {};
        const regPack = _registry?.packs?.find((p) => p.pack_id === packId);
        if (regPack?.bin) names.bin = regPack.bin;
        if (regPack?.meta) names.meta = regPack.meta;
        const hit = await cloud.fetchDensePackFromStorage(packId, names);
        if (hit?.meta && hit.buffer) {
          const entry = {
            meta: { ...hit.meta, _delivery: 'firebase-storage' },
            f32: new Float32Array(hit.buffer),
          };
          _packs.set(packId, entry);
          return entry;
        }
      }
      // 1b) App Hosting same-origin API (when on hosted.app)
      const ah = await cloud.fetchDensePackFromAppHosting?.(packId);
      if (ah?.meta && ah.buffer) {
        const entry = {
          meta: { ...ah.meta, _delivery: 'apphosting-api' },
          f32: new Float32Array(ah.buffer),
        };
        _packs.set(packId, entry);
        return entry;
      }
    } catch { /* fall through to Hosting */ }

    // 2) Classic Hosting / App Hosting static assets (offline + classroom fallback)
    const base = new URL('../../assets/dense-spk/', import.meta.url);
    const metaUrl = new URL(`${packId}.meta.json`, base);
    const meta = await fetchJson(metaUrl);
    if (!meta) return null;
    const binName = meta.bin || `${packId}.bin`;
    const binUrl = new URL(binName, base);
    const resB = await fetch(binUrl);
    if (!resB.ok) return null;
    const f32 = new Float32Array(await resB.arrayBuffer());
    const entry = { meta: { ...meta, _delivery: 'hosting' }, f32 };
    _packs.set(packId, entry);
    return entry;
  } catch {
    return null;
  } finally {
    _loading.delete(packId);
  }
}

async function loadRegistry() {
  if (_registry || typeof fetch !== 'function') return _registry;

  // Prefer Firebase RTDB / Firestore / Storage registry when online
  try {
    const cloud = await import('../firebase/dense-spk-cloud.js');
    if (cloud.isDenseCloudAvailable?.()) {
      const reg = await cloud.fetchDenseSpkRegistryCloud();
      if (reg?.packs) {
        _registry = reg;
        return _registry;
      }
    }
  } catch { /* Hosting fallback */ }

  try {
    const url = new URL('../../assets/dense-spk/registry.json', import.meta.url);
    _registry = await fetchJson(url);
    if (_registry) _registry._source = 'hosting';
  } catch {
    _registry = null;
  }
  return _registry;
}

/**
 * Load Tier A packs (+ registry). Safe to call multiple times.
 * Does NOT auto-load Tier B (use ensureDensePackForBodies / ensureDensePack).
 */
export async function ensureDenseSpkPacksLoaded() {
  if (_tierAPromise) return _tierAPromise;
  _tierAPromise = (async () => {
    await loadRegistry();

    // Legacy mars moons path (committed product) if modular missing
    try {
      if (typeof fetch === 'function' && !_packs.has('mars-moons')) {
        const metaUrl = new URL('../../assets/ephemeris-mars-moons-dense.meta.json', import.meta.url);
        const resM = await fetch(metaUrl);
        if (resM.ok) {
          const meta = await resM.json();
          meta.pack_id = meta.pack_id || 'mars-moons';
          meta.bodies = meta.bodies || ['phobos', 'deimos'];
          meta.tier = meta.tier || 'A';
          const binUrl = new URL(`../../assets/${meta.bin || 'ephemeris-mars-moons-dense.bin'}`, import.meta.url);
          const resB = await fetch(binUrl);
          if (resB.ok) {
            _packs.set('mars-moons', { meta, f32: new Float32Array(await resB.arrayBuffer()) });
          }
        }
      }
    } catch { /* */ }

    // Tier A modular packs
    for (const id of TIER_A_PACKS) {
      await fetchPack(id);
    }
    return listLoadedDensePacks();
  })();
  return _tierAPromise;
}

/** Explicitly load one pack (Tier B). */
export async function ensureDensePack(packId) {
  if (!packId) return null;
  await loadRegistry();
  return fetchPack(packId);
}

/**
 * After Firebase init: re-resolve registry + re-fetch packs preferring Storage CDN.
 * Safe to call multiple times; overwrites Hosting-sourced Tier A entries when Storage works.
 */
export async function warmDensePacksFromCloud(bodyHints = []) {
  try {
    const cloud = await import('../firebase/dense-spk-cloud.js');
    if (!cloud.isDenseCloudAvailable?.()) {
      return { warmed: false, reason: 'firebase-off' };
    }
    cloud.clearDenseCloudCache?.();
    // Force registry re-read
    _registry = null;
    await loadRegistry();
    const regSrc = _registry?._source || 'unknown';

    // Prefer re-fetch of Tier A via Storage (drop Hosting copies so fetchPack runs cloud path)
    for (const id of TIER_A_PACKS) {
      _packs.delete(id);
      await fetchPack(id);
    }
    // Optional body-driven Tier B warm
    if (bodyHints.length) {
      await ensureDensePackForBodies(bodyHints);
    }
    const sum = denseSpkCoverageSummary();
    return {
      warmed: true,
      registry_source: regSrc,
      packs: sum.packs.map((p) => `${p.pack_id}:${p.delivery}`),
    };
  } catch (err) {
    return { warmed: false, reason: String(err?.message || err) };
  }
}

/**
 * Ensure dense packs covering the given bodies are loaded (lazy Tier B).
 * @param {Array<object|string>} bodies
 * @returns {Promise<{ loaded: string[], missing: string[] }>}
 */
export async function ensureDensePackForBodies(bodies = []) {
  await ensureDenseSpkPacksLoaded();
  const needed = new Set();
  for (const b of bodies) {
    const id = packIdForBody(b);
    if (id) needed.add(id);
  }
  const loaded = [];
  const missing = [];
  for (const id of needed) {
    const entry = await ensureDensePack(id);
    if (entry) loaded.push(id);
    else missing.push(id);
  }
  return { loaded, missing };
}

/**
 * Convenience for a transfer / route pair.
 */
export async function ensureDensePackForRoute(body1, body2, extra = []) {
  return ensureDensePackForBodies([body1, body2, ...extra].filter(Boolean));
}

function packForBody(body) {
  const packId = packIdForBody(body);
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
      tier: meta.tier || 'A',
      delivery: meta._delivery || 'local',
    });
  }
  const available = (_registry?.packs || []).map((p) => ({
    pack_id: p.pack_id,
    tier: p.tier,
    size_miB: p.size_miB,
    lazy: p.lazy,
    loaded: _packs.has(p.pack_id),
  }));
  const regSrc = _registry?._source || 'none';
  return {
    n_packs: packs.length,
    packs,
    registry: available,
    registry_source: regSrc,
    note: packs.length
      ? `Dense SPICE loaded: ${packs.map((p) => `${p.pack_id}(T${p.tier || 'A'}/${p.delivery || '?'})`).join(', ')} · registry=${regSrc}`
      : `No dense SPICE packs loaded (registry=${regSrc}) — continuous Kepler / DE table fallback.`,
  };
}
