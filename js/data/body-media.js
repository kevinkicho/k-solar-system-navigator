/**
 * Educational body media: equirectangular map URLs (NASA-derived via threex.planets)
 * and curated stills that embed reliably in the browser (Wikimedia Commons / CDN maps).
 *
 * Prefer embeddable HTTPS sources over photojournal hotlinks (often blocked / 403).
 */

/** Pinned threex.planets maps (NASA public domain) — same CDN pin as scene/planets.js */
export const TEX_BASE =
  'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@01ca2b7/images/';

/** Equirectangular surface maps for 3D globe preview (null → solid color sphere). */
export const BODY_TEXTURE_FILE = {
  Mercury: 'mercurymap.jpg',
  Venus: 'venusmap.jpg',
  Earth: 'earthmap1k.jpg',
  Mars: 'marsmap1k.jpg',
  Jupiter: 'jupitermap.jpg',
  Saturn: 'saturnmap.jpg',
  Uranus: 'uranusmap.jpg',
  Neptune: 'neptunemap.jpg',
  Moon: 'moonmap1k.jpg',
};

/** Sidereal spin (s) for preview rotation; negative = retrograde. */
export const BODY_SPIN_SEC = {
  Mercury: 5067360,
  Venus: -20996755,
  Earth: 86164,
  Mars: 88642,
  Jupiter: 35730,
  Saturn: 38018,
  Uranus: -62064,
  Neptune: 57996,
  Moon: 27.322 * 86400,
  Io: 1.769 * 86400,
  Europa: 3.551 * 86400,
  Ganymede: 7.155 * 86400,
  Callisto: 16.689 * 86400,
  Titan: 15.945 * 86400,
  Phobos: 0.31891 * 86400,
  Deimos: 1.263 * 86400,
};

/**
 * Curated gallery cards. `thumb` must be a hotlink-friendly HTTPS image.
 * Prefer Wikimedia Commons (NASA / public domain) and threex map CDN.
 */
