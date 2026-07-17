// Static + module checks for body picker / dossier / phys registry.

import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ BODY PICKER / DOSSIER ━━━');

check('body-picker.js exists', existsSync(resolve(ROOT, 'js/ui/body-picker.js')));
check('body-dossier-modal.js exists', existsSync(resolve(ROOT, 'js/ui/body-dossier-modal.js')));
check('body-phys-registry.js exists', existsSync(resolve(ROOT, 'js/data/body-phys-registry.js')));

const mainJs = readFileSync(resolve(ROOT, 'js/main.js'), 'utf8');
check('main wires body picker', /wireBodyPicker/.test(mainJs));
check('main wires body dossier', /wireBodyDossier/.test(mainJs));

const indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
check('origin slot has click affordance', /route-origin/.test(indexHtml) && /slot-chevron/.test(indexHtml));
check('dest slot has click affordance', /route-dest/.test(indexHtml));

const { DATA_REGISTRIES, PLANET_PHYS_EXTRA, resolveBodySources } = await import(
  pathToFileURL(resolve(ROOT, 'js/data/body-phys-registry.js')).href
);
check('≥8 public registries listed', DATA_REGISTRIES.length >= 8);
check('registries have https URLs', DATA_REGISTRIES.every((r) => /^https:\/\//.test(r.url)));
check('Earth phys extra present', !!PLANET_PHYS_EXTRA.Earth);
check('Mars density set', PLANET_PHYS_EXTRA.Mars?.density_g_cm3 > 3);
check('Jupiter escape ~60 km/s', Math.abs(PLANET_PHYS_EXTRA.Jupiter.escapeVelocity_km_s - 60.2) < 0.5);

const { listPlanets, listMoons, allBodies } = await import(
  pathToFileURL(resolve(ROOT, 'js/data/catalog.js')).href
);
check('catalog has 8 planets', listPlanets().length === 8);
check('catalog has moons', listMoons().length >= 20);
check('allBodies includes moons+planets', allBodies().length >= 30);

const earth = listPlanets().find((b) => b.name === 'Earth');
const src = resolveBodySources(earth);
check('Earth sources non-empty', src.sources.length >= 2);
check('Earth has SSD extra', !!src.extra?.meanRadius_km);

const moon = listMoons().find((b) => b.name === 'Moon');
const msrc = resolveBodySources(moon);
check('Moon sources include sats page', msrc.sources.some((s) => /sats/i.test(s.url)));

const selJs = readFileSync(resolve(ROOT, 'js/ui/selection.js'), 'utf8');
check('selectBody opens dossier', /openBodyDossier/.test(selJs));

const media = await import(pathToFileURL(resolve(ROOT, 'js/data/body-media.js')).href);
check('body-media module loads', !!media.TEX_BASE);
check('Earth has texture file', !!media.BODY_TEXTURE_FILE.Earth);
check('Io has curated NASA images', (media.BODY_NASA_GALLERY.Io || []).length >= 1);
const dossierJs = readFileSync(resolve(ROOT, 'js/ui/body-dossier-modal.js'), 'utf8');
check('dossier mounts 3D globe', /mountBodyGlobePreview/.test(dossierJs));
check('dossier has NASA gallery', /curatedNasaImages|bd-gallery/.test(dossierJs));
check('dossier workbench chrome', /bd-workbench|bd-topbar|bd-bottombar/.test(dossierJs));
check('globe preview module exists', existsSync(resolve(ROOT, 'js/ui/body-globe-preview.js')));
check('globe fitCamera present', readFileSync(resolve(ROOT, 'js/ui/body-globe-preview.js'), 'utf8').includes('fitCamera'));
check('mission study bar in HTML', /mission-study-bar|ms-scrub/.test(indexHtml));
check('mission wires study bar', /wireMissionStudyBar|pickMissionStudySpeed/.test(
  readFileSync(resolve(ROOT, 'js/mission.js'), 'utf8'),
));
// Gallery thumbs should be embeddable (CDN / Wikimedia), not photojournal jpeg hotlinks alone
const mediaSrc = readFileSync(resolve(ROOT, 'js/data/body-media.js'), 'utf8');
check('gallery prefers wikimedia or threex CDN',
  /upload\.wikimedia\.org|threex\.planets/.test(mediaSrc));

if (failed) {
  console.error(`\n${failed} body picker/dossier check(s) failed`);
  process.exit(1);
}
console.log('\nAll body picker/dossier checks passed');
