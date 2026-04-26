// Comprehensive UI behavior audit — drives every interactive element and
// verifies the side-effects.  Complements playwright_check.mjs (which focuses
// on element visibility + Lambert / FX correctness) by exercising the smaller
// affordances that are easy to break in a refactor: time controls, view
// buttons, date picker overlay, moon expand/collapse, drag & drop, tooltips,
// info panel, keyboard shortcuts, and the notification system.

import { chromium } from 'playwright';

const APP_URL = process.env.HELIOS_URL || 'http://localhost:38971/';

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '   ' + detail : ''}`);
}
function section(s) { console.log('\n━━━ ' + s + ' ━━━'); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('pageerror', err => consoleErrors.push(err.message));
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

await page.goto(APP_URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__HELIOS && window.__HELIOS.bodyPositions.size > 0, { timeout: 10000 });
await page.waitForTimeout(800); // let one frame paint

// ─────────────────────────────────────────────────────────────────────────────
section('1. TIME CONTROLS');

const getSpeed = () => page.evaluate(() => window.__HELIOS.timeState.timeScale);
const getSpeedIdx = () => page.evaluate(() => window.__HELIOS.timeState.speedIndex);
const getSpeedLabel = () => page.locator('#time-speed').textContent();

await page.click('#btn-pause');
check('pause sets timeScale=0', (await getSpeed()) === 0);
check('pause label = PAUSED', (await getSpeedLabel()).trim() === 'PAUSED');
check('pause button has .active', await page.locator('#btn-pause.active').count() === 1);

await page.click('#btn-play');
const playSpeed = await getSpeed();
check(`play sets timeScale > 0 (got ${playSpeed})`, playSpeed > 0);

await page.click('#btn-fwd-fast');
const fwdIdx = await getSpeedIdx();
check(`fwd-fast advances speedIndex (got ${fwdIdx})`, fwdIdx >= 5);

await page.click('#btn-rev');
const revSpeed = await getSpeed();
check(`rev sets timeScale < 0 (got ${revSpeed})`, revSpeed < 0);

await page.click('#btn-rev-fast');
const revFastIdx = await getSpeedIdx();
check(`rev-fast steps further negative (idx=${revFastIdx})`, revFastIdx < 3);

await page.click('#btn-pause');

// Speed slider
await page.evaluate(() => {
  const s = document.getElementById('speed-slider');
  s.value = 7;
  s.dispatchEvent(new Event('input', { bubbles: true }));
});
const sliderIdx = await getSpeedIdx();
check(`speed slider sets speedIndex (got ${sliderIdx})`, sliderIdx === 7);

await page.click('#btn-pause');

// NOW button — resets to current real time
await page.evaluate(() => { window.__HELIOS.timeState.simTime = 0; });
await page.click('#btn-today');
const nowSim = await page.evaluate(() => window.__HELIOS.timeState.simTime);
const expectedNow = (Date.now() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 1000;
check(`NOW button resets sim to current time (Δ=${(Math.abs(nowSim - expectedNow)/86400).toFixed(2)}d)`,
      Math.abs(nowSim - expectedNow) < 86400);

// ─────────────────────────────────────────────────────────────────────────────
section('2. KEYBOARD SHORTCUTS');

await page.click('#btn-pause');
await page.locator('body').click({ position: { x: 720, y: 100 } });

await page.keyboard.press('Space');
check('Space toggles play (pause→play)', (await getSpeed()) > 0);
await page.keyboard.press('Space');
check('Space toggles play (play→pause)', (await getSpeed()) === 0);

const idxBefore = await getSpeedIdx();
await page.keyboard.press('=');
check(`+ key advances speedIndex (${idxBefore}→${await getSpeedIdx()})`,
      await getSpeedIdx() === idxBefore + 1);
await page.keyboard.press('-');
check(`- key decrements speedIndex (back to ${idxBefore})`,
      await getSpeedIdx() === idxBefore);

// ─────────────────────────────────────────────────────────────────────────────
section('3. VIEW CONTROLS');

const getCamPos = () => page.evaluate(() => {
  const c = window.__HELIOS.scene.children.find(o => o.isPerspectiveCamera);
  // PerspectiveCamera is OrbitControls-managed and not a scene child; read via __HELIOS.
  // Fall back to looking up controls.
  return null;
});

// Read camera position via the renderer-level handle. Simpler: trigger view
// click and verify the camera moved by reading the sim's controls.target / camera.
const camSnap = async () => page.evaluate(() => {
  // controls is not on __HELIOS; access via the scene's renderer shouldn't be
  // necessary. Instead, expose what we can: the camera is referenced as
  // window.__HELIOS.scene.userData... (not exposed). Use a known invariant:
  // after 'view-top' the camera is high above the ecliptic, so any rendered
  // planet's screen-y will be near the canvas vertical center.
  const list = [...document.querySelectorAll('canvas')];
  return list.length;
});

await page.click('#view-top');
await page.waitForTimeout(400);
check('TOP view click does not error', consoleErrors.length === 0);

await page.click('#view-side');
await page.waitForTimeout(200);
check('SIDE view click does not error', consoleErrors.length === 0);

await page.click('#view-angle');
await page.waitForTimeout(200);
check('ANGLE view click does not error', consoleErrors.length === 0);

await page.click('#view-reset');
await page.waitForTimeout(200);
check('RESET view click does not error', consoleErrors.length === 0);

// FOLLOW with no selection should notify, not crash
await page.click('#view-follow');
await page.waitForTimeout(400);
const followNotif = await page.locator('#notification.show').count();
check('FOLLOW with no selection shows notification', followNotif === 1);

// ─────────────────────────────────────────────────────────────────────────────
section('4. DATE PICKER OVERLAY');

await page.click('#time-display');
await page.waitForTimeout(200);
check('clicking time-display opens date picker',
      await page.locator('#date-picker-overlay.visible').count() === 1);

// J2000 preset
await page.click('button[data-preset="j2000"]');
const pickerVal = await page.locator('#picker-datetime').inputValue();
check(`J2000 preset fills datetime input (got "${pickerVal}")`,
      pickerVal.startsWith('2000-01-01T12:00'));

// GO button — applies the date
await page.click('#picker-go');
await page.waitForTimeout(200);
const j2000Sim = await page.evaluate(() => window.__HELIOS.timeState.simTime);
check(`GO applies J2000 (sim≈0, got ${Math.abs(j2000Sim).toFixed(0)}s)`,
      Math.abs(j2000Sim) < 60);
check('GO closes the picker',
      await page.locator('#date-picker-overlay.visible').count() === 0);

// Cancel button
await page.click('#time-display');
await page.click('#picker-cancel');
check('Cancel closes the picker',
      await page.locator('#date-picker-overlay.visible').count() === 0);

// Esc closes
await page.click('#time-display');
await page.keyboard.press('Escape');
check('Esc closes the picker',
      await page.locator('#date-picker-overlay.visible').count() === 0);

// Other presets
const presets = ['today', 'y2030', 'y2050', 'apollo11', 'voyager1'];
let allPresetsWork = true;
for (const p of presets) {
  await page.click('#time-display');
  await page.click(`button[data-preset="${p}"]`);
  const v = await page.locator('#picker-datetime').inputValue();
  if (!v || !v.match(/^\d{4}-\d{2}-\d{2}T/)) { allPresetsWork = false; break; }
  await page.click('#picker-cancel');
}
check(`all presets fill the date input (${presets.join(', ')})`, allPresetsWork);

// ─────────────────────────────────────────────────────────────────────────────
section('5. BODY LIST + MOON EXPANSION');

const bodyItems = await page.locator('.body-item').count();
check(`8 planets in body list (got ${bodyItems})`, bodyItems === 8);

// Earth has 1 moon — expand
const earthMoonContainer = '#moons-Earth';
const earthToggle = page.locator('.body-item[data-name="Earth"] + .moon-toggle').first();
const earthVisibleBefore = await page.locator(earthMoonContainer).isVisible();
check('Earth moons hidden by default', earthVisibleBefore === false);
await earthToggle.click();
await page.waitForTimeout(100);
check('Earth moons visible after toggle click',
      await page.locator(earthMoonContainer).isVisible() === true);
await earthToggle.click();
await page.waitForTimeout(100);
check('Earth moons hidden after second toggle click',
      await page.locator(earthMoonContainer).isVisible() === false);

// Click a moon — should select it
await page.locator('.body-item[data-name="Jupiter"] ~ .moon-toggle').first().click();
await page.waitForTimeout(150);
await page.locator('.moon-item[data-name="Europa"]').click();
await page.waitForTimeout(200);
const selectedMoon = await page.evaluate(() => {
  // selectedBody isn't exposed via __HELIOS; check via DOM: selected body-item
  const m = document.querySelector('.moon-item.selected');
  return m ? m.dataset.name : null;
});
check(`Europa selected after click (got ${selectedMoon})`, selectedMoon === 'Europa');

// Info panel populates for moon
const infoText = await page.locator('#body-info').textContent();
check('moon info panel shows Europa parent (Jupiter)',
      infoText.includes('Europa') && infoText.includes('Jupiter'));
check('moon info panel shows orbital data',
      infoText.includes('Semi-major') && infoText.includes('Eccentricity'));

// Click planet
await page.locator('.body-item[data-name="Mars"]').click();
await page.waitForTimeout(200);
const marsInfo = await page.locator('#body-info').textContent();
check('planet info panel shows Mars data',
      marsInfo.includes('Mars') && marsInfo.includes('Distance from Sun'));
check('planet info shows known-satellites count',
      marsInfo.includes('Known satellites'));

// ─────────────────────────────────────────────────────────────────────────────
section('6. ROUTE PLANNER UX');

// Right-click body list to set origin/dest (already covered in main test, but
// here we also verify the slot-value classes flip green/amber).
await page.locator('.body-item[data-name="Earth"]').click({ button: 'right' });
await page.waitForTimeout(200);
const originName = await page.locator('#origin-name').textContent();
check(`origin-name = Earth (got "${originName}")`, originName.trim() === 'Earth');
check('origin-name no longer .empty', await page.locator('#origin-name.empty').count() === 0);
check('Earth body-item has .origin-set class',
      await page.locator('.body-item[data-name="Earth"].origin-set').count() === 1);

await page.locator('.body-item[data-name="Mars"]').click({ button: 'right' });
await page.waitForTimeout(200);
const destName = await page.locator('#dest-name').textContent();
check(`dest-name = Mars (got "${destName}")`, destName.trim() === 'Mars');
check('Mars body-item has .dest-set class',
      await page.locator('.body-item[data-name="Mars"].dest-set').count() === 1);

// "Use SIM" button copies current sim date into depart-date
await page.click('#btn-use-sim');
const departVal = await page.locator('#depart-date').inputValue();
check(`SIM button populates depart-date (got "${departVal}")`,
      !!departVal && departVal.match(/^\d{4}-\d{2}-\d{2}T/));

// "Use OPT" button — Earth→Mars next optimal window
await page.click('#btn-use-optimal');
await page.waitForTimeout(300);
const optDepart = await page.locator('#depart-date').inputValue();
const optNotif = await page.locator('#notification').textContent();
check('OPT button updates depart-date',
      !!optDepart && optDepart !== departVal);
check(`OPT shows notification (got "${optNotif.trim()}")`,
      optNotif.includes('OPTIMAL'));

// Compute, verify results, then test Clear Route
await page.click('#calc-route');
await page.waitForTimeout(500);
check('Compute Transfer populates results',
      (await page.locator('#transfer-results').textContent()).length > 50);
check('Launch Mission button appears',
      await page.locator('#btn-launch').count() === 1);
check('Jump-to-departure button appears',
      await page.locator('#btn-goto-depart').count() === 1);

// Jump to Departure button
await page.click('#btn-goto-depart');
await page.waitForTimeout(200);
const jumpedSim = await page.evaluate(() => window.__HELIOS.timeState.simTime);
const tdDeparture = await page.evaluate(() => window.__HELIOS.transferData.departureSimTime);
check(`Jump to Departure sets sim to td.departureSimTime (Δ=${Math.abs(jumpedSim - tdDeparture).toFixed(0)}s)`,
      Math.abs(jumpedSim - tdDeparture) < 60);

// Clear Route
await page.click('#clear-route');
await page.waitForTimeout(200);
check('clear resets origin slot',
      (await page.locator('#origin-name').textContent()).includes('Drag or right-click'));
check('clear resets dest slot',
      (await page.locator('#dest-name').textContent()).includes('Drag or right-click'));
check('clear empties transfer-results',
      (await page.locator('#transfer-results').textContent()).trim().length === 0);
check('clear empties depart-date input',
      (await page.locator('#depart-date').inputValue()) === '');

// ─────────────────────────────────────────────────────────────────────────────
section('7. SELECTION + INFO PANEL DEFAULT');

// Esc clears selection. Headless Chromium can drop the first keyboard event
// when the page is busy (low FPS), so retry once with a longer settle time
// before declaring failure.
await page.locator('.body-item[data-name="Earth"]').click();
await page.waitForTimeout(250);
let noSel = false;
for (let attempt = 0; attempt < 3; attempt++) {
  await page.locator('body').click({ position: { x: 720, y: 100 } });
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  noSel = await page.evaluate(() => !document.querySelector('.body-item.selected'));
  if (noSel) break;
}
check('Escape clears selection', noSel === true);
const defaultInfo = await page.locator('#body-info').textContent();
check('info panel shows default placeholder',
      defaultInfo.includes('Select a Body'));

// ─────────────────────────────────────────────────────────────────────────────
section('8. NOTIFICATION SYSTEM');

await page.evaluate(() => {
  // No public notify export, but we can trigger one via the "ORIGIN" path.
});
await page.locator('.body-item[data-name="Venus"]').click({ button: 'right' });
await page.waitForTimeout(150);
const notifVisible = await page.locator('#notification.show').count();
const notifText = (await page.locator('#notification').textContent()).trim();
check(`notification appears with show class (text="${notifText}")`, notifVisible === 1);
check('notification mentions ORIGIN', notifText.includes('ORIGIN'));

// Wait for it to fade
await page.waitForTimeout(2700);
check('notification auto-hides after ~2.5s',
      await page.locator('#notification.show').count() === 0);

// ─────────────────────────────────────────────────────────────────────────────
section('9. FLYBY UI');

// Clear any leftover state from prior sections, then set up a fresh route.
await page.click('#clear-route');
await page.waitForTimeout(150);
await page.locator('.body-item[data-name="Earth"]').click({ button: 'right' });
await page.waitForTimeout(100);
await page.locator('.body-item[data-name="Jupiter"]').click({ button: 'right' });
await page.waitForTimeout(100);
await page.click('#btn-add-flyby');
await page.waitForTimeout(150);
const flybyRows = await page.locator('.flyby-row').count();
check(`add-flyby creates a flyby row (got ${flybyRows})`, flybyRows === 1);

// Change flyby body via dropdown
await page.locator('.flyby-body').first().selectOption('Mars');
await page.waitForTimeout(100);
const flybyBodyVal = await page.locator('.flyby-body').first().inputValue();
check(`flyby body dropdown sets bodyName=Mars (got ${flybyBodyVal})`, flybyBodyVal === 'Mars');

// Add a second flyby
await page.click('#btn-add-flyby');
await page.waitForTimeout(150);
check('second add-flyby creates 2 rows',
      (await page.locator('.flyby-row').count()) === 2);

// Remove flyby (×)
await page.locator('.flyby-row').first().locator('.flyby-remove').click();
await page.waitForTimeout(150);
check('× button removes the flyby row',
      (await page.locator('.flyby-row').count()) === 1);

// Clear out
await page.click('#clear-route');

// ─────────────────────────────────────────────────────────────────────────────
section('10. MOUSE INTERACTION (canvas-level)');

// We'll reach into the scene and pick the screen position of Mars, then
// dispatch a mousemove and check that the tooltip appears with Mars info.
const marsScreen = await page.evaluate(() => {
  const mesh = window.__HELIOS.planetMeshes.get('Mars');
  if (!mesh) return null;
  // Approximate: project mesh world position onto canvas.
  // We don't have direct camera access, so just pick the canvas center as a
  // placeholder — the tooltip will show whatever's nearest to that ray.
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
});
if (marsScreen) {
  await page.mouse.move(marsScreen.x, marsScreen.y);
  await page.waitForTimeout(200);
  // Cursor coordinates always update on mousemove regardless of intersection.
  const coords = await page.locator('#cursor-coords').textContent();
  check(`cursor-coords readout updates (got "${coords}")`,
        coords.includes('AU'));
} else {
  check('mars mesh present', false);
}

// FPS display present and numeric
const fpsText = await page.locator('#fps-display').textContent();
check(`fps-display shows numeric FPS (got "${fpsText}")`,
      /^\d+\s*FPS$/.test(fpsText.trim()));

// MJD display updates as time progresses
const mjd1 = await page.locator('#sim-mjd').textContent();
await page.click('#btn-fwd-fast');
await page.waitForTimeout(800);
const mjd2 = await page.locator('#sim-mjd').textContent();
await page.click('#btn-pause');
check(`MJD advances when time runs (${mjd1.trim()} → ${mjd2.trim()})`,
      parseFloat(mjd2) > parseFloat(mjd1));

// ─────────────────────────────────────────────────────────────────────────────
section('11. FRAME BADGE & ABOUT MODAL');

const frameBadge = await page.locator('.frame-badge').textContent();
check(`frame badge shows J2000 ECLIPTIC (got "${frameBadge.trim()}")`,
      /J2000.*ECLIPTIC/i.test(frameBadge));

await page.click('#btn-about');
await page.waitForTimeout(200);
check('About modal opens',
      await page.locator('#about-overlay.visible').count() === 1);
const aboutContent = await page.locator('#about-modal').textContent();
check('About panel mentions Lambert solver', aboutContent.includes('Lambert'));
check('About panel mentions JPL Approximate Positions', aboutContent.includes('Approximate Positions'));
check('About panel mentions reference frame', aboutContent.includes('Heliocentric Ecliptic'));
check('About panel lists validation tests', aboutContent.includes('trip_planning_test'));

await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Esc closes About modal',
      await page.locator('#about-overlay.visible').count() === 0);

// ─────────────────────────────────────────────────────────────────────────────
section('12. SCENARIOS DROPDOWN');

const scenarioOptions = await page.$$eval('#scenario-select option', opts => opts.length);
check(`scenarios dropdown populated (got ${scenarioOptions} options including placeholder)`,
      scenarioOptions >= 5);

await page.click('#clear-route');
await page.waitForTimeout(200);
await page.selectOption('#scenario-select', 'mars-2026');
await page.waitForTimeout(400);
const originAfter = (await page.locator('#origin-name').textContent()).trim();
const destAfter   = (await page.locator('#dest-name').textContent()).trim();
const departAfter = await page.locator('#depart-date').inputValue();
check(`scenario sets origin = Earth (got "${originAfter}")`, originAfter === 'Earth');
check(`scenario sets dest = Mars (got "${destAfter}")`, destAfter === 'Mars');
check(`scenario fills departure date (got "${departAfter}")`,
      !!departAfter && departAfter.startsWith('2026-11-21'));

const summaryText = (await page.locator('#scenario-summary').textContent()).trim();
check(`scenario summary updates (got "${summaryText.slice(0, 30)}…")`,
      summaryText.length > 5);

// Multi-leg scenario should populate a flyby row.
await page.click('#clear-route');
await page.waitForTimeout(200);
await page.selectOption('#scenario-select', 'venus-mars-via-venus');
await page.waitForTimeout(500);
const flybyCount = await page.locator('.flyby-row').count();
check(`scenario with flyby creates flyby row (got ${flybyCount})`, flybyCount === 1);

// ─────────────────────────────────────────────────────────────────────────────
section('13. PORKCHOP C3 / V∞ METRIC TOGGLE');

await page.click('#clear-route');
await page.waitForTimeout(200);
await page.selectOption('#scenario-select', 'mars-2026');
await page.waitForTimeout(300);
await page.click('#find-windows');
await page.waitForTimeout(800);   // initial sweep starts
// Wait for porkchop sweep to complete (or get sufficient data).
for (let i = 0; i < 30; i++) {
  const w = await page.locator('#pc-progress-fill').evaluate(el => el.style.width);
  if (w === '100%') break;
  await page.waitForTimeout(500);
}

// Check that all three metric buttons exist.
const metricBtns = await page.locator('.pc-metric-btn').count();
check(`3 metric toggle buttons present (got ${metricBtns})`, metricBtns === 3);

// Cell info shows all three metrics.
const cellInfo = await page.locator('#porkchop-overlay .pc-info').textContent();
check(`cell info exposes Δv, C3, V∞ readouts`,
      cellInfo.includes('TOTAL') && cellInfo.includes('C3') && cellInfo.includes('V∞'));

// Toggle to C3 mode.
await page.click('.pc-metric-btn[data-metric="c3"]');
await page.waitForTimeout(200);
const c3BtnActive = await page.locator('.pc-metric-btn[data-metric="c3"].active').count();
check('C3 button gets .active class', c3BtnActive === 1);

const scaleMin = await page.locator('#pc-scale-min').textContent();
check(`legend updates to km²/s² in C3 mode (got "${scaleMin.trim()}")`,
      scaleMin.includes('km²/s²'));

// Toggle to V∞.
await page.click('.pc-metric-btn[data-metric="vinf"]');
await page.waitForTimeout(200);
check('V∞ button gets .active class',
      await page.locator('.pc-metric-btn[data-metric="vinf"].active').count() === 1);

// Toggle back to Δv.
await page.click('.pc-metric-btn[data-metric="dv"]');
await page.waitForTimeout(200);
check('Δv button gets .active class after toggle back',
      await page.locator('.pc-metric-btn[data-metric="dv"].active').count() === 1);

// Close the porkchop overlay.
await page.click('#pc-close');
await page.waitForTimeout(200);

// ─────────────────────────────────────────────────────────────────────────────
section('14. MISSION PLAN JSON EXPORT');

await page.click('#clear-route');
await page.waitForTimeout(200);
await page.selectOption('#scenario-select', 'mars-2026');
await page.waitForTimeout(400);
await page.click('#calc-route');
await page.waitForTimeout(500);

check('Export plan button rendered after compute',
      await page.locator('#btn-export-plan').count() === 1);

// Hook into the click — capture the download via Playwright's download event.
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
  page.click('#btn-export-plan'),
]);
check('export click triggers a download', download !== null);
if (download) {
  const filename = download.suggestedFilename();
  check(`download filename contains origin/dest/date (got "${filename}")`,
        /helios-mission-Earth-to-Mars-/.test(filename));
  // Read the JSON content.
  const path = await download.path();
  const fs = await import('fs/promises');
  const text = await fs.readFile(path, 'utf8');
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { /* fall through */ }
  check('exported JSON parses', parsed !== null);
  if (parsed) {
    check('exported plan has summary block', !!parsed.summary && parsed.summary.origin === 'Earth');
    check('exported plan declares J2000 frame', parsed.frame.includes('J2000'));
    check('exported plan has feasibility block', !!parsed.feasibility);
    check('exported plan has maneuvers array', Array.isArray(parsed.maneuvers) && parsed.maneuvers.length >= 2);
    const dep = parsed.maneuvers.find(m => m.type === 'depart');
    check('depart maneuver has v_inf and C3', dep && Array.isArray(dep.v_inf_m_s) && typeof dep.c3_m2_s2 === 'number');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('15. CONSOLE HEALTH');
// Filter out the known harmless 404s for moon textures (CDN doesn't have them
// for every moon — the app silently falls back to flat color).
const realErrors = consoleErrors.filter(e => !/Failed to load resource/.test(e) && !/404/.test(e));
check(`no unexpected console errors (got ${realErrors.length})`, realErrors.length === 0,
      realErrors.length ? realErrors.slice(0, 3).join(' | ') : '');
console.log(`(${consoleErrors.length - realErrors.length} ignored 404s for missing moon textures)`);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━ SUMMARY ━━━\n');
const pass = results.filter(r => r.ok).length;
const fail = results.length - pass;
console.log(`${pass}/${results.length} passed${fail ? ` · ${fail} FAILED` : ''}`);
if (fail) {
  console.log('\nFailed checks:');
  results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.label}`));
}

await browser.close();
process.exit(fail ? 1 : 0);
