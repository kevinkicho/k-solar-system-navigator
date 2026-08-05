/**
 * Cinematic endpoint display transform — one physical orbit, scene alignment.
 */
import { BODIES } from '../js/data/bodies.js';
import { DAY } from '../js/constants.js';
import { solveTransferOrbit } from '../js/physics/routing.js';
import { buildTransferPathSamples, sampleTransferPathAtTime } from '../js/physics/transfer-path.js';
import { cinematicEndpointBlend } from '../js/physics/path-display-transform.js';
import { getBodyPosition3D } from '../js/physics/kepler.js';
import { state, useCinematicEndpointTransform, scenePathGeometry } from '../js/state.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ PATH DISPLAY TRANSFORM ━━━');

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const depT = (Date.UTC(2028, 5, 1, 12) - Date.UTC(2000, 0, 1, 12)) / 1000;
const td = {
  body1: earth,
  body2: mars,
  departureSimTime: depT,
  transferTime: 220 * DAY,
  arrivalSimTime: depT + 220 * DAY,
};
solveTransferOrbit(td);
check('orbit physical ok', !!td.orbitPhysical || !!td.orbit);

// Endpoint blend at DEP should land on exaggerated body
const depP = getBodyPosition3D(earth, depT, false);
const depV = getBodyPosition3D(earth, depT, true);
const blended = cinematicEndpointBlend(depP, td, depT, {
  tDep: depT,
  tArr: td.arrivalSimTime,
  tof: td.transferTime,
});
const dDep = Math.hypot(blended.x - depV.x, blended.y - depV.y, blended.z - depV.z);
check('DEP blend matches exaggerated Earth', dDep < 1e-9, `d=${dDep}`);

const arrP = getBodyPosition3D(mars, td.arrivalSimTime, false);
const arrV = getBodyPosition3D(mars, td.arrivalSimTime, true);
const blendedArr = cinematicEndpointBlend(arrP, td, td.arrivalSimTime, {
  tDep: depT,
  tArr: td.arrivalSimTime,
  tof: td.transferTime,
});
const dArr = Math.hypot(blendedArr.x - arrV.x, blendedArr.y - arrV.y, blendedArr.z - arrV.z);
check('ARR blend matches exaggerated Mars', dArr < 1e-9, `d=${dArr}`);

// Full path samples with transform
const built = buildTransferPathSamples(td, {
  geometry: 'physical',
  exaggerate: false,
  displayTransform: 'cinematic_endpoints',
  offsetExaggerate: true,
  nSamples: 64,
  offsetPolicy: 'time_varying',
});
check('transformed path has points', built.points?.length >= 16);
check('meta records transform', built.meta?.displayTransform === 'cinematic_endpoints');

const mid = sampleTransferPathAtTime(td, depT + 0.5 * td.transferTime, {
  geometry: 'physical',
  exaggerate: false,
  displayTransform: 'cinematic_endpoints',
  offsetExaggerate: true,
});
check('mid sample ok', !!mid);

// Product mode flags — Present uses visual Lambert; blend is opt-in only
state.display.mode = 'cinematic';
state.productMode = 'present';
state.mapMode = false;
state.physicsAccurate = false;
state.pathAccuracy = state.pathAccuracy || {};
state.pathAccuracy.useEndpointBlend = false;
check('present transform OFF by default', !useCinematicEndpointTransform());
check('present scene geom visual', scenePathGeometry() === 'visual');
state.pathAccuracy.useEndpointBlend = true;
check('opt-in blend enables transform', useCinematicEndpointTransform());
check('opt-in blend scene geom physical', scenePathGeometry() === 'physical');
state.pathAccuracy.useEndpointBlend = false;
state.productMode = 'analyze';
state.display.mode = 'schematic';
check('analyze transform off', !useCinematicEndpointTransform());
check('analyze scene geom physical', scenePathGeometry() === 'physical');

if (failed) {
  console.error(`${failed} path_display_transform check(s) failed`);
  process.exit(1);
}
console.log('path_display_transform: ok');
