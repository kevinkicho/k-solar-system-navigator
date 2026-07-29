/**
 * Horizons endpoint inject (mocked network) + provider priority.
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { J2000, DAY, AU } from '../js/constants.js';
import { BODIES } from '../js/data/bodies.js';
import {
  clearHorizonsInjectCache,
  injectHorizonsEndpoint,
  getHorizonsInjected,
  injectHorizonsEndpoints,
} from '../js/physics/ephemeris-horizons-inject.js';
import {
  getPlanningPosition3D,
  effectiveBackend,
} from '../js/physics/ephemeris-provider.js';
import { setSampleTableForTests } from '../js/physics/ephemeris-sample.js';
import { eclipticPosToScene } from '../js/physics/ephemeris-horizons.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const earth = BODIES.find((b) => b.name === 'Earth');
const t = (Date.UTC(2026, 5, 1, 12) - J2000) / 1000;

// Load sample table
const table = JSON.parse(readFileSync(resolve(ROOT, 'assets/ephemeris-samples-v1.json'), 'utf8'));
setSampleTableForTests(table);
assert(table.version >= 2 || table.n > 2000, 'expanded sample table');
assert(table.step_days === 3, '3-day step');

// Mock Horizons text response (labeled vectors)
const mockX = 0.5;
const mockY = 0.1;
const mockZ = -0.2;
function mockFetch() {
  return Promise.resolve({
    ok: true,
    text: async () => `$$SOE
 X = ${mockX}E+00 Y = ${mockY}E+00 Z = ${mockZ}E+00
 VX= 1.0E-02 VY= 2.0E-02 VZ= 3.0E-02
$$EOE`,
  });
}

clearHorizonsInjectCache();
const hit = await injectHorizonsEndpoint({ body: earth, timeSec: t, fetchImpl: mockFetch });
assert(hit, 'inject hit');
const scene = eclipticPosToScene({ x: mockX, y: mockY, z: mockZ });
assert(Math.abs(hit.x - scene.x) < 1e-12, 'scene x');
assert(Math.abs(hit.y - scene.y) < 1e-12, 'scene y');
assert(Math.abs(hit.z - scene.z) < 1e-12, 'scene z');
assert(hit.v && hit.v.length === 3, 'velocity array');

const cached = getHorizonsInjected(earth, t);
assert(cached && cached.x === hit.x, 'cache');

const eff = effectiveBackend(earth, t, 'sample-de', {});
assert(eff.backend === 'horizons-inject', 'inject wins over sample');
assert(eff.horizonsHit === true, 'horizonsHit');

const p = getPlanningPosition3D(earth, t, { backend: 'sample-de' });
assert(Math.abs(p.x - scene.x) < 1e-12, 'planning uses inject');

// Classroom never uses inject even if cache full
const effC = effectiveBackend(earth, t, 'sample-de', { classroomMode: true });
assert(effC.backend === 'approx', 'classroom approx');

const multi = await injectHorizonsEndpoints(
  [{ body: earth, timeSec: t }, { body: earth, timeSec: t + DAY }],
  { fetchImpl: mockFetch },
);
assert(multi.ok >= 1, 'multi inject');

clearHorizonsInjectCache();
console.log('horizons_inject: ok');
