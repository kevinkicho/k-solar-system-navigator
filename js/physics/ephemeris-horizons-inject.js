/**
 * Optional live Horizons endpoint inject for planning (L2-horizons class).
 *
 * Opt-in only — default offline path never networks without user action.
 * Injected states are converted to HELIOS *scene* axes (Y↔Z swap vs ecliptic)
 * so they plug into getPlanningPosition3D / Lambert like sample-DE.
 *
 * NOT SPICE. NOT flight ops. Analysis-grade endpoint replacement only.
 */

import { J2000 } from '../constants.js';
import {
  fetchHorizonsState,
  resolveHorizonsCommand,
  eclipticPosToScene,
  eclipticVelToScene_m_s,
} from './ephemeris-horizons.js';

/** @type {Map<string, { x:number,y:number,z:number, v?:number[], at:number }>} */
const _cache = new Map();

function bodyKey(body) {
  if (!body) return null;
  return (typeof body === 'string' ? body : (body.id || body.name || '')).toLowerCase().trim();
}

function cacheKey(body, timeSec) {
  // 1-hour bucket — enough for dep/arr Lambert knots
  const bucket = Math.round(timeSec / 3600);
  return `${bodyKey(body)}|${bucket}`;
}

export function clearHorizonsInjectCache() {
  _cache.clear();
}

export function getHorizonsInjected(body, timeSec) {
  const k = cacheKey(body, timeSec);
  return _cache.get(k) || null;
}

/**
 * Convert JD or sim time to Date for Horizons epoch.
 * @param {number} timeSec HELIOS sim seconds since J2000
 */
export function simTimeToDateUTC(timeSec) {
  return new Date(J2000 + timeSec * 1000);
}

/**
 * Fetch and cache Horizons state for one body@time (scene axes).
 * @returns {Promise<object|null>}
 */
export async function injectHorizonsEndpoint({ body, timeSec, fetchImpl }) {
  if (!resolveHorizonsCommand(body)) return null;
  const k = cacheKey(body, timeSec);
  if (_cache.has(k)) return _cache.get(k);

  const epoch = simTimeToDateUTC(timeSec);
  const raw = await fetchHorizonsState({ body, epoch, fetchImpl });
  // Horizons: ecliptic AU / AU-day → HELIOS scene AU / m/s
  const pos = eclipticPosToScene(raw);
  let v = null;
  if (raw.vx != null && raw.vy != null && raw.vz != null) {
    v = eclipticVelToScene_m_s(raw);
  }
  const entry = {
    x: pos.x, y: pos.y, z: pos.z,
    v,
    at: Date.now(),
    source: 'horizons-inject',
    jd: raw.jd,
  };
  _cache.set(k, entry);
  return entry;
}

/**
 * Inject dep/arr (and optional multi-leg) endpoint states.
 * @param {Array<{ body: object, timeSec: number }>} endpoints
 * @param {{ fetchImpl?: Function, onProgress?: (i:number,n:number)=>void }} [opts]
 * @returns {Promise<{ ok: number, fail: number, errors: string[] }>}
 */
export async function injectHorizonsEndpoints(endpoints, opts = {}) {
  const list = (endpoints || []).filter((e) => e?.body && e.timeSec != null);
  let ok = 0;
  let fail = 0;
  const errors = [];
  for (let i = 0; i < list.length; i++) {
    const { body, timeSec } = list[i];
    try {
      opts.onProgress?.(i + 1, list.length);
      const hit = await injectHorizonsEndpoint({
        body, timeSec, fetchImpl: opts.fetchImpl,
      });
      if (hit) ok++;
      else fail++;
    } catch (err) {
      fail++;
      errors.push(`${bodyKey(body)}: ${err?.message || err}`);
    }
  }
  return { ok, fail, errors };
}

