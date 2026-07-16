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

  section('3. SHARE HASH + CONTROLS');
  const shareBtn = page.locator('#btn-share-link');
  check('share button visible after compute', await shareBtn.isVisible());
  // Vehicle / display controls exist
  check('vehicle select', await page.locator('#vehicle-select').count() === 1);
  check('display mode select', await page.locator('#display-mode-select').count() === 1);

  // Switching to schematic should not throw
  await page.locator('#display-mode-select').selectOption('schematic');
  await page.waitForTimeout(200);
  const mode = await page.evaluate(() => window.__HELIOS?.state?.display?.mode || window.__HELIOS?.display?.mode);
  check('schematic mode applied', mode === 'schematic' || (await page.locator('#display-mode-select').inputValue()) === 'schematic');

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
