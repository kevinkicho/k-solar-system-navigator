/**
 * Adaptive path densify (PR6) — max segment shrinks when adaptive ON.
 */
import { BODIES } from '../js/data/bodies.js';
import { DAY } from '../js/constants.js';
import { solveTransferOrbit } from '../js/physics/routing.js';
import { buildTransferPathSamples } from '../js/physics/transfer-path.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

function maxHelioSeg(points) {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].r_helio, b = points[i].r_helio;
    if (!a || !b) continue;
    m = Math.max(m, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return m;
}

console.log('\n━━━ ADAPTIVE PATH SAMPLING ━━━');

const earth = BODIES.find((b) => b.name === 'Earth');
const jup = BODIES.find((b) => b.name === 'Jupiter');
const depT = (Date.parse('2030-01-01T12:00:00Z') - Date.UTC(2000, 0, 1, 12)) / 1000;
const td = {
  body1: earth, body2: jup,
  departureSimTime: depT,
  transferTime: 1000 * DAY,
  arrivalSimTime: depT + 1000 * DAY,
};
solveTransferOrbit(td);
check('Lambert ok', td.lambertOk === true);

const coarse = buildTransferPathSamples(td, {
  nSamples: 64, adaptive: false, offsetPolicy: 'none',
});
const dense = buildTransferPathSamples(td, {
  nSamples: 64, adaptive: true, maxSamples: 512, offsetPolicy: 'none',
});
check('coarse built', coarse.points.length >= 64);
check('adaptive densifies or equals', dense.points.length >= coarse.points.length,
  `coarse=${coarse.points.length} dense=${dense.points.length}`);

const mc = maxHelioSeg(coarse.points);
const md = maxHelioSeg(dense.points);
check('adaptive max segment ≤ coarse (or both small)', md <= mc * 1.01 + 1e-9,
  `coarse=${mc.toFixed(4)} dense=${md.toFixed(4)} AU`);
// Soft C9-class: densified high-e should not be huge multi-AU when adaptive
check('adaptive max segment finite', isFinite(md) && md < 20, `max=${md.toFixed(3)}`);

if (failed) {
  console.error(`\n${failed} adaptive path check(s) failed`);
  process.exit(1);
}
console.log('\nAll adaptive path checks passed');
