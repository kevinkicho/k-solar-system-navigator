/**
 * Surface points in planetocentric spherical coordinates → HELIOS heliocentric
 * positions for concept-grade trip planning.
 *
 * Convention (planetocentric):
 *   lat ∈ [-90, 90] deg  (north positive)
 *   lon ∈ [-180, 180] deg (east positive; 0 = prime meridian)
 *   alt ≥ 0 m above mean spherical radius body.radius
 *
 * Orientation model (educational, not IAU WGPSN full / SPICE):
 *   body-fixed → ecliptic via Rz(W) · Rx(obliquity)
 *   W = W0 + 360°/P · t  (sidereal; t from J2000)
 *   Pole is tipped from ecliptic north by `obliquity` about +X.
 *
 * HELIOS scene axes (from kepler.js): x = ecliptic X, y = ecliptic Z (out of
 * plane), z = ecliptic Y.
 *
 * Not flight ops. Surface offset is ~R_body (thousands of km) on AU-scale
 * transfers — mainly refines V∞-relative surface velocity and documents the
 * intended site for Need / parking altitude.
 */

import { AU, DAY, DEG, TWO_PI } from '../constants.js';
import { PLANET_PHYS_EXTRA } from '../data/body-phys-registry.js';
import { v3add, v3cross, v3mag, v3scale } from './vec3.js';

/** Default empty surface point (disabled). */
export function emptySurfacePoint() {
  return {
    enabled: false,
    lat_deg: 0,
    lon_deg: 0,
    alt_m: 100e3, // default 100 km parking-class altitude
  };
}

export function cloneSurfacePoint(p) {
  if (!p) return emptySurfacePoint();
  return {
    enabled: !!p.enabled,
    lat_deg: Number(p.lat_deg) || 0,
    lon_deg: Number(p.lon_deg) || 0,
    alt_m: Number.isFinite(Number(p.alt_m)) ? Number(p.alt_m) : 100e3,
  };
}

export function isSurfacePointActive(p) {
  return !!(p && p.enabled && Number.isFinite(p.lat_deg) && Number.isFinite(p.lon_deg));
}

export function formatSurfacePointShort(p) {
  if (!isSurfacePointActive(p)) return '';
  const ns = p.lat_deg >= 0 ? 'N' : 'S';
  const ew = p.lon_deg >= 0 ? 'E' : 'W';
  const altKm = (p.alt_m / 1000).toFixed(p.alt_m >= 1000 ? 0 : 1);
  return `${Math.abs(p.lat_deg).toFixed(2)}°${ns} ${Math.abs(p.lon_deg).toFixed(2)}°${ew} · h=${altKm} km`;
}

/**
 * Famous educational site presets (not certified coordinates).
 * lat/lon approx; alt is parking-class for launch / entry sketches.
 */
export const SURFACE_PRESETS = [
  { id: 'cape', body: 'Earth', label: 'Cape Canaveral class', lat_deg: 28.5, lon_deg: -80.6, alt_m: 200e3 },
  { id: 'vandenberg', body: 'Earth', label: 'Vandenberg class', lat_deg: 34.7, lon_deg: -120.6, alt_m: 200e3 },
  { id: 'kourou', body: 'Earth', label: 'Kourou class', lat_deg: 5.2, lon_deg: -52.8, alt_m: 200e3 },
  { id: 'baikonur', body: 'Earth', label: 'Baikonur class', lat_deg: 45.6, lon_deg: 63.3, alt_m: 200e3 },
  { id: 'jezero', body: 'Mars', label: 'Jezero crater', lat_deg: 18.4, lon_deg: 77.5, alt_m: 100e3 },
  { id: 'olympus', body: 'Mars', label: 'Olympus Mons region', lat_deg: 18.65, lon_deg: -133.8, alt_m: 100e3 },
  { id: 'valles', body: 'Mars', label: 'Valles Marineris', lat_deg: -14, lon_deg: -59, alt_m: 100e3 },
  { id: 'apollo11', body: 'Moon', label: 'Apollo 11 (Mare Tranquillitatis)', lat_deg: 0.67, lon_deg: 23.47, alt_m: 50e3 },
  { id: 'shackleton', body: 'Moon', label: 'Shackleton (S. pole)', lat_deg: -89.9, lon_deg: 0, alt_m: 50e3 },
  { id: 'equator0', body: '*', label: 'Equator / prime meridian', lat_deg: 0, lon_deg: 0, alt_m: 100e3 },
  { id: 'northpole', body: '*', label: 'North pole', lat_deg: 90, lon_deg: 0, alt_m: 100e3 },
  { id: 'southpole', body: '*', label: 'South pole', lat_deg: -90, lon_deg: 0, alt_m: 100e3 },
];

