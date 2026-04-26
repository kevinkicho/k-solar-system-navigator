// Reproduces the scenario the user reported as buggy: launch Earth → Jupiter
// from "now", watch the mission play out, then verify the ship and Jupiter's
// rendered mesh coincide at arrival. Reads positions directly from the live
// scene via window.__HELIOS — this is the "what the user actually sees" check
// that the offline visual_alignment test can't catch.

import { chromium } from 'playwright';

const APP_URL = process.env.HELIOS_URL || 'http://localhost:45457/';

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
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await page.goto(APP_URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__HELIOS && window.__HELIOS.bodyPositions.size > 0, { timeout: 10000 });
await page.waitForTimeout(800);

section('1. SET UP EARTH → JUPITER FROM "NOW"');

// Reproduce the user's flow exactly: right-click Earth, right-click Jupiter,
// SIM date (current sim time = today), then Compute Transfer.
await page.locator('.body-item[data-name="Earth"]').click({ button: 'right' });
await page.waitForTimeout(150);
await page.locator('.body-item[data-name="Jupiter"]').click({ button: 'right' });
await page.waitForTimeout(150);
await page.click('#btn-use-sim');
await page.waitForTimeout(150);
await page.click('#calc-route');
await page.waitForTimeout(500);

const td = await page.evaluate(() => {
  const t = window.__HELIOS.transferData;
  return t ? {
    departure: t.departureSimTime,
    arrival:   t.arrivalSimTime,
    transferTime: t.transferTime,
    lambertOk: t.lambertOk,
    hasOrbit: !!t.orbit,
    hasOrbitPhysical: !!t.orbitPhysical,
  } : null;
});
check('transferData created', td !== null);
// Compute auto-snaps to the nearest feasible launch window — actual optimal
// TOF can land anywhere in the 0.5–1.5 × Hohmann band depending on phasing.
check('transferTime is plausible for E→J (500-1700 days)',
      td && td.transferTime / 86400 > 500 && td.transferTime / 86400 < 1700,
      td ? `tof=${(td.transferTime/86400).toFixed(0)}d` : '');
check('Lambert solved successfully', td && td.lambertOk);
check('visual orbit cached',  td && td.hasOrbit);
check('physical orbit cached', td && td.hasOrbitPhysical);

const transferDays = td.transferTime / 86400;

// ─────────────────────────────────────────────────────────────────────────────
section('2. LAUNCH MISSION & POLL FOR ARRIVAL');

await page.click('#btn-launch');
await page.waitForTimeout(300);

// Crank to max speed via the API directly — pressing '=' through Playwright
// risks un-pausing time after arrival (which the keyboard handler does).
// Real users either let it auto-arrive at 1 mo/s or use the speed slider.
await page.evaluate(() => window.__HELIOS.timeState.setSpeed(10));   // 100 yr/s

let arrived = false;
for (let i = 0; i < 60; i++) {
  arrived = await page.evaluate(() => window.__HELIOS.mission.arrived);
  if (arrived) break;
  await page.waitForTimeout(500);
}
check('mission reaches arrived state', arrived);

// Verify the simTime clamp landed exactly on arrivalSimTime.
const overshootDays = await page.evaluate(() => {
  const H = window.__HELIOS;
  return (H.timeState.simTime - H.transferData.arrivalSimTime) / 86400;
});
check(`simTime clamped to arrivalSimTime (overshoot = ${overshootDays.toFixed(3)} days, must be < 0.1)`,
      Math.abs(overshootDays) < 0.1);

// ─────────────────────────────────────────────────────────────────────────────
section('3. MEASURE SHIP vs JUPITER AT ARRIVAL (live scene)');

// Pause and let one extra frame paint to make sure positions are stable.
await page.waitForTimeout(200);

const measurements = await page.evaluate(() => {
  const H = window.__HELIOS;
  const ship = H.shipGroup.position;
  const jupiterMesh = H.planetMeshes.get('Jupiter').position;
  const jupiterBary = H.bodyPositions.get('Jupiter');
  const arrMarker = H.transferMarkers.arrive.position;
  const simTime = H.timeState.simTime;
  const arrivalSimTime = H.transferData.arrivalSimTime;
  const dt_arrival = simTime - arrivalSimTime;   // how far past the planned arrival

  const dist = (a, b) => Math.sqrt(
    (a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2
  );

  return {
    ship:           { x: ship.x, y: ship.y, z: ship.z },
    jupiterMesh:    { x: jupiterMesh.x, y: jupiterMesh.y, z: jupiterMesh.z },
    jupiterBary:    { x: jupiterBary.x, y: jupiterBary.y, z: jupiterBary.z },
    arrivalMarker:  { x: arrMarker.x,  y: arrMarker.y,  z: arrMarker.z  },
    dt_arrival_days: dt_arrival / 86400,
    dist_ship_jupiter_AU:        dist(ship, jupiterMesh),
    dist_ship_jupiter_bary_AU:   dist(ship, jupiterBary),
    dist_ship_arrival_marker_AU: dist(ship, arrMarker),
    dist_jupiter_marker_AU:      dist(jupiterMesh, arrMarker),
  };
});

console.log('  ship position    :', JSON.stringify(measurements.ship));
console.log('  jupiter mesh     :', JSON.stringify(measurements.jupiterMesh));
console.log('  jupiter bary map :', JSON.stringify(measurements.jupiterBary));
console.log('  arrival marker   :', JSON.stringify(measurements.arrivalMarker));
console.log('  sim time vs arrival : ' + measurements.dt_arrival_days.toFixed(3) + ' days past');

const AU_KM = 149597870.7;
const tooFar = measurements.dist_ship_jupiter_AU * AU_KM;
console.log('');
console.log(`  ship ↔ Jupiter mesh : ${measurements.dist_ship_jupiter_AU.toExponential(3)} AU  (${tooFar.toFixed(0)} km)`);
console.log(`  ship ↔ Jupiter bary : ${measurements.dist_ship_jupiter_bary_AU.toExponential(3)} AU`);
console.log(`  ship ↔ arrive ring  : ${measurements.dist_ship_arrival_marker_AU.toExponential(3)} AU`);
console.log(`  Jupiter ↔ arrive ring : ${measurements.dist_jupiter_marker_AU.toExponential(3)} AU`);

check('ship coincides with Jupiter mesh (<0.01 AU = ~1.5M km)',
      measurements.dist_ship_jupiter_AU < 0.01);
check('ship coincides with Jupiter bary entry (<0.001 AU = ~150k km)',
      measurements.dist_ship_jupiter_bary_AU < 0.001);
check('Jupiter mesh ≈ arrive marker (<0.001 AU)',
      measurements.dist_jupiter_marker_AU < 0.001);
check('ship ≈ arrive marker (<0.001 AU)',
      measurements.dist_ship_arrival_marker_AU < 0.001);

// ─────────────────────────────────────────────────────────────────────────────
section('4. SUMMARY');
const pass = results.filter(r => r.ok).length;
const fail = results.length - pass;
console.log(`\n${pass}/${results.length} passed${fail ? ` · ${fail} FAILED` : ''}`);

await browser.close();
process.exit(fail ? 1 : 0);
