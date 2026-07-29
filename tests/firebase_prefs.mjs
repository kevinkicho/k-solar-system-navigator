/**
 * Offline unit tests for cloud prefs + last-route builders.
 */
import { prefsFromState, applyPrefsToState } from '../js/firebase/prefs.js';
import { lastRouteFromTransfer } from '../js/firebase/rtdb.js';
import { state } from '../js/state.js';
import { DAY } from '../js/constants.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const p = prefsFromState();
assert(p.schema_version === 1, 'schema');
assert(p.vehicleId, 'vehicle');
assert(typeof p.map_mode === 'boolean', 'map_mode');

const prevVeh = state.vehicleId;
state.vehicleId = 'abstract';
applyPrefsToState({ vehicleId: 'falcon9', costBasis: 'mission', path_geometry: 'both' });
assert(state.vehicleId === 'falcon9', 'apply vehicle');
assert(state.costBasis === 'mission', 'apply basis');
assert(state.pathGeometry === 'both', 'apply geom');
state.vehicleId = prevVeh;

const lr = lastRouteFromTransfer({
  body1: { name: 'Earth', id: 'earth' },
  body2: { name: 'Mars', id: 'mars' },
  departureSimTime: 0,
  transferTime: 200 * DAY,
});
assert(lr.o && lr.d, 'last route ids');
assert(lr.tof === 200, 'tof');
assert(lr.label.includes('Earth'), 'label');
assert(lastRouteFromTransfer(null) === null, 'null');

console.log('firebase_prefs: ok');
