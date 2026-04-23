// End-to-end UI + trajectory verification via Playwright. Covers:
//   (1) Every labelled UI element is present and visible
//   (2) Right-clicking body-list items populates origin/dest slots
//   (3) Compute Transfer fills the results panel with a plausible Δv
//   (4) The drawn trajectory line actually meets the destination planet's
//       rendered (wobbled, barycentric) position — to within 0.01 AU
//   (5) Porkchop plot opens, sweeps to 100%, reports a numeric min Δv
//   (6) Adding a flyby switches to multi-leg mode; SNAP button runs
//   (7) Sun wobble: sunMesh position is non-zero and tracks the offset function
//
// Relies on the window.__HELIOS test hook in index.html.

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const APP_URL = process.env.HELIOS_URL || 'http://localhost:35045/';
const OUT = new URL('./screenshots/', import.meta.url);
const errors = [], warnings = [], failedRequests = [];
const results = [];

function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '   ' + detail : ''}`);
}
function section(s) { console.log('\n━━━ ' + s + ' ━━━'); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
  else if (msg.type() === 'warning') warnings.push(msg.text());
});
page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
page.on('requestfailed', req => failedRequests.push(`${req.url()} — ${req.failure()?.errorText || '?'}`));

section('1. LOAD PAGE');
await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(() => window.__HELIOS && window.__HELIOS.scene && window.__HELIOS.bodyPositions.size >= 8, { timeout: 15000 });
console.log('  App booted, __HELIOS hook present, bodies loaded.');

section('2. UI ELEMENTS VISIBLE');
// Visible-when-populated elements (buttons, labels, containers with content):
const visibleIds = [
  'sim-date', 'sim-mjd', 'fps-display', 'cursor-coords',
  'left-panel', 'body-list', 'right-panel', 'body-info',
  'route-origin', 'route-dest', 'origin-name', 'dest-name',
  'depart-date', 'btn-use-sim', 'btn-use-optimal',
  'btn-snap-flybys', 'btn-add-flyby',
  'calc-route', 'find-windows', 'clear-route',
  'btn-rev-fast', 'btn-rev', 'btn-pause', 'btn-play', 'btn-fwd-fast',
  'time-speed', 'time-display', 'btn-today',
  'renderer-container',
];
// Empty-until-populated containers: only check they exist in the DOM.
const existsIds = ['flyby-list', 'transfer-results', 'mission-controls'];
for (const id of visibleIds) {
  const visible = await page.locator(`#${id}`).isVisible().catch(() => false);
  check(`#${id} visible`, visible);
}
for (const id of existsIds) {
  const count = await page.locator(`#${id}`).count();
  check(`#${id} exists (empty container)`, count === 1);
}

// Body list should have all 8 planets
const bodyNames = await page.locator('.body-item').allTextContents();
check('body-list contains Earth',   bodyNames.some(n => n.includes('Earth')));
check('body-list contains Mars',    bodyNames.some(n => n.includes('Mars')));
check('body-list contains Jupiter', bodyNames.some(n => n.includes('Jupiter')));

// Porkchop overlay should exist but not be visible initially
const pcOverlay = page.locator('#porkchop-overlay');
check('porkchop overlay exists',       await pcOverlay.count() === 1);
check('porkchop overlay hidden at boot', !(await pcOverlay.evaluate(el => el.classList.contains('visible'))));

section('3. ROUTE PLANNER — Earth → Mars via right-click');
await page.locator('.body-item', { hasText: 'Earth' }).click({ button: 'right' });
await page.locator('.body-item', { hasText: 'Mars' }).click({ button: 'right' });
const originName = await page.locator('#origin-name').textContent();
const destName   = await page.locator('#dest-name').textContent();
check(`origin = "${originName.trim()}"`, originName.trim() === 'Earth');
check(`dest   = "${destName.trim()}"`,   destName.trim() === 'Mars');

