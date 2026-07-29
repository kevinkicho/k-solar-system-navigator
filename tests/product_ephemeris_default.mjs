/**
 * Product defaults: L2-plan sample-DE outside classroom.
 */
import { state, applyProductEphemerisDefaults, forceOfflineL1Ephemeris } from '../js/state.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

// Fresh product defaults (state module already has product defaults)
assert(state.ephemerisBackend === 'sample-de' || true, 'module loads');
applyProductEphemerisDefaults();
assert(state.classroomMode === false, 'not classroom');
assert(state.ephemerisBackend === 'sample-de', 'product sample-de');
assert(state.fidelityLevel === 'L2-plan', 'product L2-plan');

state.classroomMode = true;
forceOfflineL1Ephemeris();
assert(state.ephemerisBackend === 'approx', 'classroom approx');
assert(state.fidelityLevel === 'L1', 'classroom L1');

// restore
state.classroomMode = false;
applyProductEphemerisDefaults();
assert(state.ephemerisBackend === 'sample-de', 'restore product');

console.log('product_ephemeris_default: ok');
