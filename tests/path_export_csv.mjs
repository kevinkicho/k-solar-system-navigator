/**
 * Offline path CSV export + residual helper (no Three.js).
 */
import { DAY } from '../js/constants.js';
import { BODIES } from '../js/data/bodies.js';
import { solveTransferOrbit } from '../js/physics/routing.js';
import { buildPathCsv } from '../js/ui/path-export.js';
import { measurePathResidual } from '../js/ui/trajectory-hud.js';
import { state } from '../js/state.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
assert(earth && mars, 'bodies');
// Present product defaults: physical + cinematic_endpoints (ship ≡ dashed path)
state.pathGeometry = 'physical';
state.productMode = 'present';
state.mapMode = false;
state.physicsAccurate = false;
state.display = state.display || {};
state.display.mode = 'cinematic';

// ~2026-04-23 class departure
const depSim = (Date.UTC(2026, 3, 23, 12) - Date.UTC(2000, 0, 1, 12)) / 1000;
const td = {
  body1: earth,
  body2: mars,
  departureSimTime: depSim,
  transferTime: 259 * DAY,
  arrivalSimTime: depSim + 259 * DAY,
};
solveTransferOrbit(td);
assert(td.lambertOk, 'lambert ok');

const csv = buildPathCsv(td, { nSamples: 33 });
assert(csv.includes('x_AU'), 'header');
assert(csv.includes('HELIOS transfer path'), 'banner');
assert(csv.split('\n').length > 30, 'rows');

const res = measurePathResidual(td);
assert(res.maxAU != null, 'residual');
assert(res.maxAU < 1e-3, `ship-line residual small got ${res.maxAU}`);

// mapMode flag exists
assert(typeof state.mapMode === 'boolean', 'mapMode state');
assert(typeof state.showTransferRibbon === 'boolean', 'ribbon state');

console.log('path_export_csv: ok residual=', res.maxAU);
