/**
 * Offline sample-table ephemeris (L2/L3-plan).
 * - assets/ephemeris-samples-v1.json — major planets (heliocentric)
 * - assets/ephemeris-moons-v1.json — key moons (parent-relative AU)
 *
 * Moon heliocentric = parent sample (or null) + parent-relative moon sample.
 * Educational — not live SPICE SPKs.
 */

import { AU, DAY } from '../constants.js';
import { BODIES } from '../data/bodies.js';

let _table = null;
let _moonTable = null;
let _loadAttempted = false;
let _loadPromise = null;

const BODY_KEYS = {
  mercury: 'mercury', venus: 'venus', earth: 'earth', mars: 'mars',
  jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune',
};

const MOON_KEYS = {
  moon: 'moon', phobos: 'phobos', deimos: 'deimos',
  io: 'io', europa: 'europa', ganymede: 'ganymede', callisto: 'callisto',
  titan: 'titan', enceladus: 'enceladus', triton: 'triton',
};

function bodyKey(body) {
  if (!body) return null;
  const raw = (typeof body === 'string' ? body : (body.id || body.name || '')).toLowerCase().trim();
  return BODY_KEYS[raw] || null;
}

function moonKey(body) {
  if (!body) return null;
  const raw = (typeof body === 'string' ? body : (body.id || body.name || '')).toLowerCase().trim();
  return MOON_KEYS[raw] || null;
}

export function setSampleTableForTests(table) {
  _table = table;
  _loadAttempted = true;
}

export function setMoonTableForTests(table) {
  _moonTable = table;
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
    moons: _moonTable ? Object.keys(_moonTable.bodies || {}) : [],
    kernels: _table.kernels,
    flight_ops_certified: _table.flight_ops_certified === true,
  };
}

export function sampleTableIsSpiceDe() {
  const m = getSampleMeta();
  if (!m) return false;
  if (m.bake_source === 'spice-de440s') return true;
  return /spice|de440/i.test(m.source || '');
}

export async function ensureSampleTableLoaded() {
  if (_table || _loadAttempted) {
    // Still try moons if planets already loaded without moons
    if (_table && !_moonTable && typeof fetch === 'function') {
      try {
        const resM = await fetch(new URL('../../assets/ephemeris-moons-v1.json', import.meta.url));
        if (resM.ok) _moonTable = await resM.json();
      } catch { /* */ }
    }
    return _table;
  }
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    _loadAttempted = true;
    try {
      if (typeof fetch === 'function') {
        const res = await fetch(new URL('../../assets/ephemeris-samples-v1.json', import.meta.url));
        if (res.ok) _table = await res.json();
        const resM = await fetch(new URL('../../assets/ephemeris-moons-v1.json', import.meta.url));
        if (resM.ok) _moonTable = await resM.json();
      }
    } catch (_) {
      _table = _table || null;
    }
    return _table;
  })();
  return _loadPromise;
}

export async function loadSampleTableFromObject(obj) {
  _table = obj;
  _loadAttempted = true;
  return _table;
}

function inWindow(table, timeSec) {
  if (!table) return false;
  const t0 = table.t0_sim;
  const step = table.step_sec;
  const n = table.n;
  if (!(step > 0) || n < 2) return false;
  const t1 = t0 + (n - 1) * step;
  return timeSec >= t0 - 1e-6 && timeSec <= t1 + 1e-6;
}

export function sampleAvailable(body, timeSec) {
  const pk = bodyKey(body);
  if (pk && _table?.bodies?.[pk] && inWindow(_table, timeSec)) return true;
  const mk = moonKey(body);
  if (mk && _moonTable?.bodies?.[mk] && inWindow(_moonTable, timeSec)) {
    // Moon sample usable if parent sample or we can still return relative-only
    // (heliocentric needs parent — check parent available)
    const parentName = _moonTable.bodies[mk].parent;
    const parentKey = BODY_KEYS[parentName];
    if (parentKey && _table?.bodies?.[parentKey] && inWindow(_table, timeSec)) return true;
    // Relative table alone is still "available" for planet-relative parent diffs
    return true;
  }
  return false;
}

