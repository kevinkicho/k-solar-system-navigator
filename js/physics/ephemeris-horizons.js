/**
 * Optional educational adapter for NASA/JPL Horizons HTTP API (VECTOR tables).
 *
 * ─── DISCLAIMER ─────────────────────────────────────────────────────────────
 * This is NOT SPICE. No .bsp kernels, no CK/SCLK, no covariance, no light-time
 * navigation solutions. It is an optional network fetch of a public Horizons
 * text table for classroom comparison against HELIOS approximate Kepler
 * positions. It is NOT required for trip planning, NOT suitable for flight
 * operations, and the default offline planning path never calls this module.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Default HELIOS ephemeris remains JPL "Approximate Positions of Major Planets"
 * (js/physics/kepler.js). Enable comparison only via explicit UI opt-in.
 */

import { AU } from '../constants.js';

/** Public Horizons API endpoint (text format). */
export const HORIZONS_API_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';

/**
 * Horizons major-body COMMAND codes (planet geometric centers).
 * Keys are HELIOS catalog ids / lowercase names.
 */
export const HORIZONS_BODY_COMMANDS = {
  mercury: '199',
  venus: '299',
  earth: '399',
  mars: '499',
  jupiter: '599',
  saturn: '699',
  uranus: '799',
  neptune: '899',
};

/**
 * Resolve a HELIOS body id/name to a Horizons COMMAND string, or null if
 * the body is not supported by this educational adapter (moons, NEOs, etc.).
 * @param {string|{id?:string,name?:string}} body
 * @returns {string|null}
 */
export function resolveHorizonsCommand(body) {
  if (body == null) return null;
  if (typeof body === 'object') {
    const id = (body.id || body.name || '').toString().toLowerCase().trim();
    return HORIZONS_BODY_COMMANDS[id] || null;
  }
  const key = String(body).toLowerCase().trim();
  return HORIZONS_BODY_COMMANDS[key] || null;
}

/**
 * Format an epoch as a Horizons calendar time string (UTC-style).
 * Accepts Date, ISO string, or epoch ms.
 * @param {Date|string|number} epoch
 * @returns {string}
 */
export function formatHorizonsEpoch(epoch) {
  const d = epoch instanceof Date ? epoch : new Date(epoch);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid Horizons epoch: ${epoch}`);
  }
  // Horizons accepts e.g. 2000-Jan-01 12:00
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const y = d.getUTCFullYear();
  const mon = months[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}-${mon}-${day} ${h}:${min}:${s}`;
}

/**
 * Build a Horizons VECTORS query URL (heliocentric ecliptic J2000, AU / day).
 * @param {{ body: string|{id?:string,name?:string}, epoch: Date|string|number }} opts
 * @returns {string}
 */
export function buildHorizonsVectorsUrl({ body, epoch }) {
  const command = resolveHorizonsCommand(body);
  if (!command) {
    throw new Error(`Body not supported by Horizons educational adapter: ${
      typeof body === 'object' ? (body.id || body.name) : body
    }`);
  }
  const t0 = formatHorizonsEpoch(epoch);
  // One-hour stop so STEP_SIZE produces a single usable row after SOE.
  const t1Date = epoch instanceof Date ? new Date(epoch.getTime()) : new Date(epoch);
  t1Date.setUTCHours(t1Date.getUTCHours() + 1);
  const t1 = formatHorizonsEpoch(t1Date);

  const params = new URLSearchParams({
    format: 'text',
    COMMAND: `'${command}'`,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: "'@0'",
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    OUT_UNITS: 'AU-D',
    VEC_TABLE: '2',
    VEC_LABELS: 'YES',
    VEC_CORR: 'NONE',
    CSV_FORMAT: 'NO',
    START_TIME: `'${t0}'`,
    STOP_TIME: `'${t1}'`,
    STEP_SIZE: "'1 h'",
  });
  return `${HORIZONS_API_URL}?${params.toString()}`;
}

/**
 * Parse a Horizons VECTORS plain-text payload ($$SOE … $$EOE block).
 * Supports labeled (X = … Y = …) and unlabeled space-separated rows.
 *
 * Positions are heliocentric ecliptic J2000 in AU (when OUT_UNITS=AU-D).
 * Does not interpret SPICE kernels or formal uncertainties.
 *
 * @param {string} text
 * @returns {{ x:number, y:number, z:number, vx?:number, vy?:number, vz?:number, jd?:number, rawLine?:string }}
 */
