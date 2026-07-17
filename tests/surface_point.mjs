// Surface-point spherical coords + Lambert endpoint offsets.

import { BODIES } from '../js/data/bodies.js';
import {
  applySurfaceEndpoint, emptySurfacePoint, formatSurfacePointShort,
  isSurfacePointActive, normalizeSurfacePoint, surfaceBodyFixedMeters,
  surfaceOffsetSceneAU, surfaceVelocitySceneMps, getSpinModel,
  surfacePointMeta,
} from '../js/physics/surface-point.js';
import { solveTransferOrbit } from '../js/physics/routing.js';
import { hohmannTransfer } from '../js/physics/kepler.js';
import { v3mag } from '../js/physics/vec3.js';
import { AU } from '../js/constants.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ SURFACE POINT SPHERICAL ━━━');

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');

// Body-fixed: equator, prime meridian → [R, 0, 0]
const bf0 = surfaceBodyFixedMeters(earth, 0, 0, 0);
check('equator 0 lon on +X', Math.abs(bf0[0] - earth.radius) < 1 && Math.abs(bf0[1]) < 1e-6 && Math.abs(bf0[2]) < 1e-6);

const bfN = surfaceBodyFixedMeters(earth, 90, 0, 0);
check('north pole on +Z body', Math.abs(bfN[2] - earth.radius) < 1 && Math.abs(bfN[0]) < 1e-3);

const bfAlt = surfaceBodyFixedMeters(earth, 0, 0, 100e3);
check('alt increases radius', Math.abs(bfAlt[0] - (earth.radius + 100e3)) < 1);

const spin = getSpinModel(earth);
check('Earth spin period ~1 d', Math.abs(Math.abs(spin.period_d) - 1) < 0.05);
check('Earth obliquity ~23.4', Math.abs(spin.obliquity_deg - 23.44) < 0.5);

const pt = normalizeSurfacePoint({
  enabled: true, lat_deg: 28.5, lon_deg: -80.6, alt_m: 200e3,
});
check('active surface point', isSurfacePointActive(pt));
check('format short non-empty', formatSurfacePointShort(pt).includes('N'));

const off0 = surfaceOffsetSceneAU(earth, 0, pt);
const offMag = Math.sqrt(off0.x ** 2 + off0.y ** 2 + off0.z ** 2) * AU;
check('offset ~ R+alt', Math.abs(offMag - (earth.radius + 200e3)) / earth.radius < 0.02, `mag=${(offMag / 1000).toFixed(0)} km`);

const vSurf = surfaceVelocitySceneMps(earth, 0, pt);
const vMag = v3mag(vSurf);
// Earth surface equatorial ~465 m/s; at 28.5°N & 200 km slightly different order
check('surface spin speed 100–600 m/s', vMag > 100 && vMag < 600, `v=${vMag.toFixed(1)} m/s`);

const inactive = applySurfaceEndpoint(
  { x: 1, y: 0, z: 0, r: 1 },
  [0, 0, 0],
  earth,
  0,
  emptySurfacePoint(),
);
check('inactive leaves position', inactive.pos.x === 1 && !inactive.surfaceActive);

// Lambert with surface endpoints still solves
const dep = 0; // J2000-ish; use a known good date from other tests
// 2026-12-01-ish: use ~8.5e8 seconds from J2000 roughly
const departureSimTime = (Date.UTC(2026, 11, 1) - Date.UTC(2000, 0, 1, 12)) / 1000;
const td = hohmannTransfer(earth, mars, departureSimTime);
td.surfaceOriginPoint = pt;
td.surfaceDestPoint = normalizeSurfacePoint({
  enabled: true, lat_deg: 18.4, lon_deg: 77.5, alt_m: 100e3,
});
solveTransferOrbit(td);
check('Lambert ok with surface points', !!td.lambertOk);
check('surface origin meta set', !!td.surfaceOriginMeta?.label);
check('surface dest meta set', !!td.surfaceDestMeta?.label);
check('dv finite', isFinite(td.dvTotal_lambert) && td.dvTotal_lambert > 1000);

// Offset magnitude stored
check('origin offset near Earth R', td.surfaceOriginOffset_m > earth.radius * 0.5);

const meta = surfacePointMeta(earth, pt);
check('meta body Earth', meta?.body === 'Earth');

if (failed) {
  console.error(`\n${failed} surface-point check(s) failed`);
  process.exit(1);
}
console.log('\nAll surface-point checks passed');
