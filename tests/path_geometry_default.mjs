/**
 * Product pathGeometry defaults: physical, MAP restore, effectivePathGeometry.
 */
import {
  state, effectivePathGeometry, pathSampleGeometry, scenePathGeometry, PRODUCT_PATH_GEOMETRY,
} from '../js/state.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ PATH GEOMETRY DEFAULT ━━━');

check('PRODUCT_PATH_GEOMETRY is physical', PRODUCT_PATH_GEOMETRY === 'physical');
check('state default physical', state.pathGeometry === 'physical');
check('effectivePathGeometry() → physical', effectivePathGeometry() === 'physical');
check('effectivePathGeometry(null) → physical', effectivePathGeometry(null) === 'physical');
check('effectivePathGeometry(undefined) → physical', effectivePathGeometry(undefined) === 'physical');
check('effectivePathGeometry(visual) → visual', effectivePathGeometry('visual') === 'visual');
check('effectivePathGeometry(both) → both', effectivePathGeometry('both') === 'both');

const prev = state.pathGeometry;
state.pathGeometry = null;
check('cleared state still resolves physical', effectivePathGeometry() === 'physical');
state.pathGeometry = prev;

// MAP restore behavior (unit-level contract without DOM)
state.pathGeometry = 'physical';
const before = effectivePathGeometry();
state.pathGeometry = 'both'; // MAP on
state.pathGeometry = before || PRODUCT_PATH_GEOMETRY; // MAP off restore
check('MAP exit restore physical', state.pathGeometry === 'physical');

check('pathSampleGeometry physical → physical', pathSampleGeometry('physical') === 'physical');
check('pathSampleGeometry both → physical', pathSampleGeometry('both') === 'physical');
check('pathSampleGeometry visual → visual', pathSampleGeometry('visual') === 'visual');

// Scene path: Present uses physical + cinematic_endpoints transform; schematic honors pathGeometry
state.display = state.display || {};
state.display.mode = 'cinematic';
state.productMode = 'present';
state.mapMode = false;
state.physicsAccurate = false;
state.pathGeometry = 'physical';
check('cinematic Present scenePathGeometry → physical', scenePathGeometry() === 'physical');
state.display.mode = 'schematic';
state.productMode = 'analyze';
check('schematic + physical scenePathGeometry → physical', scenePathGeometry() === 'physical');
state.physicsAccurate = true;
state.display.mode = 'cinematic';
check('physicsAccurate scenePathGeometry → physical', scenePathGeometry() === 'physical');
state.physicsAccurate = false;
state.display.mode = 'cinematic';
state.productMode = 'present';

// ACCURATE-off contract: never leave silent visual as product default
state.pathGeometry = 'both';
state.pathGeometry = PRODUCT_PATH_GEOMETRY;
check('ACCURATE-off restore physical', state.pathGeometry === 'physical');

if (failed) {
  console.error(`${failed} path geometry check(s) failed`);
  process.exit(1);
}
console.log('path_geometry_default: ok');
