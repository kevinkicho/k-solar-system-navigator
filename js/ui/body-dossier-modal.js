/**
 * Body Dossier modal — wide chrome layout (top / side / bottom bars),
 * 3D globe, and embeddable NASA / Wikimedia stills.
 */
import { AU, DAY, DEG, G_CONST } from '../constants.js';
import { BODIES, SUN_DATA } from '../data/bodies.js';
import { moonsByParent } from '../data/moons.js';
import { resolveBodySources } from '../data/body-phys-registry.js';
import {
  curatedNasaImages, nasaSearchPageUrl, searchNasaImages, textureUrlForBody,
} from '../data/body-media.js';
import { state } from '../state.js';
import {
  formatDist, formatMass, formatTime, formatVelocity,
} from './format.js';
import { setRouteDestination, setRouteOrigin } from './route-planner.js';
import {
  disposeBodyGlobePreview, mountBodyGlobePreview,
} from './body-globe-preview.js';

let overlay = null;
let modalMain = null;
let currentBody = null;
let mediaGen = 0;

function ensureDom() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'body-dossier-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'body-dossier-title');
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="bd-modal" id="body-dossier-modal">
      <header class="bd-topbar">
        <div class="bd-topbar-left">
          <div class="bd-brand">DOSSIER</div>
          <div>
            <h2 id="body-dossier-title">Body</h2>
            <div class="bd-sub" id="body-dossier-sub"></div>
          </div>
        </div>
        <div class="bd-topbar-right">
          <a class="bd-top-link" id="bd-nasa-link" href="https://images.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA Images ↗</a>
          <button type="button" class="btn-tiny" id="body-dossier-close">CLOSE</button>
        </div>
      </header>
      <div class="bd-workbench">
        <aside class="bd-sidebar bd-sidebar-left" id="bd-sidebar-left"></aside>
        <main class="bd-main" id="body-dossier-body"></main>
        <aside class="bd-sidebar bd-sidebar-right" id="bd-sidebar-right"></aside>
      </div>
      <footer class="bd-bottombar" id="body-dossier-actions"></footer>
    </div>`;
  document.body.appendChild(overlay);
  modalMain = overlay.querySelector('#body-dossier-body');
  overlay.querySelector('#body-dossier-close').onclick = closeBodyDossier;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeBodyDossier();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closeBodyDossier();
  });
}

function row(key, val, cls = '') {
  return `<div class="info-row"><span class="key">${key}</span><span class="val ${cls}">${val}</span></div>`;
}

function section(title, inner) {
  return `<div class="bd-section"><h3>${title}</h3>${inner}</div>`;
}

function imgCard(img) {
  return `
    <a class="bd-img-card" href="${img.page}" target="_blank" rel="noopener noreferrer" title="${img.title}">
      <div class="bd-img-frame">
        <img src="${img.thumb}" alt="${img.title}" loading="lazy" decoding="async"
          referrerpolicy="no-referrer" data-bd-img="1" />
        <div class="bd-img-fallback" hidden>Image unavailable</div>
      </div>
      <span>${img.title}</span>
    </a>`;
}

function buildPanels(body) {
  const { extra, sources, registries } = resolveBodySources(body);
  const isMoon = !!(body.parent);
  const kind = body.kind || (isMoon ? 'moon' : 'planet');
  const gSurf = body.mass && body.radius
    ? (G_CONST * body.mass / (body.radius * body.radius) / 9.81)
    : null;
  const vEsc = body.mass && body.radius
    ? Math.sqrt(2 * G_CONST * body.mass / body.radius)
    : null;
  const density = extra?.density_g_cm3
    ?? (body.mass && body.radius
      ? (body.mass / ((4 / 3) * Math.PI * body.radius ** 3)) / 1000
      : null);

  let identity = `
    ${row('Kind', kind)}
    ${body.id ? row('Catalog id', body.id) : ''}
    ${isMoon ? row('Parent', body.parent) : ''}
    ${body.desc ? `<p class="bd-desc">${body.desc}</p>` : ''}
    <p class="bd-disclaimer">Concept-grade educational dossier — not flight-ops navigation data.</p>`;

  let physical = '';
  if (body.mass) physical += row('Mass', formatMass(body.mass));
  if (body.radius) physical += row('Mean radius (HELIOS)', formatDist(body.radius));
  if (extra?.meanRadius_km != null) {
    physical += row('Mean radius (JPL SSD)', `${extra.meanRadius_km.toLocaleString()} km`);
  }
  if (extra?.equatorialRadius_km != null) {
    physical += row('Equatorial radius (JPL SSD)', `${extra.equatorialRadius_km.toLocaleString()} km`);
  }
  if (density != null && isFinite(density)) {
    physical += row('Bulk density', `${Number(density).toFixed(3)} g/cm³`);
  }
  if (gSurf != null && isFinite(gSurf)) {
    physical += row('Surface gravity', `${gSurf.toFixed(3)} g`);
  }
  if (extra?.equatorialGravity_m_s2 != null) {
    physical += row('Equatorial g (JPL SSD)', `${extra.equatorialGravity_m_s2.toFixed(2)} m/s²`);
  }
  if (vEsc != null && isFinite(vEsc)) {
    physical += row('Escape velocity', formatVelocity(vEsc));
  }
  if (extra?.escapeVelocity_km_s != null) {
    physical += row('Escape (JPL SSD)', `${extra.escapeVelocity_km_s.toFixed(2)} km/s`);
  }
  if (extra?.siderealRotation_d != null) {
    const d = extra.siderealRotation_d;
    physical += row('Sidereal rotation', `${d.toFixed(4)} d${d < 0 ? ' (retrograde)' : ''}`);
  }
  if (extra?.geometricAlbedo != null) {
    physical += row('Geometric albedo', String(extra.geometricAlbedo));
  }
  if (extra?.V10 != null) physical += row('V(1,0)', String(extra.V10));

  let orbital = '';
  if (isMoon) {
    const parentBody = BODIES.find((b) => b.name === body.parent);
    const parentMass = parentBody?.mass || 0;
    const orbVel = parentMass > 0 && body.a_km
      ? Math.sqrt(G_CONST * parentMass / (body.a_km * 1000))
      : null;
    if (body.a_km != null) orbital += row('Semi-major axis', `${body.a_km.toLocaleString()} km`, 'highlight');
    if (body.e != null) orbital += row('Eccentricity', body.e.toFixed(6));
    if (body.I != null) orbital += row('Inclination', `${Number(body.I).toFixed(3)}°`);
    if (body.period != null) {
      orbital += row('Period', formatTime(body.period));
      orbital += row('Period (days)', `${(body.period / DAY).toFixed(4)} d`);
    }
    if (orbVel != null) orbital += row('Orbital velocity', formatVelocity(orbVel), 'green');
  } else if (body.a != null) {
    orbital += row('Semi-major axis', formatDist(body.a * AU));
    orbital += row('Semi-major (AU)', `${body.a.toFixed(6)} AU`, 'highlight');
    if (body.e != null) orbital += row('Eccentricity', body.e.toFixed(6));
    if (body.I != null) {
      const shown = Math.abs(body.I) <= Math.PI + 0.1 ? (body.I / DEG) : body.I;
      orbital += row('Inclination', `${shown.toFixed(4)}°`);
    }
    if (body.period != null) orbital += row('Sidereal period', formatTime(body.period));
    if (body.L0 != null) orbital += row('Mean longitude L₀', `${(body.L0 / DEG).toFixed(4)}°`);
    if (body.wBar != null) orbital += row('ϖ (perihelion long.)', `${(body.wBar / DEG).toFixed(4)}°`);
    if (body.omega != null) orbital += row('Ω (node)', `${(body.omega / DEG).toFixed(4)}°`);
  }

  let current = '';
  if (!isMoon) {
    const pos = state.bodyPositions.get(body.name);
    if (pos) {
      const dist = pos.r * AU;
      const vel = dist > 0 ? Math.sqrt(G_CONST * SUN_DATA.mass / dist) : 0;
      current += row('Heliocentric distance', formatDist(dist), 'highlight');
      current += row('Distance (AU)', `${pos.r.toFixed(6)} AU`);
      current += row('Circular-orbit speed @ r', formatVelocity(vel), 'green');
      current += row('Position X (ecl.)', `${pos.x.toFixed(6)} AU`);
      current += row('Position Y (out-of-plane)', `${pos.y.toFixed(6)} AU`);
      current += row('Position Z', `${pos.z.toFixed(6)} AU`);
    }
  }

  let sats = '';
  const moonList = moonsByParent[body.name];
  if (moonList?.length) {
    sats = moonList.map((m) =>
      `<button type="button" class="bd-sat" data-name="${m.name}" style="border-color:${m.color}">${m.name}</button>`).join('');
    sats = `<div class="bd-sat-list">${sats}</div>`;
  }

  const srcHtml = sources.map((s) =>
    `<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}</a></li>`).join('');
  const regHtml = registries.map((r) =>
    `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer"><strong>${r.name}</strong></a>
      <span class="bd-reg-scope"> — ${r.scope}</span></li>`).join('');

  const curated = curatedNasaImages(body);
  const galleryHtml = curated.length
    ? curated.map(imgCard).join('')
    : '<p class="bd-reg-intro">No curated stills for this body yet. Use NASA Images link in the top bar.</p>';

  const hasTex = !!textureUrlForBody(body);
  const left = `
    <div class="bd-globe-panel">
      <div class="bd-globe" id="bd-globe" role="img" aria-label="3D preview of ${body.name}"></div>
      <p class="bd-media-cap">${hasTex
    ? 'Educational 3D globe · NASA-derived map (CDN)'
    : 'Educational 3D globe · catalog color (no map texture)'}</p>
    </div>
    ${section('Identity', identity)}
    ${sats ? section(`Satellites in HELIOS (${moonList.length})`, sats) : ''}
  `;

  const main = `
    ${physical ? section('Physical parameters', physical) : ''}
    ${orbital ? section('Orbital elements', orbital) : ''}
    ${current ? section('Current state (sim)', current) : ''}
    ${section('Sources for this body', `<ul class="bd-links">${srcHtml}</ul>`)}
    ${section('Public data registries', `
      <p class="bd-reg-intro">Authoritative open registries (concept-grade links):</p>
      <ul class="bd-links bd-registry">${regHtml}</ul>
    `)}
  `;

  const right = `
    ${section('Gallery', `
      <div class="bd-gallery" id="bd-gallery">${galleryHtml}</div>
      <p class="bd-media-cap">
        Embeddable public-domain / educational stills ·
        <a href="${nasaSearchPageUrl(body)}" target="_blank" rel="noopener noreferrer">images.nasa.gov</a>
        <span id="bd-gallery-live-status"></span>
      </p>
    `)}
  `;

  return { left, main, right };
}

function wireBrokenImages(root) {
  root?.querySelectorAll('img[data-bd-img]').forEach((img) => {
    img.addEventListener('error', () => {
      const frame = img.closest('.bd-img-frame');
      const card = img.closest('.bd-img-card');
      if (frame) {
        img.hidden = true;
        const fb = frame.querySelector('.bd-img-fallback');
        if (fb) fb.hidden = false;
      }
      if (card) card.classList.add('bd-img-broken');
    }, { once: true });
  });
}

function fillLiveNasaGallery(body, gen) {
  const status = overlay?.querySelector('#bd-gallery-live-status');
  const gallery = overlay?.querySelector('#bd-gallery');
  if (!gallery) return;
  searchNasaImages(body, 8).then((live) => {
    if (gen !== mediaGen || !live.length) return;
    const existing = new Set(
      [...gallery.querySelectorAll('img')].map((img) => img.getAttribute('src')),
    );
    const extra = live.filter((x) => x.thumb && !existing.has(x.thumb)).slice(0, 6);
    if (!extra.length) return;
    gallery.insertAdjacentHTML('beforeend', extra.map(imgCard).join(''));
    wireBrokenImages(gallery);
    if (status) status.textContent = ' · + live NASA Images API';
  }).catch(() => { /* soft-fail */ });
}

export function openBodyDossier(body) {
  if (!body || body === SUN_DATA) return;
  ensureDom();
  disposeBodyGlobePreview();
  currentBody = body;
  const gen = ++mediaGen;
  const title = overlay.querySelector('#body-dossier-title');
  const sub = overlay.querySelector('#body-dossier-sub');
  title.textContent = body.name;
  title.style.color = body.color || 'var(--cyan)';
  const kind = body.kind || (body.parent ? 'moon' : 'planet');
  sub.textContent = body.parent
    ? `${kind} · satellite of ${body.parent}`
    : kind;

  const nasaLink = overlay.querySelector('#bd-nasa-link');
  if (nasaLink) nasaLink.href = nasaSearchPageUrl(body);

  const panels = buildPanels(body);
  overlay.querySelector('#bd-sidebar-left').innerHTML = panels.left;
  modalMain.innerHTML = panels.main;
  overlay.querySelector('#bd-sidebar-right').innerHTML = panels.right;

  const globeEl = overlay.querySelector('#bd-globe');
  if (globeEl) {
    try {
      // Defer one frame so CSS grid sizes the globe cell
      requestAnimationFrame(() => {
        if (gen !== mediaGen) return;
        mountBodyGlobePreview(globeEl, body);
      });
    } catch (err) {
      console.warn('Body globe preview failed', err);
      globeEl.innerHTML = '<p class="bd-reg-intro">3D preview unavailable</p>';
    }
  }
  wireBrokenImages(overlay);
  fillLiveNasaGallery(body, gen);

  const actions = overlay.querySelector('#body-dossier-actions');
  actions.innerHTML = `
    <div class="bd-bottom-hint">Educational dossier · use route actions to plan</div>
    <div class="bd-bottom-actions">
      <button type="button" class="route-btn secondary" id="bd-set-origin">Set as Origin</button>
      <button type="button" class="route-btn secondary" id="bd-set-dest">Set as Destination</button>
      <button type="button" class="route-btn secondary" id="bd-follow">Follow in scene</button>
    </div>
  `;
  actions.querySelector('#bd-set-origin').onclick = () => {
    setRouteOrigin(body);
    closeBodyDossier();
  };
  actions.querySelector('#bd-set-dest').onclick = () => {
    setRouteDestination(body);
    closeBodyDossier();
  };
  actions.querySelector('#bd-follow').onclick = () => {
    state.followMode = true;
    closeBodyDossier();
  };

  overlay.querySelectorAll('.bd-sat').forEach((btn) => {
    btn.onclick = () => {
      import('../data/catalog.js').then(({ findByName }) => {
        const m = findByName(btn.dataset.name);
        if (m) {
          import('./selection.js').then(({ selectBody }) => selectBody(m));
        }
      });
    };
  });

  overlay.hidden = false;
}

export function closeBodyDossier() {
  if (!overlay) return;
  disposeBodyGlobePreview();
  mediaGen += 1;
  overlay.hidden = true;
  currentBody = null;
}

export function wireBodyDossier() {
  ensureDom();
}

export function isBodyDossierOpen() {
  return !!(overlay && !overlay.hidden);
}
