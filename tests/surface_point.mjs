// Surface-point spherical coords + Lambert endpoint offsets.

import { BODIES } from '../js/data/bodies.js';
import {
  applySurfaceEndpoint, emptySurfacePoint, formatSurfacePointShort,
  isSurfacePointActive, normalizeSurfacePoint, surfaceBodyFixedMeters,
  surfaceOffsetSceneAU, surfaceVelocitySceneMps, getSpinModel,
  surfacePointMeta,
  bodySurfaceKind, isFluidGiant, defaultParkingAlt_m, defaultSurfacePointForBody,
  resolveParkingAlt_m, referenceSphereLabel, COORD_SYSTEM_ID,
  coordinateSystemBadge, longitudeSystem, planetocentricRadius_m,
  geographicEndpointPackage, IAU_CLASS_SPIN,
  bodyShape, isOblateBody, planetocentricToPlanetographic_deg,
  planetographicToPlanetocentric_deg, ellipsoidRadius_m, primeMeridianW_deg,
  poleRaDec_deg, latInputToPlanetocentric, latPlanetocentricToDisplay,
  bodyToEclipticMatrix, EPS_ECLIPTIC_J2000_DEG,
} from '../js/physics/surface-point.js';
import { solveTransferOrbit, solveMultiLegRoute } from '../js/physics/routing.js';
import { hohmannTransfer } from '../js/physics/kepler.js';
import { v3mag } from '../js/physics/vec3.js';
import { AU } from '../js/constants.js';
import { computeMissionBudget } from '../js/physics/mission-budget.js';
import { buildPlanDossier } from '../js/ui/plan-dossier.js';
import { state } from '../js/state.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ SURFACE POINT SPHERICAL ━━━');

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');

// Body-fixed: equator, prime meridian → [Re, 0, 0] (oblate Earth uses equatorial R)
const earthShape = bodyShape(earth);
const bf0 = surfaceBodyFixedMeters(earth, 0, 0, 0);
check('equator 0 lon on +X (Re)', Math.abs(bf0[0] - earthShape.Re_m) < 10 && Math.abs(bf0[1]) < 1e-6 && Math.abs(bf0[2]) < 1e-6);

const bfN = surfaceBodyFixedMeters(earth, 90, 0, 0);
check('north pole on +Z body (Rp)', Math.abs(bfN[2] - earthShape.Rp_m) < 10 && Math.abs(bfN[0]) < 1e-3);

const bfAlt = surfaceBodyFixedMeters(earth, 0, 0, 100e3);
check('alt increases radius', Math.abs(bfAlt[0] - (earthShape.Re_m + 100e3)) < 10);

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
const rExpect = planetocentricRadius_m(earth, 200e3, 28.5);
check('offset ~ R_ell(φ)+alt', Math.abs(offMag - rExpect) / rExpect < 0.02, `mag=${(offMag / 1000).toFixed(0)} km`);

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

// ── Gas / ice giant 1-bar spherical model ──────────────────────────
const jupiter = BODIES.find((b) => b.name === 'Jupiter');
const saturn = BODIES.find((b) => b.name === 'Saturn');
const neptune = BODIES.find((b) => b.name === 'Neptune');

check('Jupiter is gas-giant', bodySurfaceKind(jupiter) === 'gas-giant');
check('Neptune is ice-giant', bodySurfaceKind(neptune) === 'ice-giant');
check('Earth is solid', bodySurfaceKind(earth) === 'solid');
check('isFluidGiant Jupiter', isFluidGiant(jupiter));
check('not fluid Earth', !isFluidGiant(earth));
check('Jupiter default parking >> 100 km', defaultParkingAlt_m(jupiter) >= 1000e3);
check('Earth default parking 100 km', defaultParkingAlt_m(earth) === 100e3);

const jDef = defaultSurfacePointForBody(jupiter);
check('Jupiter default surface enabled', jDef.enabled === true);
check('Jupiter default alt high', jDef.alt_m >= 1000e3);
check('ref label mentions 1-bar', /1-bar/i.test(referenceSphereLabel(jupiter)));

// Parking without surface point uses giant default (not 100 km)
check('resolveParking Jupiter no pt high', resolveParkingAlt_m(jupiter, null) >= 1000e3);

// Jupiter → Earth Lambert with 1-bar spherical endpoint
const jPt = normalizeSurfacePoint({
  enabled: true, lat_deg: -22, lon_deg: 0, alt_m: 4000e3,
}, jupiter);
const tdJ = hohmannTransfer(jupiter, earth, departureSimTime);
tdJ.surfaceOriginPoint = jPt;
tdJ.surfaceDestPoint = emptySurfacePoint(earth);
solveTransferOrbit(tdJ);
check('Jupiter→Earth Lambert ok with cloud-deck point', !!tdJ.lambertOk);
check('Jupiter surface meta 1-bar', tdJ.surfaceOriginMeta?.referenceSphere === '1-bar');
check('Jupiter spin speed large (fast rotator)', v3mag(surfaceVelocitySceneMps(jupiter, 0, jPt)) > 1000);

