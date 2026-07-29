/**
 * Offline sample-table ephemeris (L2-plan, K5).
 * Loads assets/ephemeris-samples-v1.json (lazy) and linearly interpolates.
 */

import { AU, DAY } from '../constants.js';

let _table = null;
let _loadAttempted = false;
let _loadPromise = null;

const BODY_KEYS = {
  mercury: 'mercury', venus: 'venus', earth: 'earth', mars: 'mars',
  jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune',
};

function bodyKey(body) {
  if (!body) return null;
  const raw = (typeof body === 'string' ? body : (body.id || body.name || '')).toLowerCase().trim();
  return BODY_KEYS[raw] || null;
}

/**
 * Inject table for offline tests (no fetch).
 * @param {object|null} table
 */
export function setSampleTableForTests(table) {
  _table = table;
  _loadAttempted = true;
}

export function getSampleMeta() {
  if (!_table) return null;
  return {
    version: _table.version,
    source: _table.source,
    source_note: _table.source_note,
    bake_source: _table.bake_source,
    frame: _table.frame,
    t0_iso: _table.t0_iso,
    t1_iso: _table.t1_iso,
    step_days: _table.step_days,
    n: _table.n,
    bodies: Object.keys(_table.bodies || {}),
    kernels: _table.kernels,
    flight_ops_certified: _table.flight_ops_certified === true,
  };
}

/** True when offline table was baked from DE/SPICE kernels (L3-class). */
export function sampleTableIsSpiceDe() {
  const m = getSampleMeta();
  if (!m) return false;
  if (m.bake_source === 'spice-de440s') return true;
  return /spice|de440/i.test(m.source || '');
}

export async function ensureSampleTableLoaded() {
  if (_table || _loadAttempted) return _table;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    _loadAttempted = true;
    try {
      if (typeof fetch === 'function') {
        const res = await fetch(new URL('../../assets/ephemeris-samples-v1.json', import.meta.url));
        if (res.ok) _table = await res.json();
      }
    } catch (_) {
      _table = null;
    }
    return _table;
  })();
  return _loadPromise;
}

/** Sync load for Node tests via dynamic import of JSON is handled by setSampleTableForTests / loadSampleTableSync. */
export async function loadSampleTableFromObject(obj) {
  _table = obj;
  _loadAttempted = true;
  return _table;
}

export function sampleAvailable(body, timeSec) {
  if (!_table) return false;
  const key = bodyKey(body);
  if (!key || !_table.bodies?.[key]) return false;
  const t0 = _table.t0_sim;
  const step = _table.step_sec;
  const n = _table.n;
  if (!(step > 0) || n < 2) return false;
  const t1 = t0 + (n - 1) * step;
  return timeSec >= t0 - 1e-6 && timeSec <= t1 + 1e-6;
}

function interpSeries(series, timeSec) {
  const t0 = _table.t0_sim;
  const step = _table.step_sec;
  const n = _table.n;
  const u = (timeSec - t0) / step;
  if (u < 0 || u > n - 1) return null;
  const i0 = Math.floor(u);
  const i1 = Math.min(n - 1, i0 + 1);
  const f = u - i0;
  const a = series[i0];
  const b = series[i1];
  return {
    x: a[0] + f * (b[0] - a[0]),
    y: a[1] + f * (b[1] - a[1]),
    z: a[2] + f * (b[2] - a[2]),
  };
}

export function samplePosition3D(body, timeSec) {
  if (!sampleAvailable(body, timeSec)) return null;
  const key = bodyKey(body);
  return interpSeries(_table.bodies[key].pos_au, timeSec);
}

/**
 * Velocity via central difference on sample positions (m/s, scene axes).
 */
export function sampleVelocity3D(body, timeSec) {
  if (!sampleAvailable(body, timeSec)) return null;
  const dt = Math.min(DAY, (_table.step_sec || DAY) * 0.25);
  const pa = samplePosition3D(body, timeSec - dt);
  const pb = samplePosition3D(body, timeSec + dt);
  if (!pa || !pb) return null;
  // Match kepler.js finite-diff convention: array [vx,vy,vz] m/s
  return [
    (pb.x - pa.x) * AU / (2 * dt),
    (pb.y - pa.y) * AU / (2 * dt),
    (pb.z - pa.z) * AU / (2 * dt),
  ];
}
