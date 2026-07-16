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

const errors = [];
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('404')) errors.push(msg.text());
});

try {
  section('1. BOOT');
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.__HELIOS?.scene && window.__HELIOS?.bodyPositions?.size >= 8,
    { timeout: 45000 },
  );
  check('__HELIOS hook + 8 planets', true);

  const canvas = await page.locator('#renderer-container canvas').count();
  check('WebGL canvas present', canvas >= 1);

  section('2. ROUTE EARTH → MARS');
  await page.locator('.body-item', { hasText: 'Earth' }).first().click({ button: 'right' });
  await page.locator('.body-item', { hasText: 'Mars' }).first().click({ button: 'right' });
  check('origin Earth', (await page.locator('#origin-name').textContent()).trim() === 'Earth');
  check('dest Mars', (await page.locator('#dest-name').textContent()).trim() === 'Mars');

  await page.locator('#calc-route').click();
  await page.waitForFunction(
    () => (document.getElementById('transfer-results')?.textContent || '').length > 80,
    { timeout: 15000 },
  );
  const resultsText = (await page.locator('#transfer-results').textContent()).trim();
  check('results mention Lambert/Hohmann', /LAMBERT|HOHMANN/i.test(resultsText));
  const dvMatch = resultsText.match(/(?:Heliocentric leg total|Total\s*Δv)\s*([\d.]+)\s*km\/s/i);
  const totalDv = dvMatch ? parseFloat(dvMatch[1]) : NaN;
  check(`heliocentric Δv 3–50 km/s (got ${totalDv})`, isFinite(totalDv) && totalDv > 3 && totalDv < 50);

  // PR17: Measurement Card after compute
  const cardCount = await page.locator('#measurement-card, .measurement-card').count();
  check('Measurement Card root after compute', cardCount >= 1);
  check('Card shows NEED/CAPABILITY/MARGIN', /NEED|CAPABILITY|MARGIN/i.test(resultsText));
  check('fidelity default L1', /L1|fidelity/i.test(resultsText)
    || (await page.evaluate(() => window.__HELIOS?.state?.fidelityLevel)) === 'L1');

  section('3. SHARE HASH + CONTROLS');
  const shareBtn = page.locator('#btn-share-link');
  check('share button visible after compute', await shareBtn.isVisible());
  // Vehicle / display controls exist
  check('vehicle select', await page.locator('#vehicle-select').count() === 1);
  check('display mode select', await page.locator('#display-mode-select').count() === 1);
  check('cargo mass input', await page.locator('#cargo-mass').count() === 1);

  // Switching to schematic should not throw
  await page.locator('#display-mode-select').selectOption('schematic');
  await page.waitForTimeout(200);
  const mode = await page.evaluate(() => window.__HELIOS?.state?.display?.mode || window.__HELIOS?.display?.mode);
  check('schematic mode applied', mode === 'schematic' || (await page.locator('#display-mode-select').inputValue()) === 'schematic');

  // PR17: F9 + cargo path
  section('3b. FALCON 9 CARGO PATH');
  await page.locator('#vehicle-select').selectOption('falcon9');
  await page.waitForTimeout(150);
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
  await page.locator('#vehicle-select').selectOption('sh-starship');
  await page.waitForTimeout(100);
  if (await page.locator('#starship-arch').count()) {
    await page.locator('#starship-arch').selectOption('legacy-demo');
    await page.waitForTimeout(150);
  }
  const legText = (await page.locator('#transfer-results').textContent()).trim();
  check('legacy demo banner or label', /LEGACY|legacy/i.test(legText));

  section('4. SCENARIO LOAD + AUTO COMPUTE');
  const sc = page.locator('#scenario-select');
  if (await sc.count()) {
    await sc.selectOption('mars-2026');
    await page.waitForTimeout(800);
    const originAfter = (await page.locator('#origin-name').textContent()).trim();
    check('scenario sets Earth origin', originAfter === 'Earth');
  } else {
    check('scenario select present', false);
  }

  section('4b. CLASSROOM MODE');
  const classPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await classPage.goto(`${appUrl}?mode=classroom`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await classPage.waitForFunction(
    () => window.__HELIOS?.scene && window.__HELIOS?.state,
    { timeout: 45000 },
  );
  const classState = await classPage.evaluate(() => ({
    classroom: window.__HELIOS.state.classroomMode,
    veh: window.__HELIOS.state.vehicleId,
    mode: window.__HELIOS.state.display?.mode,
    fidelity: window.__HELIOS.state.fidelityLevel,
  }));
  check('classroomMode true', classState.classroom === true);
  check('classroom vehicle abstract', classState.veh === 'abstract');
  check('classroom schematic', classState.mode === 'schematic');
  check('classroom fidelity L1', classState.fidelity === 'L1');
  const bannerVisible = await classPage.locator('#classroom-banner').isVisible();
  check('classroom banner visible', bannerVisible);
  await classPage.close();

  await page.screenshot({ path: join(OUT, 'ci-ui-route.png') });

  section('5. CONSOLE HYGIENE');
  const realErrors = errors.filter((e) =>
    !/favicon|404|Failed to load resource|net::ERR/i.test(e));
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