await page.locator('#calc-route').click();
await page.waitForTimeout(600);
const resultsText = (await page.locator('#transfer-results').textContent()).trim();
check('transfer-results populated',    resultsText.length > 50);
check('results mention Lambert',        /LAMBERT|HOHMANN/i.test(resultsText));
const dvMatch = resultsText.match(/Total\s*Δv\s*([\d.]+)\s*km\/s/);
const totalDv = dvMatch ? parseFloat(dvMatch[1]) : NaN;
check(`Total Δv plausible (3–50 km/s): ${isFinite(totalDv) ? totalDv.toFixed(2) + ' km/s' : 'MISSING'}`,
      isFinite(totalDv) && totalDv > 3 && totalDv < 50);

await page.screenshot({ path: new URL('pw-01-route.png', OUT).pathname });

section('4. TRAJECTORY ENDPOINT ALIGNMENT');
// Extract rendered positions of the arrival planet mesh AND the transfer
// line's last sampled point. In the barycentric scene frame they should
// coincide (to within a few hundredths of an AU — sample-discretization noise).
const alignment = await page.evaluate(() => {
  const H = window.__HELIOS;
  if (!H.transferLine || !H.transferData) return { ok: false, reason: 'no line' };
  const geo = H.transferLine.geometry;
  const pos = geo.attributes.position;
  const last = pos.count - 1;
  const lineEnd = { x: pos.getX(last), y: pos.getY(last), z: pos.getZ(last) };
  const lineStart = { x: pos.getX(0),  y: pos.getY(0),  z: pos.getZ(0) };
  const body2 = H.transferData.body2;
  const body1 = H.transferData.body1;
  const arrMesh = H.planetMeshes.get(body2.name);
  const depMesh = H.planetMeshes.get(body1.name);
  // Where the arrival planet WILL BE at arrival time (vs current position)
  const arrT = H.transferData.arrivalSimTime;
  const depT = H.transferData.departureSimTime;
  const arrHelio = H.getBodyPosition3D(body2, arrT, true);
  const arrOff = H.getSunBarycentricOffset(arrT);
  const arrExpected = { x: arrHelio.x + arrOff.x, y: arrHelio.y + arrOff.y, z: arrHelio.z + arrOff.z };
  const depHelio = H.getBodyPosition3D(body1, depT, true);
  const depOff = H.getSunBarycentricOffset(depT);
  const depExpected = { x: depHelio.x + depOff.x, y: depHelio.y + depOff.y, z: depHelio.z + depOff.z };
  const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
  return {
    ok: true,
    lineEnd, lineStart,
    arrExpected, depExpected,
    arrMeshPos: { x: arrMesh.position.x, y: arrMesh.position.y, z: arrMesh.position.z },
    depMeshPos: { x: depMesh.position.x, y: depMesh.position.y, z: depMesh.position.z },
    endToArrExpected: dist(lineEnd, arrExpected),
    startToDepExpected: dist(lineStart, depExpected),
  };
});
if (!alignment.ok) { check('alignment extract', false, alignment.reason); }
else {
  console.log(`  line end  (${alignment.lineEnd.x.toFixed(3)}, ${alignment.lineEnd.y.toFixed(3)}, ${alignment.lineEnd.z.toFixed(3)}) AU`);
  console.log(`  arr expected (at arrival time, barycentric): (${alignment.arrExpected.x.toFixed(3)}, ${alignment.arrExpected.y.toFixed(3)}, ${alignment.arrExpected.z.toFixed(3)}) AU`);
  console.log(`  line start (${alignment.lineStart.x.toFixed(3)}, ${alignment.lineStart.y.toFixed(3)}, ${alignment.lineStart.z.toFixed(3)}) AU`);
  console.log(`  dep expected: (${alignment.depExpected.x.toFixed(3)}, ${alignment.depExpected.y.toFixed(3)}, ${alignment.depExpected.z.toFixed(3)}) AU`);
  check(`line end meets arrival planet at arrival time (<0.02 AU)`, alignment.endToArrExpected < 0.02, `Δ=${alignment.endToArrExpected.toFixed(4)} AU`);
  check(`line start at departure planet at departure time (<0.02 AU)`, alignment.startToDepExpected < 0.02, `Δ=${alignment.startToDepExpected.toFixed(4)} AU`);
}

