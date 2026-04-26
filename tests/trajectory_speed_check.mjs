// Diagnostic for the user's "ship is too fast at start, too slow at end" report.
// Reproduces Earth → Jupiter departing "today", solves Lambert, and prints the
// resulting orbit's parameters and the ship's motion profile (radial distance
// + speed) at evenly-spaced time samples.  We can then judge whether the
// motion is correct Kepler (= correct) or pathological.

import { pathToFileURL } from 'url';
import { dirname, resolve as pathResolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathResolve(__dirname, '..');
const importMod = (rel) => import(pathToFileURL(pathResolve(ROOT, rel)).href);

const { AU, DAY, G_CONST, J2000 } = await importMod('js/constants.js');
const { BODIES, SUN_DATA } = await importMod('js/data/bodies.js');
const kepler = await importMod('js/physics/kepler.js');
const helio  = await importMod('js/physics/helio.js');
const lambert = await importMod('js/physics/lambert.js');
const routing = await importMod('js/physics/routing.js');
const vec3 = await importMod('js/physics/vec3.js');

const earth   = BODIES.find(b => b.name === 'Earth');
const jupiter = BODIES.find(b => b.name === 'Jupiter');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Earth → Jupiter, departure ≈ now (2026-04-25)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const departureSimTime = (Date.UTC(2026, 3, 25) - J2000) / 1000;
const td = kepler.hohmannTransfer(earth, jupiter, departureSimTime);
routing.solveTransferOrbit(td);

const tofDays = td.transferTime / DAY;
console.log(`\nDeparture: ${new Date(td.departureSimTime*1000 + J2000).toISOString().slice(0,10)}`);
console.log(`Arrival:   ${new Date(td.arrivalSimTime*1000 + J2000).toISOString().slice(0,10)}`);
console.log(`TOF:       ${tofDays.toFixed(1)} days`);

// Heliocentric longitudes (ecliptic) at depart and arrive.
const pE_dep = kepler.getBodyPosition3D(earth, td.departureSimTime, false);
const pJ_dep = kepler.getBodyPosition3D(jupiter, td.departureSimTime, false);
const pE_arr = kepler.getBodyPosition3D(earth, td.arrivalSimTime, false);
const pJ_arr = kepler.getBodyPosition3D(jupiter, td.arrivalSimTime, false);
const longDeg = (p) => (Math.atan2(p.z, p.x) * 180 / Math.PI + 360) % 360;
console.log('');
console.log(`Earth   at depart:  L=${longDeg(pE_dep).toFixed(1)}°  r=${pE_dep.r.toFixed(3)} AU`);
console.log(`Jupiter at depart:  L=${longDeg(pJ_dep).toFixed(1)}°  r=${pJ_dep.r.toFixed(3)} AU`);
console.log(`Jupiter at arrive:  L=${longDeg(pJ_arr).toFixed(1)}°  r=${pJ_arr.r.toFixed(3)} AU`);
const deltaLong = ((longDeg(pJ_arr) - longDeg(pE_dep) + 540) % 360) - 180;
console.log(`Earth-launch → Jupiter-arrival angular sweep: ${deltaLong.toFixed(1)}°`);

if (!td.lambertOk) { console.log('\n⚠ Lambert FAILED'); process.exit(1); }

const orb = td.orbitPhysical;
console.log('');
console.log('--- TRANSFER ORBIT (physical, real inclinations) ---');
console.log(`a (semi-major)  : ${(orb.a/AU).toFixed(4)} AU`);
console.log(`e (eccentricity): ${orb.e.toFixed(6)}`);
console.log(`p (semi-latus)  : ${(orb.p/AU).toFixed(4)} AU`);
console.log(`Perihelion      : ${((orb.a*(1-orb.e))/AU).toFixed(3)} AU`);
console.log(`Apoapsis        : ${((orb.a*(1+orb.e))/AU).toFixed(3)} AU`);
console.log(`Mean motion n   : ${orb.n.toExponential(3)} rad/s`);
console.log(`Period (Kepler) : ${(2*Math.PI/orb.n / DAY).toFixed(1)} days`);
console.log(`Δv depart (km/s): ${(td.dv1_lambert/1000).toFixed(2)}`);
console.log(`Δv arrive (km/s): ${(td.dv2_lambert/1000).toFixed(2)}`);
console.log(`Δv total  (km/s): ${(td.dvTotal_lambert/1000).toFixed(2)}`);

console.log('');
console.log('--- SHIP MOTION PROFILE (at fractions of TOF) ---');
console.log(' frac    t (days)    r (AU)   |v| (km/s)   v/v_local_circular');
for (const frac of [0, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 1.0]) {
  const dt = frac * td.transferTime;
  const pos_m = helio.propagateOrbit(orb, dt);
  // Numeric velocity by central difference on the same orbit.
  const eps = 60;
  const pPlus = helio.propagateOrbit(orb, dt + eps);
  const pMinus = helio.propagateOrbit(orb, Math.max(0, dt - eps));
  const v = [(pPlus[0]-pMinus[0])/(2*eps), (pPlus[1]-pMinus[1])/(2*eps), (pPlus[2]-pMinus[2])/(2*eps)];
  const r_m = vec3.v3mag(pos_m);
  const r_AU = r_m / AU;
  const speed = vec3.v3mag(v);
  const v_circ = Math.sqrt(G_CONST * SUN_DATA.mass / r_m);
  const ratio = speed / v_circ;
  console.log(` ${frac.toFixed(2)}    ${(dt/DAY).toFixed(1).padStart(7)}    ${r_AU.toFixed(3).padStart(6)}   ${(speed/1000).toFixed(2).padStart(8)}        ${ratio.toFixed(3)}`);
}

console.log('');
console.log('--- DIAGNOSIS ---');
console.log('• Ship arrives at Jupiter (5.2 AU) at exactly t = TOF if Lambert closed.');
console.log('• "Fast at start, slow at end" is correct Kepler physics for an outbound');
console.log('  elliptical transfer (perihelion side fast, apoapsis side slow).');
console.log('• If r grows monotonically and speed decreases monotonically, motion is');
console.log('  physically correct — just visually dramatic when phasing is poor.');
console.log('• If r OVERSHOOTS Jupiter\'s orbit and comes back, that means the orbit\'s');
console.log('  apoapsis is past 5.2 AU and the ship reaches r=5.2 AU twice (going out');
console.log('  and coming back).');
