/**
 * Supplemental physical parameters + literature/registry source map.
 *
 * Concept-grade educational values — not flight ops. Prefer HELOS body fields
 * for mass/radius used in physics; these extras enrich the Body Dossier modal.
 *
 * Primary registries (public):
 *  - JPL SSD Planetary Physical Parameters
 *    https://ssd.jpl.nasa.gov/planets/phys_par.html
 *  - JPL Approximate Positions of Major Planets (1800–2050)
 *    https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *  - JPL Horizons System (ephemerides)
 *    https://ssd.jpl.nasa.gov/horizons/
 *  - JPL Small-Body Database (SBDB) lookup / query
 *    https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html
 *    https://ssd.jpl.nasa.gov/tools/sbdb_query.html
 *  - JPL Planetary Satellite Physical Parameters / mean elements
 *    https://ssd.jpl.nasa.gov/sats/
 *  - NASA Planetary Fact Sheet (NSSDC)
 *    https://nssdc.gsfc.nasa.gov/planetary/factsheet/
 *  - IAU / USGS Gazetteer of Planetary Nomenclature
 *    https://planetarynames.wr.usgs.gov/
 *  - IAU/IAG cartographic coordinates & rotational elements (Archinal et al.)
 *  - NASA PDS (Planetary Data System)
 *    https://pds.nasa.gov/
 *  - MPC (Minor Planet Center) for small-body designations
 *    https://www.minorplanetcenter.net/
 */

/** Shared registry bookmarks shown in every dossier. */
export const DATA_REGISTRIES = [
  {
    id: 'jpl-phys',
    name: 'JPL SSD Planetary Physical Parameters',
    url: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
    scope: 'Planet/dwarf mass, radius, density, rotation, albedo, gravity, escape',
  },
  {
    id: 'jpl-approx',
    name: 'JPL Approximate Positions of Major Planets',
    url: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    scope: 'Keplerian elements + rates (1800–2050) used for HELIOS L1 planning',
  },
  {
    id: 'horizons',
    name: 'JPL Horizons System',
    url: 'https://ssd.jpl.nasa.gov/horizons/',
    scope: 'High-fidelity ephemerides (planets, satellites, small bodies, spacecraft)',
  },
  {
    id: 'sbdb',
    name: 'JPL Small-Body Database (SBDB)',
    url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html',
    scope: 'Asteroids, comets, TNOs — orbits, physical params, close approaches',
  },
  {
    id: 'sbdb-query',
    name: 'JPL SBDB Query',
    url: 'https://ssd.jpl.nasa.gov/tools/sbdb_query.html',
    scope: 'Bulk orbital/physical tables for small-body ensembles',
  },
  {
    id: 'sats',
    name: 'JPL Planetary Satellites',
    url: 'https://ssd.jpl.nasa.gov/sats/',
    scope: 'Natural satellite mean elements and physical parameters',
  },
  {
    id: 'nssdc',
    name: 'NASA Planetary Fact Sheet (NSSDC)',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
    scope: 'Comparative planetary physical properties',
  },
  {
    id: 'iau-usgs',
    name: 'IAU / USGS Gazetteer of Planetary Nomenclature',
    url: 'https://planetarynames.wr.usgs.gov/',
    scope: 'Official surface feature names and coordinates',
  },
  {
    id: 'pds',
    name: 'NASA Planetary Data System (PDS)',
    url: 'https://pds.nasa.gov/',
    scope: 'Mission archives, kernels, and derived products',
  },
  {
    id: 'mpc',
    name: 'IAU Minor Planet Center (MPC)',
    url: 'https://www.minorplanetcenter.net/',
    scope: 'Designations and orbits for minor planets / comets',
  },
];

/**
 * JPL SSD phys_par extras (mean radius km, density g/cm³, sidereal rot days,
 * geometric albedo, equatorial g m/s², escape km/s). Masses stored on body objects.
 * Units match SSD table where practical.
 */