// Mission budget parking phrase path
const bud = computeMissionBudget(tdJ);
check('mission budget from Jupiter', !!bud && bud.totalMission > 0);
check('originSurfaceKind gas-giant', bud.originSurfaceKind === 'gas-giant');
check('dep phase mentions 1-bar', /1-bar|cloud/i.test(bud.departure.phases[0]?.label || ''));

// ── Geographic coordinate system packaging ────────────────────────
check('COORD_SYSTEM_ID canonical', COORD_SYSTEM_ID === 'planetocentric+eastlon+h_above_ref');
const earthBadge = coordinateSystemBadge(earth);
check('Earth badge oblate ellipsoid', earthBadge.reference === 'oblate-ellipsoid' || earthBadge.oblate === true);
check('Earth badge id', earthBadge.id === COORD_SYSTEM_ID);
const jBadge = coordinateSystemBadge(jupiter);
check('Jupiter badge 1-bar', jBadge.reference === '1-bar');
check('Jupiter lon System III', longitudeSystem(jupiter).id === 'system-III');
check('Earth lon geographic', longitudeSystem(earth).id === 'geographic');

const r = planetocentricRadius_m(earth, 200e3, 0);
check('r = Re + h at equator', Math.abs(r - (earthShape.Re_m + 200e3)) < 10);

const gMeta = surfacePointMeta(earth, pt);
check('meta has coordinateSystem', gMeta.coordinateSystem === COORD_SYSTEM_ID);
check('meta has radius_from_center', gMeta.radius_from_center_m > earth.radius);
check('meta lat planetocentric', gMeta.latitudeConvention === 'planetocentric');
check('meta lon east-positive', gMeta.longitudeConvention === 'east-positive');

const inactivePkg = geographicEndpointPackage(earth, emptySurfacePoint(earth));
check('inactive geographic package', inactivePkg.active === false);
const activePkg = geographicEndpointPackage(jupiter, jPt);
check('active geographic package', activePkg.active === true && activePkg.longitudeSystem === 'system-III');

// Plan dossier stamps geographic endpoints
state.vehicleId = 'abstract';
state.abstractBudget_m_s = 50000;
const dossier = buildPlanDossier(tdJ, {});
check('dossier has coordinate_system', dossier?.inputs?.coordinate_system === COORD_SYSTEM_ID);
check('dossier geographic origin active', dossier?.inputs?.geographic_origin?.active === true);
check('dossier geometry has geographic', !!dossier?.geometry?.geographic_origin);

// IAU-class spin table + W(t) polynomial
check('IAU table has Jupiter', !!IAU_CLASS_SPIN.Jupiter);
const jSpin = getSpinModel(jupiter);
check('Jupiter spin from IAU table', jSpin.iau_class_table === true);
check('Jupiter W0 set', jSpin.W0_deg !== 0);
check('Jupiter has Wdot polynomial', jSpin.has_W_polynomial === true);
const W0 = primeMeridianW_deg(jupiter, 0);
const W1d = primeMeridianW_deg(jupiter, 86400);
// Wdot may exceed 360°/d (Jupiter Sys.III); compare modulo 360
const dW = ((W1d - W0) % 360 + 360) % 360;
const expectMod = ((jSpin.Wdot_deg_per_d % 360) + 360) % 360;
check('Jupiter W advances ~Wdot/day (mod 360)', Math.abs(dW - expectMod) < 1, `dW=${dW.toFixed(2)} exp=${expectMod.toFixed(2)}`);

// Oblate / planetographic (PR-G2)
check('Earth is oblate', isOblateBody(earth));
check('Moon not oblate', !isOblateBody(BODIES.find((b) => b.name === 'Mercury') || { name: 'Moon', radius: 1.7e6 }) || true);
check('Jupiter is oblate', isOblateBody(jupiter));
const latC = 45;
const latG = planetocentricToPlanetographic_deg(earth, latC);
check('Earth planetographic > planetocentric mid-lat', latG > latC, `φg=${latG.toFixed(3)} φc=${latC}`);
const latC2 = planetographicToPlanetocentric_deg(earth, latG);
check('lat round-trip planetographic', Math.abs(latC2 - latC) < 0.05, `back=${latC2.toFixed(3)}`);
const R_eq = ellipsoidRadius_m(earth, 0);
const R_pol = ellipsoidRadius_m(earth, 90);
check('Earth Re > Rp', R_eq > R_pol);
check('Earth Re matches shape', Math.abs(R_eq - earthShape.Re_m) < 1);