export function presetsForBody(body) {
  if (!body) return SURFACE_PRESETS.filter((p) => p.body === '*');
  const name = body.name;
  return SURFACE_PRESETS.filter((p) => p.body === name || p.body === '*');
}

/**
 * Spin / pole model. Values are concept-grade means (not full IAU series).
 * period_d from JPL SSD phys_par when available (negative = retrograde).
 */
export function getSpinModel(body) {
  const extra = PLANET_PHYS_EXTRA[body?.name];
  const period_d = extra?.siderealRotation_d
    ?? (body?.period ? body.period / DAY : 1); // moons: use orbital period as rough lock proxy only if no spin
  // Approximate obliquities to the ecliptic (deg). Educational constants.
  const OBLIQ = {
    Mercury: 0.034, Venus: 177.4, Earth: 23.439, Mars: 25.19,
    Jupiter: 3.13, Saturn: 26.73, Uranus: 97.77, Neptune: 28.32,
    Moon: 6.68, Pluto: 119.6, Ceres: 4, Eris: 0, Haumea: 0, Makemake: 0,
  };
  const W0 = {
    // Arbitrary educational zeros except Earth-ish
    Earth: 280.0, Mars: 0, Moon: 0,
  };
  return {
    period_d: period_d || 1,
    obliquity_deg: OBLIQ[body?.name] ?? 0,
    W0_deg: W0[body?.name] ?? 0,
    source: 'concept-grade spin (SSD period + mean obliquity table)',
  };
}

/** Body-fixed cartesian meters: x→(0,0), z→north. */
export function surfaceBodyFixedMeters(body, lat_deg, lon_deg, alt_m = 0) {
  const R = (body.radius || 0) + (alt_m || 0);
  const lat = lat_deg * DEG;
  const lon = lon_deg * DEG;
  const cl = Math.cos(lat);
  return [
    R * cl * Math.cos(lon),
    R * cl * Math.sin(lon),
    R * Math.sin(lat),
  ];
}

function matMulVec(M, v) {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
}

function Rz(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}
function Rx(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
}
function matMul(A, B) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    }
  }
  return C;
}

/**
 * Rotation matrix body-fixed → standard ecliptic (X,Y,Z).
 * R = Rx(obliquity) · Rz(W)
 */
export function bodyToEclipticMatrix(body, timeSec) {
  const spin = getSpinModel(body);
  const days = timeSec / DAY;
  const period = spin.period_d || 1;
  // Signed period: negative → retrograde spin (W decreases)
  const rate_deg_per_d = 360 / period;
  let W = spin.W0_deg + rate_deg_per_d * days;
  W = ((W % 360) + 360) % 360;
  const Wrad = W * DEG;
  const obl = spin.obliquity_deg * DEG;
  return matMul(Rx(obl), Rz(Wrad));
}

/** Standard ecliptic meters → HELIOS scene AU object. */
function eclipticMetersToSceneAU(m) {
  return {
    x: m[0] / AU,
    y: m[2] / AU, // ecliptic Z → scene y
    z: m[1] / AU, // ecliptic Y → scene z
  };
}

function sceneAUToEclipticMeters(p) {
  return [p.x * AU, p.z * AU, p.y * AU];
}

