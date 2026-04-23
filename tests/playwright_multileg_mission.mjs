// Verifies that multi-leg missions (route with gravity-assist flybys) can
// actually be launched and flown. Before this feature the Launch Mission
// button was disabled for any route containing a flyby.
//
// Checks:
//   (1) Building a route with a Mars flyby to Jupiter enables "Launch Mission"
//   (2) Clicking Launch activates mission state and the ship becomes visible
//   (3) As sim time advances, ship follows the correct leg (legIndex updates)
//   (4) Crossing a flyby triggers pulse animation on the ring marker AND
//       adds the flyby index to mission.flybysTriggered
//   (5) When the last leg completes, mission.arrived becomes true
//   (6) Abort resets mission state and rebuilds the multi-leg results panel

import { chromium } from 'playwright';
const APP_URL = process.env.HELIOS_URL || 'http://localhost:34131/';

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '   ' + detail : ''}`);
}
function section(s) { console.log('\n━━━ ' + s + ' ━━━'); }

const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', err => errors.push('pageerror: ' + err.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

section('1. LOAD + BUILD MULTI-LEG ROUTE (Earth → Mars flyby → Jupiter)');
await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(() => window.__HELIOS && window.__HELIOS.bodyPositions.size >= 8);

// Set Earth origin, Jupiter destination
await page.locator('.body-item', { hasText: 'Earth' }).click({ button: 'right' });
await page.locator('.body-item', { hasText: 'Jupiter' }).click({ button: 'right' });
// Set departure date that's known to produce a feasible Earth→Mars→Jupiter route
await page.evaluate(() => {
  document.getElementById('depart-date').value = '2026-01-15T00:00:00';
});
// Add a Mars flyby
await page.locator('#btn-add-flyby').click();
await page.waitForSelector('.flyby-row');
await page.evaluate(() => {
  const sel = document.querySelector('.flyby-row .flyby-body');
  sel.value = 'Mars';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  // set flyby date ~760 days post-launch (feasible for this route per offline scan)
  const input = document.querySelector('.flyby-row .flyby-date');
  const dep = new Date('2026-01-15T00:00:00Z');
  const flyby = new Date(dep.getTime() + 760 * 86400 * 1000);
  const pad = n => String(n).padStart(2, '0');
  input.value = `${flyby.getUTCFullYear()}-${pad(flyby.getUTCMonth()+1)}-${pad(flyby.getUTCDate())}T00:00:00`;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.locator('#calc-route').click();
await page.waitForTimeout(400);

const routeInfo = await page.evaluate(() => {
  const td = window.__HELIOS.transferData;
  return td ? {
    isMultiLeg: td.isMultiLeg,
    allLegsOk: td.allLegsOk,
    legCount: td.legs ? td.legs.length : 0,
    hasLaunchBtn: !!document.getElementById('btn-launch'),
  } : null;
});
check('route is multi-leg',        routeInfo && routeInfo.isMultiLeg === true);
check('all legs solved',            routeInfo && routeInfo.allLegsOk === true);
check(`2 legs (origin→flyby→dest): got ${routeInfo?.legCount}`, routeInfo?.legCount === 2);
check('Launch Mission button is present', routeInfo && routeInfo.hasLaunchBtn === true);

section('2. LAUNCH MISSION');
await page.locator('#btn-launch').click();
await page.waitForTimeout(200);
const launched = await page.evaluate(() => {
  const H = window.__HELIOS;
  return {
    active: H.mission.active,
    shipVisible: H.shipGroup.visible,
    abortBtn: !!document.getElementById('btn-abort'),
    legIndicator: !!document.getElementById('mission-leg'),
  };
});
check('mission.active = true',          launched.active === true);
check('ship is visible',                 launched.shipVisible === true);
check('Abort button present',            launched.abortBtn === true);
check('leg indicator row present',       launched.legIndicator === true);

section('3. ADVANCE TIME — ship follows first leg');
// Jump a bit into leg 1 (sim speed is 6 = 1 month/sec, but we'll just set simTime directly)
const leg1Mid = await page.evaluate(() => {
  const td = window.__HELIOS.transferData;
  const L = td.legs[0];
  const t = L.departSimTime + 0.5 * L.tof;
  window.__HELIOS.timeState.simTime = t;
  return t;
});
await page.waitForTimeout(300);   // let the animate loop tick a few times
const midLeg1 = await page.evaluate(() => {
  const H = window.__HELIOS;
  return {
    currentLeg: H.mission.currentLegIndex,
    shipPos: { x: H.shipGroup.position.x, z: H.shipGroup.position.z },
    flybysTriggered: [...H.mission.flybysTriggered],
  };
});
check(`in leg 0 during leg 1 mid-transit (got ${midLeg1.currentLeg})`, midLeg1.currentLeg === 0);
check('no flybys triggered yet',         midLeg1.flybysTriggered.length === 0);
check('ship moved off origin',           Math.hypot(midLeg1.shipPos.x, midLeg1.shipPos.z) > 0.2);

section('4. CROSS THE MARS FLYBY');
// Advance sim time to just after leg 0 ends = flyby time
await page.evaluate(() => {
  const td = window.__HELIOS.transferData;
  const L1 = td.legs[1];
  window.__HELIOS.timeState.simTime = L1.departSimTime + 1;  // 1 second into leg 2
});
await page.waitForTimeout(400);
const crossedFlyby = await page.evaluate(() => {
  const H = window.__HELIOS;
  const marker0 = H.flybyMarkers[0];
  return {
    currentLeg: H.mission.currentLegIndex,
    flybysTriggered: [...H.mission.flybysTriggered],
    markerHasPulse: marker0 && typeof marker0.userData.pulseStart === 'number',
    markerScale: marker0 ? marker0.scale.x : null,
  };
});
check('now in leg 1',                    crossedFlyby.currentLeg === 1);
check('flyby index 0 triggered',         crossedFlyby.flybysTriggered.includes(0));
check('Mars flyby marker has pulseStart', crossedFlyby.markerHasPulse === true);
check(`marker scale > 1 during pulse (got ${crossedFlyby.markerScale?.toFixed(2)})`,
      crossedFlyby.markerScale > 1.05);

section('5. ARRIVE AT JUPITER');
await page.evaluate(() => {
  const td = window.__HELIOS.transferData;
  window.__HELIOS.timeState.simTime = td.arrivalSimTime + 1;
});
await page.waitForTimeout(400);
const arrived = await page.evaluate(() => {
  const H = window.__HELIOS;
  const destPos = H.bodyPositions.get(H.transferData.body2.name);
  const ship = H.shipGroup.position;
  const d = Math.hypot(ship.x - destPos.x, ship.y - destPos.y, ship.z - destPos.z);
  return {
    arrived: H.mission.arrived,
    shipAtDest: d,
    statusH4: document.querySelector('#mission-status-box h4')?.textContent,
  };
});
check('mission.arrived = true',          arrived.arrived === true);
check(`ship parked at destination (Δ=${arrived.shipAtDest.toFixed(4)} AU)`,
      arrived.shipAtDest < 0.01);
check(`status shows "MISSION COMPLETE" (got "${arrived.statusH4}")`,
      arrived.statusH4 === 'MISSION COMPLETE');

section('6. ABORT RESTORES THE ROUTE PANEL');
// After "MISSION COMPLETE" the button is labelled Abort; click it
await page.locator('#btn-abort').click();
await page.waitForTimeout(200);
const aborted = await page.evaluate(() => ({
  active: window.__HELIOS.mission.active,
  shipVisible: window.__HELIOS.shipGroup.visible,
  launchBtnBack: !!document.getElementById('btn-launch'),
  markersReset: window.__HELIOS.flybyMarkers.every(m => m.scale.x === 1),
}));
check('mission.active = false',          aborted.active === false);
check('ship hidden after abort',         aborted.shipVisible === false);
check('Launch button rebuilt',           aborted.launchBtnBack === true);
check('flyby markers reset to rest size', aborted.markersReset === true);

section('SUMMARY');
const passed = results.filter(r => r.ok).length;
const failed = results.length - passed;
console.log(`\n${passed}/${results.length} passed · ${failed} failed`);
if (errors.filter(e => !e.includes('404')).length) {
  console.log('\nREAL ERRORS:');
  errors.filter(e => !e.includes('404')).forEach(e => console.log('  ' + e));
}
await browser.close();
process.exit(failed === 0 ? 0 : 1);