export const BODY_NASA_GALLERY = {
  Mercury: [
    {
      title: 'Mercury map (educational mosaic)',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA15162',
      thumb: TEX_BASE + 'mercurymap.jpg',
    },
    {
      title: 'Mercury — MESSENGER (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Mercury_in_true_color.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Mercury_in_true_color.jpg/320px-Mercury_in_true_color.jpg',
    },
  ],
  Venus: [
    {
      title: 'Venus map (educational)',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA00271',
      thumb: TEX_BASE + 'venusmap.jpg',
    },
    {
      title: 'Venus — Mariner 10 (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Venus_globe.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Venus-real_color.jpg/320px-Venus-real_color.jpg',
    },
  ],
  Earth: [
    {
      title: 'Earth map (educational)',
      page: 'https://images.nasa.gov/details/as17-148-22727',
      thumb: TEX_BASE + 'earthmap1k.jpg',
    },
    {
      title: 'The Blue Marble (Apollo 17)',
      page: 'https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/320px-The_Earth_seen_from_Apollo_17.jpg',
    },
  ],
  Mars: [
    {
      title: 'Mars map (educational)',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA00407',
      thumb: TEX_BASE + 'marsmap1k.jpg',
    },
    {
      title: 'Mars — Hubble / public domain (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:OSIRIS_Mars_true_color.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/OSIRIS_Mars_true_color.jpg/320px-OSIRIS_Mars_true_color.jpg',
    },
  ],
  Jupiter: [
    {
      title: 'Jupiter map (educational)',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA04866',
      thumb: TEX_BASE + 'jupitermap.jpg',
    },
    {
      title: 'Jupiter — Cassini (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Jupiter_and_its_shrunken_Great_Red_Spot.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Jupiter_and_its_shrunken_Great_Red_Spot.jpg/320px-Jupiter_and_its_shrunken_Great_Red_Spot.jpg',
    },
  ],
  Saturn: [
    {
      title: 'Saturn map (educational)',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA17172',
      thumb: TEX_BASE + 'saturnmap.jpg',
    },
    {
      title: 'Saturn — Cassini (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Saturn_during_Equinox.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Saturn_during_Equinox.jpg/320px-Saturn_during_Equinox.jpg',
    },
  ],
  Uranus: [
    {
      title: 'Uranus map (educational)',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA18182',
      thumb: TEX_BASE + 'uranusmap.jpg',
    },
    {
      title: 'Uranus — Voyager 2 (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Uranus2.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Uranus2.jpg/320px-Uranus2.jpg',
    },
  ],
  Neptune: [
    {
      title: 'Neptune map (educational)',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA01492',
      thumb: TEX_BASE + 'neptunemap.jpg',
    },
    {
      title: 'Neptune — Voyager 2 (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Neptune_Full.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Neptune_Full.jpg/320px-Neptune_Full.jpg',
    },
  ],
  Moon: [
    {
      title: 'Moon map (educational)',
      page: 'https://images.nasa.gov/details/PIA00405',
      thumb: TEX_BASE + 'moonmap1k.jpg',
    },
    {
      title: 'Full Moon (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:FullMoon2010.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/FullMoon2010.jpg/320px-FullMoon2010.jpg',
    },
  ],
  Io: [
    {
      title: 'Io — Galileo (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Io_highest_resolution_true_color.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Io_highest_resolution_true_color.jpg/320px-Io_highest_resolution_true_color.jpg',
    },
    {
      title: 'Io true color (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Io_in_true_color.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Io_in_true_color.jpg/320px-Io_in_true_color.jpg',
    },
  ],
  Europa: [
    {
      title: 'Europa — Galileo (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Europa-moon-with-margins.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Europa-moon-with-margins.jpg/320px-Europa-moon-with-margins.jpg',
    },
    {
      title: 'Europa global (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Europa_moon.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Europa_moon.jpg/320px-Europa_moon.jpg',
    },
  ],
  Ganymede: [
    {
      title: 'Ganymede — Galileo (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Ganymede_g1_true-edit1.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Ganymede_g1_true-edit1.jpg/320px-Ganymede_g1_true-edit1.jpg',
    },
  ],
  Callisto: [
    {
      title: 'Callisto — Galileo (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Callisto.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Callisto.jpg/320px-Callisto.jpg',
    },
  ],
  Titan: [
    {
      title: 'Titan — Cassini (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Titan_in_true_color.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Titan_in_true_color.jpg/320px-Titan_in_true_color.jpg',
    },
  ],
  Enceladus: [
    {
      title: 'Enceladus — Cassini (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Enceladus_from_Cassini_Orbit_175.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/PIA17202_-_Approaching_Enceladus.jpg/320px-PIA17202_-_Approaching_Enceladus.jpg',
    },
  ],
  Triton: [
    {
      title: 'Triton — Voyager 2 (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Triton_moon_mosaic_Voyager_2_(large).jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Triton_moon_mosaic_Voyager_2_%28large%29.jpg/320px-Triton_moon_mosaic_Voyager_2_%28large%29.jpg',
    },
  ],
  Phobos: [
    {
      title: 'Phobos — Mars Express (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Phobos_colour_2008.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Phobos_colour_2008.jpg/320px-Phobos_colour_2008.jpg',
    },
  ],
  Deimos: [
    {
      title: 'Deimos (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Deimos-MRO.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Deimos-MRO.jpg/320px-Deimos-MRO.jpg',
    },
  ],
  Ceres: [
    {
      title: 'Ceres — Dawn (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Ceres_-_RC3_-_Haulani_Crater_(22381131691)_(cropped).jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Ceres_-_RC3_-_Haulani_Crater_%2822381131691%29.jpg/320px-Ceres_-_RC3_-_Haulani_Crater_%2822381131691%29.jpg',
    },
  ],
  Pluto: [
    {
      title: 'Pluto — New Horizons (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Pluto-01_Stern_03_Pluto_Color_TXT.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Pluto_in_True_Color_-_High-Res.jpg/320px-Pluto_in_True_Color_-_High-Res.jpg',
    },
  ],
  Eris: [
    {
      title: 'Eris artist concept (public domain style)',
      page: 'https://commons.wikimedia.org/wiki/File:Eris_and_dysnomia2.jpg',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Eris_and_dysnomia2.jpg/320px-Eris_and_dysnomia2.jpg',
    },
  ],
  Haumea: [
    {
      title: 'Haumea artist concept (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Haumea_Hubble.png',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Haumea_Hubble.png/320px-Haumea_Hubble.png',
    },
  ],
  Bennu: [
    {
      title: 'Bennu — OSIRIS-REx (Wikimedia)',
      page: 'https://commons.wikimedia.org/wiki/File:Bennu_mosaic_OSIRIS-REx_(cropped).png',
      thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/BennuAsteroid.jpg/320px-BennuAsteroid.jpg',
    },
  ],
};

export function textureUrlForBody(body) {
  if (!body?.name) return null;
  const file = BODY_TEXTURE_FILE[body.name];
  return file ? TEX_BASE + file : null;
}

export function spinPeriodSec(body) {
  if (!body?.name) return 86400;
  if (BODY_SPIN_SEC[body.name] != null) return BODY_SPIN_SEC[body.name];
  if (body.period && body.parent) return body.period;
  return 86400;
}

export function curatedNasaImages(body) {
  if (!body?.name) return [];
  return BODY_NASA_GALLERY[body.name] || [];
}

/** NASA Images API search (optional network; fails soft). */
export async function searchNasaImages(body, limit = 6) {
  if (!body?.name || typeof fetch !== 'function') return [];
  const q = body.parent
    ? `${body.name} ${body.parent} moon`
    : `${body.name} planet`;
  const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image&page_size=${limit}`;
  try {
    const ctrl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(8000)
      : undefined;
    const res = await fetch(url, ctrl ? { signal: ctrl } : undefined);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.collection?.items || [];
    return items.slice(0, limit).map((it) => {
      const meta = it.data?.[0] || {};
      const links = it.links || [];
      const thumb = links.find((l) => l.rel === 'preview')?.href
        || links[0]?.href
        || null;
      const nasaId = meta.nasa_id;
      return {
        title: meta.title || nasaId || 'NASA image',
        page: nasaId
          ? `https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`
          : 'https://images.nasa.gov/',
        thumb,
        source: 'nasa-images-api',
      };
    }).filter((x) => x.thumb);
  } catch {
    return [];
  }
}

export function nasaSearchPageUrl(body) {
  if (!body?.name) return 'https://images.nasa.gov/';
  const q = body.parent ? `${body.name} moon` : body.name;
  return `https://images.nasa.gov/search?q=${encodeURIComponent(q)}&page=1&media=image`;
}
