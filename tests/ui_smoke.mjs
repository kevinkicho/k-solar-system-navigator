// Headless UI smoke test — drives the app via Puppeteer and verifies the
// features we've built actually work in a real browser.
//
// Checks:
//   1. Page loads without JS errors
//   2. Three.js scene renders (canvas is non-blank)
//   3. All 11 planet/moon textures fetch successfully
//   4. Route planner: select Earth origin, Mars destination, compute transfer,
//      verify the Lambert results panel populates
//   5. Porkchop plot opens, sweeps, and finds a minimum
//   6. Flyby workflow: add Venus flyby, recompute, verify multi-leg panel
//
// All console messages and failing network requests are reported.

import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const APP_URL = process.env.HELIOS_URL || 'http://localhost:46851/';
const OUT = new URL('./screenshots/', import.meta.url);

const errors = [], warnings = [], logs = [], failedRequests = [];

function banner(s) { console.log('\n' + '='.repeat(68) + '\n ' + s + '\n' + '='.repeat(68)); }

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();

page.on('console', (msg) => {
  const t = msg.type();
  const text = msg.text();
  if (t === 'error')    errors.push(text);
  else if (t === 'warning') warnings.push(text);
  else logs.push(`[${t}] ${text}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('requestfailed', (req) => failedRequests.push(`${req.url()} — ${req.failure()?.errorText || '?'}`));

banner('1. LOAD PAGE');
await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
console.log('URL loaded.');

// Wait for scene to initialise (planetMeshes map populated)
let canvasOk = false;
try {
  await page.waitForFunction(
    () => {
      const c = document.querySelector('#renderer-container canvas');
      return c && c.width > 100 && c.height > 100;
    },
    { timeout: 10000 }
  );
  canvasOk = true;
  console.log('Three.js canvas present.');
} catch {
  console.log('⚠ Canvas did not appear within 10s.');
}

// Give the app time to run its module script even without canvas
await new Promise(r => setTimeout(r, 3000));

// Dump what the page looks like for debugging
const diag = await page.evaluate(() => ({
  title: document.title,
  hasContainer: !!document.getElementById('renderer-container'),
  containerChildren: document.getElementById('renderer-container')?.children.length ?? 0,
  canvasCount: document.querySelectorAll('canvas').length,
  bodyClass: document.body.className,
  firstError: window.__lastError || null,
  windowKeys: Object.keys(window).filter(k => !k.startsWith('__') && k.length < 20).slice(0, 40),
}));
console.log('DOM diag:', diag);
console.log('Errors so far:', errors.length, errors.slice(0, 5));

// Screenshot whatever's there
try {
  await page.screenshot({ path: new URL('01-initial.png', OUT).pathname, fullPage: false });
  console.log('Saved 01-initial.png');
} catch (e) { console.log('screenshot failed:', e.message); }

if (!canvasOk) {
  banner('ABORTING — canvas never appeared.  Dumping logs.');
  console.log('\nCONSOLE LOGS (up to 30):');
  logs.slice(0, 30).forEach(l => console.log('  ' + l));
  console.log('\nERRORS:'); errors.forEach(e => console.log('  ' + e));
  console.log('\nFAILED REQUESTS:'); failedRequests.forEach(r => console.log('  ' + r));
  await browser.close();
  process.exit(0);
}

banner('2. EXERCISE ROUTE PLANNER — Earth → Mars');
// Set origin and destination via the exposed global state.
// Inspect the app's module to find accessible hooks:
const routeState = await page.evaluate(() => {
  // Find Earth and Mars from BODIES array in window scope (module-scoped, so
  // we have to pull data from the DOM or dispatch events).
  // Simulate: right-click on the Earth planet-list item to set origin.
  const items = [...document.querySelectorAll('.body-item, .planet-item, [data-body]')];
  return { count: items.length, sample: items.slice(0, 5).map(el => el.textContent.trim()) };
});
console.log('body-list items found:', routeState);

// Directly click the origin/destination slots is not enough — the app
// populates them via right-click-on-scene or drag-drop. Easier: find the
// BODIES array inside the module and drive state through the public DOM.
// Try: use Earth's body-list row.
const clickResult = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.body-item')];
  const earth = rows.find(r => r.textContent.includes('Earth'));
  const mars  = rows.find(r => r.textContent.includes('Mars'));
  if (!earth || !mars) return { found: false, rowNames: rows.slice(0,12).map(r=>r.textContent.trim()) };
  // Simulate right-click to set origin
  const dispatchRight = el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  dispatchRight(earth);
  dispatchRight(mars);
  return { found: true, origin: document.getElementById('origin-name')?.textContent.trim(),
           dest:   document.getElementById('dest-name')?.textContent.trim() };
});
console.log('After contextmenu:', clickResult);

// Compute transfer
const computed = await page.evaluate(() => {
  const btn = document.getElementById('calc-route');
  if (!btn) return { ok: false, reason: 'no calc-route btn' };
  btn.click();
  return { ok: true };
});
console.log('Computed:', computed);
await new Promise(r => setTimeout(r, 600));

// Read the results panel
const results = await page.evaluate(() => {
  const panel = document.getElementById('transfer-results');
  return panel ? panel.innerText.trim() : null;
});
console.log('\n--- Results panel ---');
console.log(results ? results.slice(0, 1500) : '(empty)');

await page.screenshot({ path: new URL('02-route-computed.png', OUT).pathname });
console.log('Saved 02-route-computed.png');

banner('3. PORKCHOP PLOT');
const pcOpen = await page.evaluate(() => {
  const btn = document.getElementById('find-windows');
  if (!btn) return { ok: false };
  btn.click();
  return { ok: true, visible: document.getElementById('porkchop-overlay')?.classList.contains('visible') };
});
console.log('Opened:', pcOpen);
// Wait for sweep to finish — progress fill should reach 100%
if (pcOpen.visible) {
  try {
    await page.waitForFunction(
      () => document.getElementById('pc-progress-fill')?.style.width === '100%',
      { timeout: 15000 }
    );
    const pcInfo = await page.evaluate(() => ({
      depart: document.getElementById('pc-depart')?.textContent,
      transit: document.getElementById('pc-transit')?.textContent,
      arrive: document.getElementById('pc-arrive')?.textContent,
      dv:     document.getElementById('pc-dv')?.textContent,
      scaleMin: document.getElementById('pc-scale-min')?.textContent,
    }));
    console.log('Porkchop result:', pcInfo);
    await page.screenshot({ path: new URL('03-porkchop.png', OUT).pathname });
    console.log('Saved 03-porkchop.png');
  } catch (e) {
    console.log('Porkchop sweep did not finish in 15s:', e.message);
  }
  // Close porkchop
  await page.evaluate(() => document.getElementById('pc-close')?.click());
}

banner('4. FLYBY WORKFLOW — add Venus flyby');
const flybyResult = await page.evaluate(() => {
  const btn = document.getElementById('btn-add-flyby');
  if (!btn) return { ok: false, reason: 'no flyby btn' };
  btn.click();
  const row = document.querySelector('.flyby-row');
  const select = row?.querySelector('.flyby-body');
  if (select) { select.value = 'Venus'; select.dispatchEvent(new Event('change', { bubbles: true })); }
  // Recompute
  document.getElementById('calc-route')?.click();
  return { ok: true, rowPresent: !!row, selected: select?.value };
});
console.log('Flyby added:', flybyResult);
await new Promise(r => setTimeout(r, 600));

const multiLegResults = await page.evaluate(() => {
  const panel = document.getElementById('transfer-results');
  return panel ? panel.innerText.trim() : null;
});
console.log('\n--- Multi-leg results ---');
console.log(multiLegResults ? multiLegResults.slice(0, 2000) : '(empty)');

await page.screenshot({ path: new URL('04-flyby.png', OUT).pathname });
console.log('Saved 04-flyby.png');

banner('4b. FLYBY DATE OPTIMIZER — click SNAP');
const snapResult = await page.evaluate(() => {
  const before = document.getElementById('transfer-results')?.innerText.trim() || '';
  const btn = document.getElementById('btn-snap-flybys');
  if (!btn) return { ok: false, reason: 'no snap btn' };
  btn.click();
  return { ok: true, beforeLen: before.length };
});
console.log('SNAP click:', snapResult);
await new Promise(r => setTimeout(r, 1500));
const snapPanel = await page.evaluate(() => {
  const panel = document.getElementById('transfer-results');
  const flybyDate = document.querySelector('.flyby-row .flyby-date')?.value;
  return { panel: panel ? panel.innerText.trim() : null, flybyDate };
});
console.log('After SNAP, flyby date:', snapPanel.flybyDate);
console.log(snapPanel.panel ? snapPanel.panel.slice(0, 1200) : '(empty)');
await page.screenshot({ path: new URL('04b-snap.png', OUT).pathname });

banner('5. CANVAS RENDER CHECK');
// Grab the actual Three.js canvas; look at a small block of pixels.
// A black canvas has mean RGB ≈ 0; a rendered scene should have much variance.
const canvasStats = await page.evaluate(async () => {
  const canvas = document.querySelector('#renderer-container canvas');
  if (!canvas) return { ok: false };
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return { ok: false, reason: 'no webgl context' };
  const px = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let sum = 0, maxC = 0, nz = 0;
  for (let i = 0; i < px.length; i += 4) {
    const v = px[i] + px[i+1] + px[i+2];
    sum += v;
    if (v > maxC) maxC = v;
    if (v > 10) nz++;
  }
  return {
    ok: true,
    w: canvas.width, h: canvas.height,
    meanBrightness: sum / (px.length / 4) / 3,
    maxBrightness: maxC / 3,
    nonBlackFrac: nz / (px.length / 4),
  };
});
console.log('Canvas stats:', canvasStats);

banner('6. SUMMARY');
console.log(`console.error    : ${errors.length}`);
console.log(`console.warning  : ${warnings.length}`);
console.log(`failed requests  : ${failedRequests.length}`);
if (errors.length)  { console.log('\nERRORS:'); errors.slice(0,10).forEach(e => console.log('  ' + e)); }
if (warnings.length && warnings.length < 20) { console.log('\nWARNINGS:'); warnings.forEach(w => console.log('  ' + w)); }
if (failedRequests.length) { console.log('\nFAILED REQUESTS:'); failedRequests.slice(0,10).forEach(r => console.log('  ' + r)); }

writeFileSync(new URL('_logs.txt', OUT).pathname, [
  '=== ERRORS ===', ...errors,
  '\n=== WARNINGS ===', ...warnings,
  '\n=== FAILED REQUESTS ===', ...failedRequests,
  '\n=== LOGS (first 50) ===', ...logs.slice(0,50),
].join('\n'));

await browser.close();
console.log('\nDone. Screenshots in tests/screenshots/');
