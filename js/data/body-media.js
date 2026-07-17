/**
 * Educational body media: equirectangular map URLs (NASA-derived via threex.planets)
 * and curated NASA Image Library / Photojournal links for the body dossier modal.
 *
 * Textures are the same public-domain maps used by the main scene (jsDelivr pin).
 * Gallery thumbs prefer images-assets.nasa.gov (no API key). Optional live search
 * via images-api.nasa.gov when the network allows.
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
 * Curated NASA public-domain image cards (title, page, thumbnail).
 * Thumbs from images-assets.nasa.gov where available.
 */
export const BODY_NASA_GALLERY = {
  Mercury: [
    {
      title: 'Mercury — MESSENGER global mosaic',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA15162',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA15162.jpg',
    },
    {
      title: 'Mercury in color (MESSENGER)',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA16853',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA16853.jpg',
    },
  ],
  Venus: [
    {
      title: 'Venus — Magellan radar mosaic',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA00271',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA00271.jpg',
    },
    {
      title: 'Venus cloud tops (Mariner 10)',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA00159',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA00159.jpg',
    },
  ],
  Earth: [
    {
      title: 'The Blue Marble',
      page: 'https://images.nasa.gov/details/as17-148-22727',
      thumb: 'https://images-assets.nasa.gov/image/as17-148-22727/as17-148-22727~thumb.jpg',
    },
    {
      title: 'Earth from DSCOVR',
      page: 'https://images.nasa.gov/details/epic_1b_20161022011359',
      thumb: 'https://images-assets.nasa.gov/image/PIA18033/PIA18033~thumb.jpg',
    },
  ],
  Mars: [
    {
      title: 'Mars global color mosaic',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA00407',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA00407.jpg',
    },
    {
      title: 'Valles Marineris',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA00422',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA00422.jpg',
    },
  ],
  Jupiter: [
    {
      title: 'Jupiter — Cassini',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA04866',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA04866.jpg',
    },
    {
      title: 'Great Red Spot (Juno)',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA21775',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA21775.jpg',
    },
  ],
  Saturn: [
    {
      title: 'Saturn — Cassini natural color',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA17172',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA17172.jpg',
    },
    {
      title: 'Saturn rings',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA08389',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA08389.jpg',
    },
  ],
  Uranus: [
    {
      title: 'Uranus — Voyager 2',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA18182',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA18182.jpg',
    },
  ],
  Neptune: [
    {
      title: 'Neptune — Voyager 2',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA01492',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA01492.jpg',
    },
  ],
  Moon: [
    {
      title: 'Full Moon',
      page: 'https://images.nasa.gov/details/PIA00405',
      thumb: 'https://images-assets.nasa.gov/image/PIA00405/PIA00405~thumb.jpg',
    },
    {
      title: 'Earthrise (Apollo 8)',
      page: 'https://images.nasa.gov/details/as08-14-2383',
      thumb: 'https://images-assets.nasa.gov/image/as08-14-2383/as08-14-2383~thumb.jpg',
    },
  ],
  Io: [
    {
      title: 'Io — Galileo true color',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA00583',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA00583.jpg',
    },
    {
      title: 'Io volcanoes (Galileo)',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA01667',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA01667.jpg',
    },
  ],
  Europa: [
    {
      title: 'Europa — Galileo',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA19048',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA19048.jpg',
    },
    {
      title: 'Europa global view',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA00294',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA00294.jpg',
    },
  ],
  Ganymede: [
    {
      title: 'Ganymede — Galileo',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA00716',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA00716.jpg',
    },
  ],
  Callisto: [
    {
      title: 'Callisto — Galileo',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA03456',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA03456.jpg',
    },
  ],
  Titan: [
    {
      title: 'Titan — Cassini natural color',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA14913',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA14913.jpg',
    },
  ],
  Phobos: [
    {
      title: 'Phobos — Mars Express',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA10368',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA10368.jpg',
    },
  ],
  Deimos: [
    {
      title: 'Deimos — Mars Reconnaissance Orbiter',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA11826',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA11826.jpg',
    },
  ],
  Ceres: [
    {
      title: 'Ceres — Dawn',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA19562',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA19562.jpg',
    },
  ],
  Pluto: [
    {
      title: 'Pluto — New Horizons',
      page: 'https://photojournal.jpl.nasa.gov/catalog/PIA19952',
      thumb: 'https://photojournal.jpl.nasa.gov/jpeg/PIA19952.jpg',
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
  if (body.period && body.parent) return body.period; // tidally locked moons ≈ orbit
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
    const res = await fetch(url, { signal: AbortSignal.timeout?.(8000) });
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