section('5. PORKCHOP PLOT');
await page.locator('#find-windows').click();
await page.waitForFunction(() => document.getElementById('porkchop-overlay').classList.contains('visible'));
check('porkchop opens', true);
await page.waitForFunction(() => document.getElementById('pc-progress-fill').style.width === '100%', { timeout: 20000 });
const pcDv = (await page.locator('#pc-dv').textContent()).trim();
const pcDepart = (await page.locator('#pc-depart').textContent()).trim();
check(`porkchop min Δv reported: ${pcDv}`,  /^[0-9.]+ km\/s$/.test(pcDv));
check(`porkchop depart date reported: ${pcDepart}`, pcDepart.length > 5 && pcDepart !== '—');
await page.screenshot({ path: new URL('pw-02-porkchop.png', OUT).pathname });
await page.locator('#pc-close').click();

section('6. FLYBY + SNAP');
await page.locator('#btn-add-flyby').click();
await page.waitForSelector('.flyby-row', { timeout: 5000 });
check('flyby row appears', true);
// Dispatch change via the app's event handler
await page.evaluate(() => {
  const sel = document.querySelector('.flyby-row .flyby-body');
  sel.value = 'Venus';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.locator('#calc-route').click();
await page.waitForTimeout(400);
const multiText = (await page.locator('#transfer-results').textContent()).trim();
check('multi-leg panel renders', /MULTI-LEG|Flyby/i.test(multiText));
// SNAP should be clickable and not throw
const preFlybyDate = await page.locator('.flyby-row .flyby-date').inputValue();
await page.locator('#btn-snap-flybys').click();
await page.waitForTimeout(1500);
const postFlybyDate = await page.locator('.flyby-row .flyby-date').inputValue();
console.log(`  flyby date: before="${preFlybyDate}"  after="${postFlybyDate}"`);
check('SNAP button invoked without error',     errors.filter(e => !e.includes('404')).length === 0);
await page.screenshot({ path: new URL('pw-03-flyby-snap.png', OUT).pathname });

section('7. SUN WOBBLE — mesh position ≠ 0');
const wob = await page.evaluate(() => {
  const H = window.__HELIOS;
  const sp = H.sunMesh.position;
  const off = H.getSunBarycentricOffset(H.timeState.simTime);
  const off0 = H.getSunBarycentricOffset(H.timeState.simTime, false);
  return {
    sunPos: { x: sp.x, y: sp.y, z: sp.z },
    exaggeratedOff: off,
    physicalOff: off0,
    exaggeration: H.SUN_WOBBLE_EXAGGERATION,
  };
});
const sunMag = Math.hypot(wob.sunPos.x, wob.sunPos.y, wob.sunPos.z);
const physMag = Math.hypot(wob.physicalOff.x, wob.physicalOff.y, wob.physicalOff.z);
console.log(`  sunMesh.position: (${wob.sunPos.x.toFixed(4)}, ${wob.sunPos.y.toFixed(4)}, ${wob.sunPos.z.toFixed(4)}) AU   |r|=${sunMag.toFixed(4)}`);
console.log(`  physical wobble |r|=${physMag.toFixed(6)} AU   exaggeration=×${wob.exaggeration}`);
check('sunMesh is displaced from origin (barycentric frame active)', sunMag > 0.0001);
check('sunMesh matches getSunBarycentricOffset output',
      Math.abs(sunMag - physMag * wob.exaggeration) / sunMag < 0.01);

section('8. GRAVITATIONAL FIELD FX');
// Toggle buttons exist and are off by default
const potBtn  = page.locator('#fx-potential');
const hillBtn = page.locator('#fx-hill');
check('potential-well toggle exists', await potBtn.count() === 1);
check('hill-sphere toggle exists',     await hillBtn.count() === 1);
const preFx = await page.evaluate(() => ({
  potentialVisible: window.__HELIOS.potentialMesh.visible,
  hillAnyVisible: [...window.__HELIOS.hillMeshes.values()].some(h => h.mesh.visible),
}));
check('potential mesh hidden by default', preFx.potentialVisible === false);
check('hill spheres hidden by default',    preFx.hillAnyVisible === false);

// Turn them on
await potBtn.click();
await hillBtn.click();
await page.waitForTimeout(300);
const fxOn = await page.evaluate(() => {
  const H = window.__HELIOS;
  // Full sweep so we find the actual deepest vertex (near the Sun well)
  const pos = H.potentialMesh.geometry.attributes.position;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const hills = [...H.hillMeshes.entries()].map(([name, h]) => ({
    name, visible: h.mesh.visible, rHillAU: h.rHillAU,
    pos: { x: h.mesh.position.x, z: h.mesh.position.z },
  }));
  return {
    potentialVisible: H.potentialMesh.visible,
    potentialMinY: minY, potentialMaxY: maxY,
    hills,
  };
});
check('potential mesh now visible', fxOn.potentialVisible === true);
check(`potential mesh has Sun-scale depth (min y ≈ ${fxOn.potentialMinY.toFixed(2)} AU)`, fxOn.potentialMinY < -3);
check('hill spheres all visible', fxOn.hills.every(h => h.visible));
const jup = fxOn.hills.find(h => h.name === 'Jupiter');
const merc = fxOn.hills.find(h => h.name === 'Mercury');
check(`Jupiter Hill radius ≈ 0.35 AU: ${jup.rHillAU.toFixed(4)}`, Math.abs(jup.rHillAU - 0.35) < 0.05);
check(`Mercury Hill radius ≈ 0.001 AU: ${merc.rHillAU.toExponential(2)}`, merc.rHillAU < 0.003 && merc.rHillAU > 0.0003);
// Hill spheres track their planets (compare center to bodyPositions)
const tracking = await page.evaluate(() => {
  const H = window.__HELIOS;
  const result = {};
  for (const [name, h] of H.hillMeshes) {
    const p = H.bodyPositions.get(name);
    const d = Math.hypot(h.mesh.position.x - p.x, h.mesh.position.z - p.z);
    result[name] = d;
  }
  return result;
});
check('all Hill spheres centered on their planets (<1e-6 AU)',
      Object.values(tracking).every(d => d < 1e-6));

await page.screenshot({ path: new URL('pw-04-fx-on.png', OUT).pathname });

// Toggle off — both meshes should hide again
await potBtn.click();
await hillBtn.click();
await page.waitForTimeout(200);
const fxOff = await page.evaluate(() => ({
  potentialVisible: window.__HELIOS.potentialMesh.visible,
  hillAnyVisible: [...window.__HELIOS.hillMeshes.values()].some(h => h.mesh.visible),
}));
check('potential mesh hidden after 2nd click', fxOff.potentialVisible === false);
check('hill spheres hidden after 2nd click',    fxOff.hillAnyVisible === false);

section('SUMMARY');
const passed = results.filter(r => r.ok).length;
const failed = results.length - passed;
console.log(`\n${passed} passed · ${failed} failed · ${results.length} checks total`);
console.log(`console errors: ${errors.length}   warnings: ${warnings.length}   failed requests: ${failedRequests.length}`);
const realErrors = errors.filter(e => !e.includes('404'));
if (realErrors.length) { console.log('\nREAL ERRORS:'); realErrors.forEach(e => console.log('  ' + e)); }

writeFileSync(new URL('_pw-report.txt', OUT).pathname,
  results.map(r => `${r.ok?'PASS':'FAIL'}  ${r.label}  ${r.detail||''}`).join('\n') +
  '\n\nERRORS:\n' + errors.join('\n'));

await browser.close();
process.exit(failed === 0 ? 0 : 1);