function interpSeriesOnTable(table, series, timeSec) {
  const t0 = table.t0_sim;
  const step = table.step_sec;
  const n = table.n;
  const u = (timeSec - t0) / step;
  if (u < 0 || u > n - 1) return null;
  const i0 = Math.floor(u);
  const i1 = Math.min(n - 1, i0 + 1);
  const f = u - i0;
  if (n < 3 || i0 === i1) {
    const a = series[i0];
    const b = series[i1];
    return {
      x: a[0] + f * (b[0] - a[0]),
      y: a[1] + f * (b[1] - a[1]),
      z: a[2] + f * (b[2] - a[2]),
    };
  }
  const im1 = Math.max(0, i0 - 1);
  const i2 = Math.min(n - 1, i1 + 1);
  const p0 = series[im1];
  const p1 = series[i0];
  const p2 = series[i1];
  const p3 = series[i2];
  const f2 = f * f;
  const f3 = f2 * f;
  const h00 = 2 * f3 - 3 * f2 + 1;
  const h10 = f3 - 2 * f2 + f;
  const h01 = -2 * f3 + 3 * f2;
  const h11 = f3 - f2;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const m1 = 0.5 * (p2[k] - p0[k]);
    const m2 = 0.5 * (p3[k] - p1[k]);
    out[k] = h00 * p1[k] + h10 * m1 + h01 * p2[k] + h11 * m2;
  }
  return { x: out[0], y: out[1], z: out[2] };
}

/** Parent-relative moon position (AU) from moon sample table. */
export function sampleMoonRelativePosition3D(body, timeSec) {
  const mk = moonKey(body);
  if (!mk || !_moonTable?.bodies?.[mk] || !inWindow(_moonTable, timeSec)) return null;
  const series = _moonTable.bodies[mk].pos_au_parent_relative;
  if (!series) return null;
  return interpSeriesOnTable(_moonTable, series, timeSec);
}

export function samplePosition3D(body, timeSec) {
  const pk = bodyKey(body);
  if (pk && _table?.bodies?.[pk] && inWindow(_table, timeSec)) {
    return interpSeriesOnTable(_table, _table.bodies[pk].pos_au, timeSec);
  }
  // Moon: parent heliocentric sample + parent-relative moon sample
  const mk = moonKey(body);
  if (mk && _moonTable?.bodies?.[mk] && inWindow(_moonTable, timeSec)) {
    const rel = sampleMoonRelativePosition3D(body, timeSec);
    if (!rel) return null;
    const parentName = _moonTable.bodies[mk].parent;
    const parentBody = BODIES.find((b) => b.name.toLowerCase() === parentName);
    const parentKey = BODY_KEYS[parentName];
    let parentPos = null;
    if (parentKey && _table?.bodies?.[parentKey] && inWindow(_table, timeSec)) {
      parentPos = interpSeriesOnTable(_table, _table.bodies[parentKey].pos_au, timeSec);
    }
    if (!parentPos) return null; // need parent for heliocentric
    return {
      x: parentPos.x + rel.x,
      y: parentPos.y + rel.y,
      z: parentPos.z + rel.z,
      r: null,
      _moonSample: true,
      _parent: parentName,
    };
  }
  return null;
}

export function sampleVelocity3D(body, timeSec) {
  if (!sampleAvailable(body, timeSec)) return null;
  const step = (bodyKey(body) ? _table?.step_sec : _moonTable?.step_sec) || DAY;
  const dt = Math.min(0.1 * DAY, Math.max(3600, step * 0.15));
  const pa = samplePosition3D(body, timeSec - dt);
  const pb = samplePosition3D(body, timeSec + dt);
  if (!pa || !pb) {
    const p0 = samplePosition3D(body, timeSec);
    const p1 = samplePosition3D(body, timeSec + dt) || samplePosition3D(body, timeSec - dt);
    if (!p0 || !p1) return null;
    const s = samplePosition3D(body, timeSec + dt) ? 1 : -1;
    return [
      s * (p1.x - p0.x) * AU / dt,
      s * (p1.y - p0.y) * AU / dt,
      s * (p1.z - p0.z) * AU / dt,
    ];
  }
  return [
    (pb.x - pa.x) * AU / (2 * dt),
    (pb.y - pa.y) * AU / (2 * dt),
    (pb.z - pa.z) * AU / (2 * dt),
  ];
}

/** Prefer moon relative sample for planet-relative diffs when available. */
export function sampleMoonRelativeOrNull(body, timeSec) {
  return sampleMoonRelativePosition3D(body, timeSec);
}
