/**
 * Offline body-scale helpers (true-scale semi-true radii).
 */
import { AU } from '../js/constants.js';
import { state } from '../js/state.js';
import { bodySceneRadius } from '../js/scene/body-scale.js';
import { BODIES } from '../js/data/bodies.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const earth = BODIES.find((b) => b.name === 'Earth');
assert(earth, 'earth');

state.trueScaleBodies = false;
const d = bodySceneRadius(earth);
assert(Math.abs(d - earth.displayRadius) < 1e-12, 'display radius');

state.trueScaleBodies = true;
state.trueScaleBoost = 200;
const t = bodySceneRadius(earth);
const expected = Math.max((earth.radius / AU) * 200, 0.0015);
assert(Math.abs(t - expected) < 1e-12, `true scale ${t} vs ${expected}`);
assert(t < earth.displayRadius || t > 0, 'finite');

state.trueScaleBodies = false;
console.log('body_scale: ok');