/**
 * Surface offset in HELIOS scene AU (to add to body-center position).
 */
export function surfaceOffsetSceneAU(body, timeSec, point) {
  if (!isSurfacePointActive(point) || !body?.radius) {
    return { x: 0, y: 0, z: 0 };
  }
  const bf = surfaceBodyFixedMeters(body, point.lat_deg, point.lon_deg, point.alt_m);
  const R = bodyToEclipticMatrix(body, timeSec);
  const ecl = matMulVec(R, bf);
  return eclipticMetersToSceneAU(ecl);
}

/**
 * Surface inertial velocity contribution ω × r in HELIOS scene m/s.
 * ω aligned with body pole (column 2 of body→ecliptic for body-fixed z-hat).
 */
export function surfaceVelocitySceneMps(body, timeSec, point) {
  if (!isSurfacePointActive(point) || !body?.radius) return [0, 0, 0];
  const spin = getSpinModel(body);
  const period_s = Math.abs(spin.period_d) * DAY;
  if (!(period_s > 0)) return [0, 0, 0];
  const omegaMag = (TWO_PI / period_s) * Math.sign(spin.period_d || 1);
  // body-fixed z-hat → ecliptic
  const R = bodyToEclipticMatrix(body, timeSec);
  const poleEcl = matMulVec(R, [0, 0, 1]); // ecliptic XYZ
  const omegaEcl = v3scale(poleEcl, omegaMag);
  const bf = surfaceBodyFixedMeters(body, point.lat_deg, point.lon_deg, point.alt_m);
  const rEcl = matMulVec(R, bf);
  const vEcl = v3cross(omegaEcl, rEcl); // m/s in ecliptic XYZ
  // Convert to scene m/s: scene [vx,vy,vz] with y=ecl Z, z=ecl Y
  return [vEcl[0], vEcl[2], vEcl[1]];
}

/**
 * Combine body-center state with optional surface point.
 * @param {{x,y,z,r?}} posAU body center (scene AU)
 * @param {number[]} velMps body center velocity scene m/s
 * @param {object} body
 * @param {number} timeSec
 * @param {object|null} point
 * @returns {{ pos, vel, surfaceActive, offset_m }}
 */
export function applySurfaceEndpoint(posAU, velMps, body, timeSec, point) {
  if (!isSurfacePointActive(point) || !body) {
    return {
      pos: posAU,
      vel: velMps,
      surfaceActive: false,
      offset_m: 0,
    };
  }
  const off = surfaceOffsetSceneAU(body, timeSec, point);
  const vSurf = surfaceVelocitySceneMps(body, timeSec, point);
  const x = posAU.x + off.x;
  const y = posAU.y + off.y;
  const z = posAU.z + off.z;
  const r = Math.sqrt(x * x + y * y + z * z);
  const pos = { ...posAU, x, y, z, r };
  const vel = v3add(velMps || [0, 0, 0], vSurf);
  const offset_m = v3mag(sceneAUToEclipticMeters(off));
  return { pos, vel, surfaceActive: true, offset_m, offsetAU: off };
}

export function surfacePointMeta(body, point) {
  if (!isSurfacePointActive(point) || !body) return null;
  return {
    body: body.name,
    bodyId: body.id || null,
    lat_deg: point.lat_deg,
    lon_deg: point.lon_deg,
    alt_m: point.alt_m,
    label: formatSurfacePointShort(point),
    model: 'planetocentric spherical + concept-grade spin (not SPICE)',
  };
}

/** Clamp user inputs to valid spherical ranges. */
export function normalizeSurfacePoint(p) {
  const out = cloneSurfacePoint(p);
  out.lat_deg = Math.max(-90, Math.min(90, out.lat_deg));
  // wrap lon to [-180, 180]
  let lon = out.lon_deg;
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  out.lon_deg = lon;
  out.alt_m = Math.max(0, Math.min(5e7, out.alt_m)); // 0 … 50,000 km
  return out;
}