export function parseHorizonsVectors(text) {
  if (typeof text !== 'string' || !text.length) {
    throw new Error('parseHorizonsVectors: empty payload');
  }

  // JSON wrapper from format=json — extract result string if present.
  let payload = text;
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const j = JSON.parse(trimmed);
      if (j.error) throw new Error(`Horizons API error: ${j.error}`);
      if (typeof j.result === 'string') payload = j.result;
    } catch (e) {
      if (e.message && e.message.startsWith('Horizons API error')) throw e;
      // fall through — may still be plain text with a leading brace unlikely
    }
  }

  const soe = payload.indexOf('$$SOE');
  const eoe = payload.indexOf('$$EOE');
  if (soe < 0 || eoe < 0 || eoe <= soe) {
    throw new Error('parseHorizonsVectors: missing $$SOE/$$EOE block');
  }
  const block = payload.slice(soe + 5, eoe).trim();
  if (!block) throw new Error('parseHorizonsVectors: empty SOE block');

  // Labeled form: " X = 1.23E+00 Y =-4.5E-01 Z = …" possibly multi-line with VX/VY/VZ
  const labeled = block.match(
    /X\s*=\s*([+\-]?[\d.]+(?:[Ee][+\-]?\d+)?)\s+Y\s*=\s*([+\-]?[\d.]+(?:[Ee][+\-]?\d+)?)\s+Z\s*=\s*([+\-]?[\d.]+(?:[Ee][+\-]?\d+)?)/
  );
  if (labeled) {
    const out = {
      x: Number(labeled[1]),
      y: Number(labeled[2]),
      z: Number(labeled[3]),
      rawLine: labeled[0],
    };
    const vel = block.match(
      /VX\s*=\s*([+\-]?[\d.]+(?:[Ee][+\-]?\d+)?)\s+VY\s*=\s*([+\-]?[\d.]+(?:[Ee][+\-]?\d+)?)\s+VZ\s*=\s*([+\-]?[\d.]+(?:[Ee][+\-]?\d+)?)/
    );
    if (vel) {
      out.vx = Number(vel[1]);
      out.vy = Number(vel[2]);
      out.vz = Number(vel[3]);
    }
    const jdMatch = block.match(/(\d{7}\.\d+)/);
    if (jdMatch) out.jd = Number(jdMatch[1]);
    if (![out.x, out.y, out.z].every(Number.isFinite)) {
      throw new Error('parseHorizonsVectors: non-finite labeled coordinates');
    }
    return out;
  }

  // Unlabeled / CSV-ish: first data line with ≥3 floats after optional JD
  const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Skip pure calendar annotation lines without enough numbers
    const nums = line.match(/[+\-]?[\d.]+(?:[Ee][+\-]?\d+)?/g);
    if (!nums || nums.length < 3) continue;
    // Prefer lines that look like vector rows (often start with JD)
    let x, y, z, vx, vy, vz, jd;
    if (nums.length >= 7 && Number(nums[0]) > 1e6) {
      // JD X Y Z VX VY VZ
      jd = Number(nums[0]);
      x = Number(nums[1]); y = Number(nums[2]); z = Number(nums[3]);
      vx = Number(nums[4]); vy = Number(nums[5]); vz = Number(nums[6]);
    } else if (nums.length >= 3) {
      // Maybe "JD = …" on previous line; take first 3 as X Y Z
      const start = nums.length >= 4 && Number(nums[0]) > 1e6 ? 1 : 0;
      x = Number(nums[start]); y = Number(nums[start + 1]); z = Number(nums[start + 2]);
      if (nums.length >= start + 6) {
        vx = Number(nums[start + 3]);
        vy = Number(nums[start + 4]);
        vz = Number(nums[start + 5]);
      }
      if (start === 1) jd = Number(nums[0]);
    }
    if ([x, y, z].every(Number.isFinite)) {
      const out = { x, y, z, rawLine: line };
      if (jd != null) out.jd = jd;
      if ([vx, vy, vz].every(Number.isFinite)) {
        out.vx = vx; out.vy = vy; out.vz = vz;
      }
      return out;
    }
  }

  throw new Error('parseHorizonsVectors: could not extract XYZ from SOE block');
}