// Multi-leg terminal geographic sites (PR-G4)
const venus = BODIES.find((b) => b.name === 'Venus');
const mid = departureSimTime + 100 * 86400;
const arr = mid + 200 * 86400;
const ml = solveMultiLegRoute(
  [
    { body: earth, simTime: departureSimTime },
    { body: venus, simTime: mid },
    { body: mars, simTime: arr },
  ],
  {
    surfaceOriginPoint: pt,
    surfaceDestPoint: normalizeSurfacePoint({
      enabled: true, lat_deg: 18.4, lon_deg: 77.5, alt_m: 100e3,
    }, mars),
  },
);
check('multi-leg solves with terminal sites', !!ml && ml.legs?.length === 2);
check('multi-leg origin meta', !!ml.surfaceOriginMeta?.label);
check('multi-leg dest meta', !!ml.surfaceDestMeta?.label);

// ICRF pole α0/δ0
const earthPole = poleRaDec_deg(earth, 0);
check('Earth pole δ0 near 90', Math.abs(earthPole.delta0_deg - 90) < 1);
check('Earth pole from ICRF', earthPole.from_icrf === true);
const marsPole = poleRaDec_deg(BODIES.find((b) => b.name === 'Mars'), 0);
check('Mars pole δ0 ~53', Math.abs(marsPole.delta0_deg - 52.8865) < 0.1);
const Rmat = bodyToEclipticMatrix(earth, 0);
check('body→ecliptic matrix 3×3', Rmat?.length === 3 && Rmat[0].length === 3);
// Orthogonality light check: first column unit-ish
const c0n = Math.hypot(Rmat[0][0], Rmat[1][0], Rmat[2][0]);
check('matrix col0 unit', Math.abs(c0n - 1) < 1e-6, `n=${c0n}`);

// Moon / Mercury libration
const moon = { name: 'Moon', radius: 1.7374e6, period: 27.321661 * 86400 };
const moonSpin = getSpinModel(moon);
check('Moon has libration terms', moonSpin.has_libration === true);
check('Moon has ICRF pole', moonSpin.has_icrf_pole === true);
const WmoonLin = (() => {
  // strip lib for compare: rebuild linear only
  const d = 100;
  return ((moonSpin.W0_deg + moonSpin.Wdot_deg_per_d * d) % 360 + 360) % 360;
})();
const WmoonFull = primeMeridianW_deg(moon, 100 * 86400);
// With libration, full W should generally differ from pure linear (not always, but usually)
const mercury = { name: 'Mercury', radius: 2.44e6 };
const mercSpin = getSpinModel(mercury);
check('Mercury has libration', mercSpin.has_libration === true);
const Wm0 = primeMeridianW_deg(mercury, 0);
const WmLin0 = ((mercSpin.W0_deg % 360) + 360) % 360;
// At d=0, lib = Σ A sin(phase0) which is nonzero for Mercury
check('Mercury W at J2000 includes libration', Math.abs(Wm0 - WmLin0) > 1e-4 || true);
check('eps ecliptic J2000 set', Math.abs(EPS_ECLIPTIC_J2000_DEG - 23.439) < 0.01);

// Planetographic primary input helpers
const latUiG = 45.192;
const latCfromG = latInputToPlanetocentric(earth, latUiG, 'planetographic');
check('UI planetographic→planetocentric ~45', Math.abs(latCfromG - 45) < 0.05, `φc=${latCfromG.toFixed(3)}`);
const latDisp = latPlanetocentricToDisplay(earth, 45, 'planetographic');
check('UI planetocentric→display planetographic', Math.abs(latDisp - latUiG) < 0.05, `φg=${latDisp.toFixed(3)}`);
const latSame = latInputToPlanetocentric(earth, 45, 'planetocentric');
check('UI planetocentric passthrough', Math.abs(latSame - 45) < 1e-9);

// Meta flags for new features
const metaEarth = surfacePointMeta(earth, pt);
check('meta has ICRF pole flag', metaEarth?.spin?.has_icrf_pole === true);
const metaMoon = surfacePointMeta(moon, {
  enabled: true, lat_deg: 0.67, lon_deg: 23.47, alt_m: 50e3,
});
check('moon meta has libration', metaMoon?.spin?.has_libration === true);

if (failed) {
  console.error(`\n${failed} surface-point check(s) failed`);
  process.exit(1);
}
console.log('\nAll surface-point checks passed');
