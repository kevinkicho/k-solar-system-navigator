/**
 * Surface / atmospheric reference points in planetocentric spherical coords →
 * HELIOS heliocentric positions for concept-grade trip planning.
 *
 * Works for rocky bodies AND gas/ice giants:
 *   - Rocky: mean spherical radius ≈ solid surface.
 *   - Gas/ice giants: body.radius is the educational 1-bar / cloud-deck
 *     reference sphere (no solid surface). Lat/lon pick a cloud-deck
 *     longitude band; alt is height above that 1-bar sphere (parking /
 *     probe class), not "ground level".
 *
 * Convention (planetocentric):
 *   lat ∈ [-90, 90] deg  (north positive)
 *   lon ∈ [-180, 180] deg (east positive; 0 = prime meridian)
 *   alt ≥ 0 m above reference sphere body.radius
 *
 * Orientation model (educational, not IAU WGPSN full / SPICE):
 *   body-fixed → ecliptic via Rz(W) · Rx(obliquity)
 *   W = W0 + 360°/P · t  (sidereal; t from J2000)
 *
 * Not flight ops. Not atmospheric entry guidance.
 */

import { AU, DAY, DEG, TWO_PI } from '../constants.js';
import { PLANET_PHYS_EXTRA } from '../data/body-phys-registry.js';
import { v3add, v3cross, v3mag, v3scale } from './vec3.js';

/**
 * Reference-sphere kind for a body.
 * @returns {'solid'|'gas-giant'|'ice-giant'|'thick-atmosphere'|'unknown'}
 */
export function bodySurfaceKind(body) {
  if (!body) return 'unknown';
  if (body.parent) return 'solid'; // moons treated as solid for parking sketches
  switch (body.name) {
    case 'Jupiter':
    case 'Saturn':
      return 'gas-giant';
    case 'Uranus':
    case 'Neptune':
      return 'ice-giant';
    case 'Venus':
      return 'thick-atmosphere';
    default:
      return 'solid';
  }
}

export function isFluidGiant(body) {
  const k = bodySurfaceKind(body);
  return k === 'gas-giant' || k === 'ice-giant';
}

/**
 * Default parking / probe altitude above the reference sphere (m).
 * Gas giants: stay well above 1-bar (cloud tops / radiation-aware educational band).
 */
export function defaultParkingAlt_m(body) {
  const kind = bodySurfaceKind(body);
  if (kind === 'gas-giant') {
    // Jupiter/Saturn: educational high probe parking ~2000–5000 km above 1-bar
    if (body?.name === 'Jupiter') return 4000e3;
    if (body?.name === 'Saturn') return 3000e3;
    return 2500e3;
  }
  if (kind === 'ice-giant') return 1500e3;
  if (kind === 'thick-atmosphere') return 300e3; // above dense Venus cloud deck class
  if (body?.parent) return 50e3;
  return 100e3;
}

/**
 * Canonical HELIOS geographic coordinate system id (IAU-style planetocentric).
 * UI: lat / lon / height above reference; math: planetocentric spherical (φ,λ,r).
 */
export const COORD_SYSTEM_ID = 'planetocentric+eastlon+h_above_ref';

/**
 * Longitude system for body-fixed meridians (educational labels).
 * Gas/ice giants: System III magnetic-field clock (IAU W for giants).
 * Rocky: geographic / cartographic prime meridian.
 */
export function longitudeSystem(body) {
  if (!body) return { id: 'geographic', label: 'Geographic (east lon)' };
  if (isFluidGiant(body)) {
    return {
      id: 'system-III',
      label: 'System III (magnetic / IAU-class · educational)',
      note: 'Giant-planet longitudes use a System III–class clock; not cloud-belt System I/II.',
    };
  }
  if (body.name === 'Earth') {
    return { id: 'geographic', label: 'Geographic east lon (Greenwich-class)' };
  }
  return { id: 'geographic', label: 'Planetocentric east lon (cartographic prime meridian)' };
}

