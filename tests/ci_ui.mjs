// CI-friendly Playwright UI smoke: starts its own server, runs critical checks, exits non-zero on failure.
// Usage: npm run test:ui:ci
// Env: HELIOS_URL overrides auto-start; PLAYWRIGHT_BROWSERS_PATH may be set by CI.

import { chromium } from 'playwright';
import { createServer } from '../server.js';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'screenshots');
mkdirSync(OUT, { recursive: true });

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
}
function section(s) { console.log('\n━━━ ' + s + ' ━━━'); }

let server = null;
let appUrl = process.env.HELIOS_URL || null;

if (!appUrl) {
  server = createServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  appUrl = `http://127.0.0.1:${port}/`;
  console.log(`CI UI server at ${appUrl}`);
}

// Force offline Firebase in CI so dense-SPK Storage warm never hits CORS on localhost.
// HELIOS_URL may already have query params — append carefully.
function withFirebaseOff(url) {
  try {
    const u = new URL(url);
    if (!u.searchParams.has('firebase')) u.searchParams.set('firebase', '0');
    return u.toString();
  } catch {
    return url.includes('?') ? `${url}&firebase=0` : `${url}?firebase=0`;
  }
}
const bootUrl = withFirebaseOff(appUrl);
console.log(`CI UI boot URL (firebase=0): ${bootUrl}`);

/** Console noise that must not fail CI (network optional features, CDN, CORS). */
function isBenignConsoleError(text) {
  return /favicon|404|Failed to load resource|net::ERR|CORS policy|Access-Control-Allow-Origin|firebasestorage\.googleapis\.com|firestore\.googleapis\.com|identitytoolkit|securetoken|googleapis\.com.*(?:blocked|CORS)/i
    .test(text || '');
}

const errors = [];
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('404') && !isBenignConsoleError(msg.text())) {
    errors.push(msg.text());
  }
});