/**
 * Fetch a single heliocentric ecliptic state from Horizons.
 * Inject `fetchImpl` for unit tests (mocked; CI never hits the network).
 *
 * @param {{
 *   body: string|{id?:string,name?:string},
 *   epoch: Date|string|number,
 *   fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Promise<{ x:number, y:number, z:number, vx?:number, vy?:number, vz?:number, jd?:number, url:string }>}
 */
export async function fetchHorizonsState({ body, epoch, fetchImpl }) {
  const impl = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (typeof impl !== 'function') {
    throw new Error('fetchHorizonsState: no fetchImpl available');
  }
  const url = buildHorizonsVectorsUrl({ body, epoch });
  const res = await impl(url);
  if (!res || typeof res.text !== 'function') {
    throw new Error('fetchHorizonsState: fetchImpl returned a non-Response');
  }
  if (res.ok === false) {
    throw new Error(`fetchHorizonsState: HTTP ${res.status}`);
  }
  const text = await res.text();
  const state = parseHorizonsVectors(text);
  return { ...state, url };
}

/**
 * Euclidean distance between Horizons and approximate Kepler positions (AU).
 * Both inputs must be heliocentric ecliptic J2000 in AU with fields {x,y,z}.
 * HELIOS scene coordinates use Y↔Z swap vs ecliptic; convert before calling
 * (see scenePosToEcliptic).
 *
 * @param {{x:number,y:number,z:number}} horizonsPos
 * @param {{x:number,y:number,z:number}} keplerPos
 * @returns {{ distanceAU:number, distanceKm:number, dx:number, dy:number, dz:number }}
 */
export function compareToApprox(horizonsPos, keplerPos) {
  if (!horizonsPos || !keplerPos) {
    throw new Error('compareToApprox: missing position');
  }
  const dx = Number(horizonsPos.x) - Number(keplerPos.x);
  const dy = Number(horizonsPos.y) - Number(keplerPos.y);
  const dz = Number(horizonsPos.z) - Number(keplerPos.z);
  if (![dx, dy, dz].every(Number.isFinite)) {
    throw new Error('compareToApprox: non-finite coordinates');
  }
  const distanceAU = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return {
    distanceAU,
    distanceKm: distanceAU * AU / 1000,
    dx, dy, dz,
  };
}

/**
 * Convert HELIOS scene position (kepler.getBodyPosition3D) to ecliptic AU:
 * scene {x,y,z} = ecliptic {X, Z, Y}.
 * @param {{x:number,y:number,z:number}} scenePos
 * @returns {{x:number,y:number,z:number}}
 */
export function scenePosToEcliptic(scenePos) {
  return {
    x: scenePos.x,
    y: scenePos.z,
    z: scenePos.y,
  };
}

/**
 * Opt-in gate: when `optedIn` is false, never call fetch (zero network).
 * Used by UI and unit tests to prove the offline planning path is untouched.
 *
 * @param {{
 *   optedIn: boolean,
 *   body: string|{id?:string,name?:string},
 *   epoch: Date|string|number,
 *   keplerPos: {x:number,y:number,z:number},
 *   fetchImpl?: typeof fetch,
 *   sceneCoords?: boolean,
 * }} opts
 * @returns {Promise<
 *   | { skipped: true, reason: string }
 *   | { skipped: false, horizons: object, comparison: ReturnType<typeof compareToApprox> }
 * >}
 */
export async function compareBodyIfOptedIn({
  optedIn,
  body,
  epoch,
  keplerPos,
  fetchImpl,
  sceneCoords = true,
}) {
  if (!optedIn) {
    return { skipped: true, reason: 'opt-in off' };
  }
  if (!resolveHorizonsCommand(body)) {
    return { skipped: true, reason: 'body not supported' };
  }
  const horizons = await fetchHorizonsState({ body, epoch, fetchImpl });
  const approx = sceneCoords ? scenePosToEcliptic(keplerPos) : keplerPos;
  const comparison = compareToApprox(horizons, approx);
  return { skipped: false, horizons, comparison };
}