/** Compact badge for UI (coordinate system strip). */
export function coordinateSystemBadge(body) {
  const kind = bodySurfaceKind(body);
  const lon = longitudeSystem(body);
  if (kind === 'gas-giant' || kind === 'ice-giant') {
    return {
      short: 'Planetocentric · east lon · 1-bar · h',
      full: `Planetocentric geographic (lat/lon east-positive) · height above 1-bar cloud deck · ${lon.label} · concept-grade (not SPICE)`,
      id: COORD_SYSTEM_ID,
      longitudeSystem: lon.id,
      reference: '1-bar',
    };
  }
  if (kind === 'thick-atmosphere') {
    return {
      short: 'Planetocentric · east lon · mean R · h',
      full: 'Planetocentric geographic · height above mean radius (thick atmosphere) · concept-grade',
      id: COORD_SYSTEM_ID,
      longitudeSystem: lon.id,
      reference: 'mean-radius',
    };
  }
  return {
    short: 'Planetocentric · east lon · mean R · h',
    full: 'Planetocentric geographic (lat/lon east-positive) · height above mean spherical radius · concept-grade (not SPICE / not WGS84 ops)',
    id: COORD_SYSTEM_ID,
    longitudeSystem: lon.id,
    reference: 'mean-radius',
  };
}

/** Human-readable reference sphere note for UI. */
export function referenceSphereLabel(body) {
  const badge = coordinateSystemBadge(body);
  return badge.full;
}

export function altitudeFieldLabel(body) {
  return isFluidGiant(body)
    ? 'Altitude (km above 1-bar reference)'
    : 'Altitude (km above mean radius)';
}

export function surfacePanelTitle(body, role = 'origin') {
  const who = role === 'dest' ? 'Destination' : 'Origin';
  if (isFluidGiant(body)) {
    return `${who} geographic site · lat / lon / alt (1-bar)`;
  }
  return `${who} geographic site · lat / lon / alt`;
}

/** Reference sphere radius (m) used for h → r conversion. */
export function referenceRadius_m(body) {
  return body?.radius || 0;
}

/**
 * Planetocentric radius from center (m): r = R_ref + h.
 * Primary physics third coordinate; altitude h is the practical UI field.
 */
export function planetocentricRadius_m(body, alt_m = 0) {
  return referenceRadius_m(body) + (Number(alt_m) || 0);
}

export function formatRadiusFromCenter(body, alt_m) {
  const r = planetocentricRadius_m(body, alt_m);
  if (!(r > 0)) return '—';
  if (r >= 1e6) return `${(r / 1000).toFixed(0)} km from center`;
  return `${(r / 1000).toFixed(1)} km from center`;
}

/** Default empty surface point (disabled). Body-aware parking default. */
export function emptySurfacePoint(body = null) {
  return {
    enabled: false,
    lat_deg: 0,
    lon_deg: 0,
    alt_m: defaultParkingAlt_m(body),
  };
}

/**
 * Body-aware default point — for fluid giants, enabled at equator with
 * high parking so trip planning has an explicit spherical endpoint.
 * Rocky bodies stay opt-in (enabled: false).
 */
export function defaultSurfacePointForBody(body) {
  const base = emptySurfacePoint(body);
  if (!body) return base;
  if (isFluidGiant(body)) {
    return {
      ...base,
      enabled: true,
      lat_deg: 0,
      lon_deg: 0,
      alt_m: defaultParkingAlt_m(body),
    };
  }
  return base;
}

export function cloneSurfacePoint(p, body = null) {
  if (!p) return emptySurfacePoint(body);
  return {
    enabled: !!p.enabled,
    lat_deg: Number(p.lat_deg) || 0,
    lon_deg: Number(p.lon_deg) || 0,
    alt_m: Number.isFinite(Number(p.alt_m))
      ? Number(p.alt_m)
      : defaultParkingAlt_m(body),
  };
}

export function isSurfacePointActive(p) {
  return !!(p && p.enabled && Number.isFinite(p.lat_deg) && Number.isFinite(p.lon_deg));
}

export function formatSurfacePointShort(p, body = null) {
  if (!isSurfacePointActive(p)) return '';
  const ns = p.lat_deg >= 0 ? 'N' : 'S';
  const ew = p.lon_deg >= 0 ? 'E' : 'W';
  const altKm = (p.alt_m / 1000).toFixed(p.alt_m >= 1000 ? 0 : 1);
  const ref = isFluidGiant(body) ? '1-bar+' : 'h';
  return `${Math.abs(p.lat_deg).toFixed(2)}°${ns} ${Math.abs(p.lon_deg).toFixed(2)}°${ew} · ${ref}${altKm} km`;
}

