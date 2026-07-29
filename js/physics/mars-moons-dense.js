/**
 * Dense SPICE-baked Mars moons (Phobos/Deimos) parent-relative table.
 * Binary Float32 + meta JSON from scripts/build-mars-moons-spice.py.
 */

import { AU } from '../constants.js';
import { moonSampleCadenceOk, adaptiveVelocityDtSec } from './moon-fidelity.js';

let _meta = null;
let _buf = null;
let _f32 = null;
let _loadAttempted = false;
let _loadPromise = null;

const BODY_INDEX = { phobos: 0, deimos: 1 };

export function setMarsMoonsDenseForTests(meta, float32Array) {
  _meta = meta;
  _f32 = float32Array;
  _buf = float32Array?.buffer || null;
  _loadAttempted = true;
}

export function getMarsMoonsDenseMeta() {
  return _meta;
}

export async function ensureMarsMoonsDenseLoaded() {
  if (_meta && _f32) return _meta;
  if (_loadAttempted && !_loadPromise) return _meta;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    _loadAttempted = true;
    try {
      if (typeof fetch !== 'function') return null;
      const metaUrl = new URL('../../assets/ephemeris-mars-moons-dense.meta.json', import.meta.url);
      const resM = await fetch(metaUrl);
      if (!resM.ok) return null;
      _meta = await resM.json();
      const binName = _meta.bin || 'ephemeris-mars-moons-dense.bin';
      const binUrl = new URL('../../assets/' + binName, import.meta.url);
      const resB = await fetch(binUrl);
      if (!resB.ok) { _meta = null; return null; }
      _buf = await resB.arrayBuffer();
      _f32 = new Float32Array(_buf);
    } catch {
      _meta = null;
      _f32 = null;
    }
    return _meta;
  })();
  return _loadPromise;
}

function bodyKey(body) {
  if (!body) return null;
  const raw = (typeof body === 'string' ? body : (body.id || body.name || '')).toLowerCase();
  return BODY_INDEX[raw] != null ? raw : null;
}

function inWindow(timeSec) {
  if (!_meta) return false;
  const t0 = _meta.t0_sim;
  const step = _meta.step_sec;
  const n = _meta.n;
  if (!(step > 0) || n < 2) return false;
  const t1 = t0 + (n - 1) * step;
  return timeSec >= t0 - 1e-6 && timeSec <= t1 + 1e-6;
}

export function marsMoonDenseAvailable(body, timeSec) {
  if (!_meta || !_f32) return false;
  const key = bodyKey(body);
  if (!key) return false;
  if (!moonSampleCadenceOk(_meta.step_sec, body.period || 1e9)) return false;
  return inWindow(timeSec);
}

function sampleIndex(timeSec) {
  const t0 = _meta.t0_sim;
  const step = _meta.step_sec;
  const n = _meta.n;
  const u = (timeSec - t0) / step;
  if (u < 0 || u > n - 1) return null;
  return u;
}

function readPos(bodyIdx, i) {
  const n = _meta.n;
  const base = bodyIdx * n * 3 + i * 3;
  return { x: _f32[base], y: _f32[base + 1], z: _f32[base + 2] };
}

export function sampleMarsMoonRelativeAU(body, timeSec) {
  if (!marsMoonDenseAvailable(body, timeSec)) return null;
  const key = bodyKey(body);
  const bodyIdx = BODY_INDEX[key];
  const u = sampleIndex(timeSec);
  if (u == null) return null;
  const n = _meta.n;
  const i0 = Math.floor(u);
  const i1 = Math.min(n - 1, i0 + 1);
  const f = u - i0;
  if (i0 === i1 || n < 3) {
    const a = readPos(bodyIdx, i0);
    const b = readPos(bodyIdx, i1);
    return {
      x: a.x + f * (b.x - a.x),
      y: a.y + f * (b.y - a.y),
      z: a.z + f * (b.z - a.z),
      source: 'spice-mar099s-dense',
    };
  }
  const im1 = Math.max(0, i0 - 1);
  const i2 = Math.min(n - 1, i1 + 1);
  const p0 = readPos(bodyIdx, im1);
  const p1 = readPos(bodyIdx, i0);
  const p2 = readPos(bodyIdx, i1);
  const p3 = readPos(bodyIdx, i2);
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
  return { x: out[0], y: out[1], z: out[2], source: 'spice-mar099s-dense' };
}

export function sampleMarsMoonRelativeVelocity_m_s(body, timeSec) {
  if (!marsMoonDenseAvailable(body, timeSec)) return null;
  const dt = Math.min(
    adaptiveVelocityDtSec(body.period || 600),
    Math.max(30, (_meta.step_sec || 600) * 0.5),
  );
  const ra = sampleMarsMoonRelativeAU(body, timeSec - dt);
  const rb = sampleMarsMoonRelativeAU(body, timeSec + dt);
  if (!ra || !rb) return null;
  return [
    (rb.x - ra.x) * AU / (2 * dt),
    (rb.y - ra.y) * AU / (2 * dt),
    (rb.z - ra.z) * AU / (2 * dt),
  ];
}