export const PLANET_PHYS_EXTRA = {
  Mercury: {
    meanRadius_km: 2439.4,
    equatorialRadius_km: 2440.53,
    density_g_cm3: 5.4289,
    siderealRotation_d: 58.6462,
    geometricAlbedo: 0.106,
    equatorialGravity_m_s2: 3.70,
    escapeVelocity_km_s: 4.25,
    V10: -0.60,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  Venus: {
    meanRadius_km: 6051.8,
    equatorialRadius_km: 6051.8,
    density_g_cm3: 5.243,
    siderealRotation_d: -243.018,
    geometricAlbedo: 0.65,
    equatorialGravity_m_s2: 8.87,
    escapeVelocity_km_s: 10.36,
    V10: -4.47,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  Earth: {
    meanRadius_km: 6371.0084,
    equatorialRadius_km: 6378.1366,
    density_g_cm3: 5.5134,
    siderealRotation_d: 0.99726968,
    geometricAlbedo: 0.367,
    equatorialGravity_m_s2: 9.80,
    escapeVelocity_km_s: 11.19,
    V10: -3.86,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  Mars: {
    meanRadius_km: 3389.50,
    equatorialRadius_km: 3396.19,
    density_g_cm3: 3.9340,
    siderealRotation_d: 1.02595676,
    geometricAlbedo: 0.150,
    equatorialGravity_m_s2: 3.71,
    escapeVelocity_km_s: 5.03,
    V10: -1.52,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  Jupiter: {
    meanRadius_km: 69911,
    equatorialRadius_km: 71492,
    density_g_cm3: 1.3262,
    siderealRotation_d: 0.41354,
    geometricAlbedo: 0.52,
    equatorialGravity_m_s2: 24.79,
    escapeVelocity_km_s: 60.20,
    V10: -9.40,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  Saturn: {
    meanRadius_km: 58232,
    equatorialRadius_km: 60268,
    density_g_cm3: 0.6871,
    siderealRotation_d: 0.44401,
    geometricAlbedo: 0.47,
    equatorialGravity_m_s2: 10.44,
    escapeVelocity_km_s: 36.09,
    V10: -8.88,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  Uranus: {
    meanRadius_km: 25362,
    equatorialRadius_km: 25559,
    density_g_cm3: 1.270,
    siderealRotation_d: -0.71833,
    geometricAlbedo: 0.51,
    equatorialGravity_m_s2: 8.87,
    escapeVelocity_km_s: 21.38,
    V10: -7.19,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  Neptune: {
    meanRadius_km: 24622,
    equatorialRadius_km: 24764,
    density_g_cm3: 1.638,
    siderealRotation_d: 0.67125,
    geometricAlbedo: 0.41,
    equatorialGravity_m_s2: 11.15,
    escapeVelocity_km_s: 23.56,
    V10: -6.87,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  // Dwarfs from same SSD table
  Ceres: {
    meanRadius_km: 469.7,
    equatorialRadius_km: 482.1,
    density_g_cm3: 2.162,
    siderealRotation_d: 0.37809042,
    geometricAlbedo: 0.090,
    equatorialGravity_m_s2: 0.27,
    escapeVelocity_km_s: 0.51,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  Pluto: {
    meanRadius_km: 1188.3,
    equatorialRadius_km: 1188.3,
    density_g_cm3: 1.853,
    siderealRotation_d: -6.3872,
    geometricAlbedo: 0.3,
    equatorialGravity_m_s2: 0.62,
    escapeVelocity_km_s: 1.21,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  Eris: {
    meanRadius_km: 1200,
    equatorialRadius_km: 1200,
    density_g_cm3: 2.3,
    siderealRotation_d: 1.079,
    geometricAlbedo: 0.84,
    equatorialGravity_m_s2: 0.77,
    escapeVelocity_km_s: 1.36,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  Haumea: {
    meanRadius_km: 715,
    equatorialRadius_km: 870,
    density_g_cm3: 2.6,
    siderealRotation_d: 0.1631,
    geometricAlbedo: 0.72,
    equatorialGravity_m_s2: 0.35,
    escapeVelocity_km_s: 0.78,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
  Makemake: {
    meanRadius_km: 714,
    equatorialRadius_km: 717,
    density_g_cm3: 2.1,
    siderealRotation_d: 0.937,
    geometricAlbedo: 0.81,
    equatorialGravity_m_s2: 0.40,
    escapeVelocity_km_s: 0.76,
    source: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  },
};

/**
 * @param {object} body
 * @returns {{ extra: object|null, sources: Array, registries: typeof DATA_REGISTRIES }}
 */
export function resolveBodySources(body) {
  if (!body) return { extra: null, sources: [], registries: DATA_REGISTRIES };
  const extra = PLANET_PHYS_EXTRA[body.name] || null;
  const sources = [];
  if (extra?.source) {
    sources.push({ label: 'JPL SSD physical parameters', url: extra.source });
  }
  if (body.source) {
    sources.push({ label: 'Body catalog note', url: body.source });
  }
  if (body.kind === 'planet' || !body.kind) {
    sources.push({
      label: 'JPL Approximate Positions (HELIOS L1 elements)',
      url: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    });
  }
  if (body.kind === 'moon' || body.parent) {
    sources.push({
      label: 'JPL Planetary Satellites',
      url: 'https://ssd.jpl.nasa.gov/sats/',
    });
  }
  if (body.kind === 'dwarf' || body.kind === 'neo') {
    const q = encodeURIComponent(body.name);
    sources.push({
      label: `SBDB lookup · ${body.name}`,
      url: `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${q}`,
    });
  }
  sources.push({
    label: 'NASA Planetary Fact Sheet',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
  });
  return { extra, sources, registries: DATA_REGISTRIES };
}