/** Lon in [0, 360) east for dossiers that prefer 0–360. */
export function lonEast_0_360(lon_deg) {
  let L = Number(lon_deg) || 0;
  L = ((L % 360) + 360) % 360;
  return L;
}

/**
 * Famous educational site presets (not certified coordinates).
 * Fluid-giant alts are above the 1-bar reference sphere.
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
  // Gas / ice giants — cloud-deck longitude bands (educational)
  { id: 'jup-eq', body: 'Jupiter', label: 'Jupiter equator · high probe parking', lat_deg: 0, lon_deg: 0, alt_m: 4000e3 },
  { id: 'jup-grs', body: 'Jupiter', label: 'Great Red Spot latitude band', lat_deg: -22, lon_deg: 0, alt_m: 4000e3 },
  { id: 'jup-n', body: 'Jupiter', label: 'Jupiter north temperate', lat_deg: 30, lon_deg: 0, alt_m: 4000e3 },
  { id: 'sat-eq', body: 'Saturn', label: 'Saturn equator · high probe parking', lat_deg: 0, lon_deg: 0, alt_m: 3000e3 },
  { id: 'sat-hex', body: 'Saturn', label: 'Saturn N. polar hexagon band', lat_deg: 78, lon_deg: 0, alt_m: 3000e3 },
  { id: 'ura-eq', body: 'Uranus', label: 'Uranus equator (extreme tilt)', lat_deg: 0, lon_deg: 0, alt_m: 1500e3 },
  { id: 'nep-eq', body: 'Neptune', label: 'Neptune equator · high probe parking', lat_deg: 0, lon_deg: 0, alt_m: 1500e3 },
  { id: 'nep-ds2', body: 'Neptune', label: 'Great Dark Spot latitude class', lat_deg: -20, lon_deg: 0, alt_m: 1500e3 },
  // Generic — alt filled dynamically via presetsForBody
  { id: 'equator0', body: '*', label: 'Equator / prime meridian', lat_deg: 0, lon_deg: 0, alt_m: null },
  { id: 'northpole', body: '*', label: 'North pole', lat_deg: 90, lon_deg: 0, alt_m: null },
  { id: 'southpole', body: '*', label: 'South pole', lat_deg: -90, lon_deg: 0, alt_m: null },
];

export function presetsForBody(body) {
  if (!body) {
    return SURFACE_PRESETS.filter((p) => p.body === '*').map((p) => ({
      ...p,
      alt_m: p.alt_m ?? 100e3,
    }));
  }
  const name = body.name;
  const defAlt = defaultParkingAlt_m(body);
  return SURFACE_PRESETS
    .filter((p) => p.body === name || p.body === '*')
    .map((p) => ({
      ...p,
      alt_m: p.alt_m != null ? p.alt_m : defAlt,
    }));
}

/**
 * Compact IAU-class mean spin table (educational).
 * period_d: sidereal rotation (negative = retrograde). Prefer SSD phys_par when present.
 * W0_deg: educational prime-meridian phase at J2000 (not full IAU polynomial).
 * obliquity_deg: mean ecliptic obliquity of spin axis.
 * Source class: Archinal et al. / SSD phys_par order-of-magnitude; not SPICE PCK.
 */
export const IAU_CLASS_SPIN = {
  Mercury: { period_d: 58.6462, W0_deg: 329.5469, obliquity_deg: 0.034 },
  Venus: { period_d: -243.018, W0_deg: 160.20, obliquity_deg: 177.36 },
  Earth: { period_d: 0.99726968, W0_deg: 190.147, obliquity_deg: 23.439 },
  Mars: { period_d: 1.02595676, W0_deg: 176.630, obliquity_deg: 25.19 },
  Jupiter: { period_d: 0.41354, W0_deg: 284.95, obliquity_deg: 3.13 }, // System III class
  Saturn: { period_d: 0.44401, W0_deg: 38.90, obliquity_deg: 26.73 },
  Uranus: { period_d: -0.71833, W0_deg: 203.81, obliquity_deg: 97.77 },
  Neptune: { period_d: 0.67125, W0_deg: 253.18, obliquity_deg: 28.32 },
  Moon: { period_d: 27.321661, W0_deg: 38.3213, obliquity_deg: 6.68 },
  Pluto: { period_d: -6.3872, W0_deg: 302.695, obliquity_deg: 119.6 },
  Ceres: { period_d: 0.37809042, W0_deg: 0, obliquity_deg: 4 },
  Eris: { period_d: 1.079, W0_deg: 0, obliquity_deg: 0 },
  Haumea: { period_d: 0.1631, W0_deg: 0, obliquity_deg: 0 },
  Makemake: { period_d: 0.937, W0_deg: 0, obliquity_deg: 0 },
};