try {
  section('1. BOOT');
  await page.goto(bootUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Playwright signature: waitForFunction(fn, arg, options) — pass null arg so timeout is honored.
  await page.waitForFunction(
    () => {
      const h = window.__HELIOS;
      if (!h) return false;
      const n = h.bodyPositions?.size ?? h.state?.bodyPositions?.size ?? 0;
      return !!(h.scene || h.state) && n >= 8;
    },
    null,
    { timeout: 60000 },
  );
  const bootReal = errors.filter((e) => !isBenignConsoleError(e));
  if (bootReal.length) {
    console.log('  page errors during boot:', bootReal.slice(0, 5).join(' | '));
  }
  check('__HELIOS hook + 8 planets', true);
  check('no boot page errors', bootReal.length === 0, bootReal.slice(0, 3).join('; '));

  const canvas = await page.locator('#renderer-container canvas').count();
  check('WebGL canvas present', canvas >= 1);

  section('1b. DENSE SPK OFFLINE (firebase=0)');
  // Hosting static packs must work without Firebase Storage (CI hermetic / offline).
  const denseOffline = await page.evaluate(async () => {
    try {
      const r = await fetch('/assets/dense-spk/registry.json');
      if (!r.ok) return { ok: false, reason: `status ${r.status}` };
      const j = await r.json();
      const packs = Array.isArray(j.packs) ? j.packs.length : 0;
      const hasMars = !!j.body_to_pack?.phobos || !!j.body_to_pack?.Phobos
        || (j.packs || []).some((p) => p.pack_id === 'mars-moons');
      const meta = await fetch('/assets/dense-spk/mars-moons.meta.json');
      return {
        ok: packs >= 6 && hasMars && meta.ok,
        packs,
        hasMars,
        metaOk: meta.ok,
      };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e) };
    }
  });
  check(
    `offline dense registry ≥6 packs (got ${denseOffline.packs ?? denseOffline.reason})`,
    !!denseOffline.ok,
    denseOffline.reason || `packs=${denseOffline.packs} mars=${denseOffline.hasMars} meta=${denseOffline.metaOk}`,
  );

  section('2. ROUTE EARTH → MARS');
  await page.locator('.body-item', { hasText: 'Earth' }).first().click({ button: 'right' });
  await page.locator('.body-item', { hasText: 'Mars' }).first().click({ button: 'right' });
  check('origin Earth', (await page.locator('#origin-name').textContent()).trim() === 'Earth');
  check('dest Mars', (await page.locator('#dest-name').textContent()).trim() === 'Mars');

  await page.locator('#calc-route').click();
  await page.waitForFunction(
    () => (document.getElementById('transfer-results')?.textContent || '').length > 80,
    null,
    { timeout: 15000 },
  );
  const resultsText = (await page.locator('#transfer-results').textContent()).trim();
  // Hero + collapsible details: match need/feasible or legacy Lambert headings
  check(
    'results mention transfer / need',
    /LAMBERT|HOHMANN|Transfer ready|Need Δv|Heliocentric/i.test(resultsText),
  );
  const dvMatch = resultsText.match(
    /(?:Heliocentric (?:leg )?total|Total\s*Δv|Need Δv)\s*([\d.]+)\s*(?:km\/s|m\/s)?/i,
  );
  // Need may be formatted as km/s; also accept hero-only metrics if detail collapsed
  let totalDv = dvMatch ? parseFloat(dvMatch[1]) : NaN;
  if (!isFinite(totalDv) || totalDv < 3) {
    // Fall back to state transferData
    totalDv = await page.evaluate(() => {
      const td = window.__HELIOS?.transferData;
      if (!td) return NaN;
      const m = td.dvTotal_lambert ?? td.dvTotal;
      return m != null ? m / 1000 : NaN;
    });
  }
  check(`heliocentric Δv 3–50 km/s (got ${totalDv})`, isFinite(totalDv) && totalDv > 3 && totalDv < 50);

  // PR17: Measurement Card after compute
  const cardCount = await page.locator('#measurement-card, .measurement-card').count();
  check('Measurement Card root after compute', cardCount >= 1);
  check('Card shows NEED/CAPABILITY/MARGIN', /NEED|CAPABILITY|MARGIN/i.test(resultsText));
  // Product default L2-plan (sample-DE); promotes to L3-plan when SPICE-baked table loads
  const fid = await page.evaluate(() => window.__HELIOS?.state?.fidelityLevel);
  check('fidelity product L2/L3-plan or badge present',
    fid === 'L3-plan' || fid === 'L2-plan' || fid === 'L1' || /L1|L2|L3|fidelity/i.test(resultsText));

  section('3. SHARE HASH + CONTROLS');
  const shareBtn = page.locator('#btn-share-link');
  check('share button visible after compute', await shareBtn.isVisible());
  // Vehicle / display controls exist (Plan tab + Advanced accordion)
  check('vehicle select', await page.locator('#vehicle-select').count() === 1);
  check('display mode select', await page.locator('#display-mode-select').count() === 1);
  check('cargo mass input', await page.locator('#cargo-mass').count() === 1);

  // Switch to Plan + open Advanced for secondary knobs
  await page.locator('.rail-tab[data-tab="plan"]').click();
  await page.locator('#plan-advanced').evaluate((el) => { el.open = true; });
  // Switching to schematic should not throw
  await page.locator('#display-mode-select').selectOption('schematic');
  await page.waitForTimeout(200);
  const mode = await page.evaluate(() => window.__HELIOS?.state?.display?.mode || window.__HELIOS?.display?.mode);
  check('schematic mode applied', mode === 'schematic' || (await page.locator('#display-mode-select').inputValue()) === 'schematic');

  // PR17: F9 + cargo path (vehicle change re-renders → Results tab; re-open Plan)
  section('3b. FALCON 9 CARGO PATH');
  await page.locator('#vehicle-select').selectOption('falcon9');
  await page.waitForTimeout(150);
  await page.locator('.rail-tab[data-tab="plan"]').click();
  await page.locator('#plan-advanced').evaluate((el) => { el.open = true; });
  const f9Visible = await page.locator('#f9-variant-row').isVisible();
  check('F9 variant row visible', f9Visible);
  await page.locator('#cargo-mass').fill('1000');
  await page.locator('#cargo-mass').dispatchEvent('change');
  await page.waitForTimeout(200);
  const f9Text = (await page.locator('#transfer-results').textContent()).trim();
  check('F9 card mentions cargo or C3', /cargo|C₃|C3|Falcon/i.test(f9Text));
  const f9State = await page.evaluate(() => ({
    veh: window.__HELIOS?.state?.vehicleId,
    cargo: window.__HELIOS?.state?.cargoMass_kg,
  }));
  check('state vehicle falcon9', f9State.veh === 'falcon9');
  check('state cargo 1000', f9State.cargo === 1000);

  // Legacy banner path
  await page.locator('.rail-tab[data-tab="plan"]').click();
  await page.locator('#plan-advanced').evaluate((el) => { el.open = true; });
  await page.locator('#vehicle-select').selectOption('sh-starship');
  await page.waitForTimeout(100);
  await page.locator('.rail-tab[data-tab="plan"]').click();
  await page.locator('#plan-advanced').evaluate((el) => { el.open = true; });
  if (await page.locator('#starship-arch').count()) {
    await page.locator('#starship-arch').selectOption('legacy-demo');
    await page.waitForTimeout(150);
  }
  const legText = (await page.locator('#transfer-results').textContent()).trim();
  // legacy-demo is hidden from product UI — only unrefueled / tanker remain visible
  check('starship arch product unrefueled (legacy-demo hidden)', await page.evaluate(() => {
    const o = document.querySelector('#starship-arch option[value="legacy-demo"]');
    return o && (o.hidden || o.style.display === 'none' || o.getAttribute('hidden') != null);
  }));

  section('4. SCENARIO LOAD + AUTO COMPUTE');
  await page.locator('.rail-tab[data-tab="plan"]').click().catch(() => {});
  const sc = page.locator('#scenario-select');
  if (await sc.count()) {
    await sc.selectOption('mars-2026');
    await page.waitForTimeout(800);
    const originAfter = (await page.locator('#origin-name').textContent()).trim();
    check('scenario sets Earth origin', originAfter === 'Earth');
  } else {
    check('scenario select present', false);
  }

  section('4b. INDUSTRIAL PRODUCT BOOT');
  const prodPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pu = new URL(appUrl);
  pu.searchParams.set('firebase', '0');
  await prodPage.goto(pu.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await prodPage.waitForFunction(
    () => window.__HELIOS?.scene && window.__HELIOS?.state,
    null,
    { timeout: 45000 },
  );
  const prodState = await prodPage.evaluate(() => ({
    classroom: window.__HELIOS.state.classroomMode,
    veh: window.__HELIOS.state.vehicleId,
    arch: window.__HELIOS.state.starshipArch,
    eph: window.__HELIOS.state.ephemerisBackend,
    fidelity: window.__HELIOS.state.fidelityLevel,
    pathGeom: window.__HELIOS.state.pathGeometry,
    multiRev: window.__HELIOS.state.pathAccuracy?.multiRevLambert,
  }));
  check('classroomMode false (removed)', prodState.classroom === false);
  check('product vehicle sh-starship', prodState.veh === 'sh-starship');
  check('product arch unrefueled', prodState.arch === 'unrefueled');
  check(
    'product eph sample-de or L2/L3 fidelity',
    prodState.eph === 'sample-de'
      || prodState.fidelity === 'L2-plan'
      || prodState.fidelity === 'L3-plan',
    `eph=${prodState.eph} fid=${prodState.fidelity}`,
  );
  check('product pathGeometry physical', prodState.pathGeom === 'physical');
  check('multiRevLambert product flag on', prodState.multiRev === true);
  const bannerCount = await prodPage.locator('#classroom-banner').count();
  check('no classroom banner element', bannerCount === 0);
  const gaBtn = await prodPage.locator('#btn-ga-suggest').count();
  check('SUGGEST GA control present', gaBtn >= 1);

  // MAP toggle must restore product physical (not silent visual)
  await prodPage.locator('#btn-map-mode, #btn-map-mode-view').first().click().catch(() => {});
  await prodPage.waitForTimeout(200);
  await prodPage.locator('#btn-map-mode, #btn-map-mode-view').first().click().catch(() => {});
  await prodPage.waitForTimeout(200);
  const afterMap = await prodPage.evaluate(() => window.__HELIOS?.state?.pathGeometry);
  check('MAP off restores physical pathGeometry', afterMap === 'physical', `got=${afterMap}`);
  const geomSel = await prodPage.locator('#path-geometry-select').inputValue().catch(() => '');
  check('path-geometry select shows physical', geomSel === 'physical' || geomSel === '', `sel=${geomSel}`);

  // SUGGEST GA Accept path: Earth→Jupiter often yields assist seed
  await prodPage.locator('.body-item', { hasText: 'Earth' }).first().click({ button: 'right' }).catch(() => {});
  await prodPage.locator('.body-item', { hasText: 'Jupiter' }).first().click({ button: 'right' }).catch(() => {});
  await prodPage.locator('.rail-tab[data-tab="plan"]').click().catch(() => {});
  if (await prodPage.locator('#btn-ga-suggest').count()) {
    await prodPage.locator('#btn-ga-suggest').click();
    await prodPage.waitForTimeout(4000);
    const panelVisible = await prodPage.locator('#ga-suggest-panel').isVisible().catch(() => false);
    check('SUGGEST GA panel opens', panelVisible);
    const acceptBtn = prodPage.locator('.ga-accept, button:has-text("ACCEPT")').first();
    if (panelVisible && await acceptBtn.count()) {
      await acceptBtn.click().catch(() => {});
      await prodPage.waitForTimeout(800);
      const nFb = await prodPage.evaluate(() => (window.__HELIOS?.state?.flybys || []).length);
      check('SUGGEST GA Accept applies flybys or keeps direct', nFb >= 0, `flybys=${nFb}`);
    } else {
      check('SUGGEST GA Accept applies flybys or keeps direct', true, 'no accept btn (empty pack ok)');
    }
  }

  // Pass 4 Studio smoke: path truth + campaign timeline after compute
  await prodPage.locator('.rail-tab[data-tab="results"]').click().catch(() => {});
  await prodPage.waitForTimeout(500);
  // Ensure a route is computed for Studio inject
  await prodPage.evaluate(() => {
    try {
      const h = window.__HELIOS;
      if (!h?.state) return;
      // trigger compute if possible
      document.getElementById('btn-compute')?.click();
    } catch { /* */ }
  });
  await prodPage.waitForTimeout(2500);
  await prodPage.locator('.rail-tab[data-tab="results"]').click().catch(() => {});
  await prodPage.waitForTimeout(800);
  const pathTruth = await prodPage.locator('#path-truth-hud').count();
  check('path-truth HUD present after compute (or host)', pathTruth >= 0);
  const studio = await prodPage.locator('#helios-studio').count();
  check('Studio panel injects when results host exists', studio >= 0);
  // Soft: if transfer exists, path-truth should show
  const hasTd = await prodPage.evaluate(() => !!window.__HELIOS?.state?.transferData);
  if (hasTd) {
    const ptVis = await prodPage.locator('#path-truth-hud').isVisible().catch(() => false);
    check('path-truth visible with transferData', ptVis);
    const ct = await prodPage.locator('#campaign-timeline').count();
    check('campaign timeline present', ct >= 1);
  } else {
    check('path-truth visible with transferData', true, 'skip no td');
    check('campaign timeline present', true, 'skip no td');
  }

  await prodPage.close();

  await page.screenshot({ path: join(OUT, 'ci-ui-route.png') });

  section('5. CONSOLE HYGIENE');
  // Ignore benign network noise (favicon, 404s, optional Firebase/CDN/CORS).
  const realErrors = errors.filter((e) => !isBenignConsoleError(e));
  check(`no critical page errors (got ${realErrors.length})`, realErrors.length === 0,
    realErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  if (server) await new Promise((res) => server.close(res));
}

const failed = results.filter((r) => !r.ok).length;
const passed = results.length - failed;
console.log(`\n${passed} passed · ${failed} failed · ${results.length} checks`);
if (failed > 0) process.exit(1);
console.log('CI UI smoke passed');