/**
 * Spin / pole model. Values are concept-grade means (not full IAU series / SPICE).
 * period_d from JPL SSD phys_par when available (negative = retrograde).
 */
export function getSpinModel(body) {
  const name = body?.name;
  const table = (name && IAU_CLASS_SPIN[name]) || null;
  const extra = PLANET_PHYS_EXTRA[name];
  const period_d = extra?.siderealRotation_d
    ?? table?.period_d
    ?? (body?.period ? body.period / DAY : 1);
  return {
    period_d: period_d || 1,
    obliquity_deg: table?.obliquity_deg ?? 0,
    W0_deg: table?.W0_deg ?? 0,
    source: table
      ? 'IAU-class mean spin table + SSD period when present (not full WGCCRE / not SPICE PCK)'
      : 'concept-grade spin fallback',
    iau_class_table: !!table,
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
  const kind = bodySurfaceKind(body);
  const badge = coordinateSystemBadge(body);
  const lonSys = longitudeSystem(body);
  const r_m = planetocentricRadius_m(body, point.alt_m);
  return {
    body: body.name,
    bodyId: body.id || null,
    lat_deg: point.lat_deg,
    lon_deg: point.lon_deg,
    lon_east_0_360: lonEast_0_360(point.lon_deg),
    alt_m: point.alt_m,
    radius_from_center_m: r_m,
    radius_from_center_km: r_m / 1000,
    reference_radius_m: referenceRadius_m(body),
    label: formatSurfacePointShort(point, body),
    surfaceKind: kind,
    referenceSphere: badge.reference,
    coordinateSystem: badge.id,
    coordinateSystemLabel: badge.short,
    longitudeSystem: lonSys.id,
    longitudeSystemLabel: lonSys.label,
    latitudeConvention: 'planetocentric',
    longitudeConvention: 'east-positive',
    model: isFluidGiant(body)
      ? 'Geographic (planetocentric lat/lon + h above 1-bar) · concept-grade spin · no solid surface · not SPICE'
      : 'Geographic (planetocentric lat/lon + h above mean radius) · concept-grade spin · not SPICE / not WGS84 ops',
  };
}

/** Full geographic endpoint package for plan dossier (null if inactive). */
export function geographicEndpointPackage(body, point) {
  const meta = surfacePointMeta(body, point);
  if (!meta) {
    return {
      active: false,
      coordinateSystem: COORD_SYSTEM_ID,
      body: body?.name || null,
      note: 'Body-center endpoint (no geographic site)',
    };
  }
  return { active: true, ...meta };
}

/** Clamp user inputs to valid spherical ranges. */
export function normalizeSurfacePoint(p, body = null) {
  const out = cloneSurfacePoint(p, body);
  out.lat_deg = Math.max(-90, Math.min(90, out.lat_deg));
  // wrap lon to [-180, 180]
  let lon = out.lon_deg;
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  out.lon_deg = lon;
  // Allow higher alts for gas giants (up to ~0.5 R_J educational)
  const maxAlt = isFluidGiant(body) ? 1e8 : 5e7;
  out.alt_m = Math.max(0, Math.min(maxAlt, out.alt_m));
  return out;
}

/**
 * Parking altitude for mission budget: surface point alt if active,
 * else body-kind default (high for gas giants — never 100 km inside clouds).
 */
export function resolveParkingAlt_m(body, point) {
  if (isSurfacePointActive(point) && Number.isFinite(point.alt_m) && point.alt_m >= 0) {
    return point.alt_m;
  }
  return defaultParkingAlt_m(body);
}
