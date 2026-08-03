/**
 * Product planning backend defaults to sample-de (not silent approx).
 */
import {
  resolvePlanningBackend, PRODUCT_PLANNING_BACKEND,
} from '../js/physics/planning-defaults.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ PLANNING BACKEND DEFAULT ━━━');
check('PRODUCT_PLANNING_BACKEND sample-de', PRODUCT_PLANNING_BACKEND === 'sample-de');
check('empty opts → sample-de', resolvePlanningBackend({}) === 'sample-de');
check('nullish → sample-de', resolvePlanningBackend() === 'sample-de');
check('explicit approx honored', resolvePlanningBackend({ backend: 'approx' }) === 'approx');
check('ephemerisBackend sample-de', resolvePlanningBackend({ ephemerisBackend: 'sample-de' }) === 'sample-de');
check('backend wins over missing', resolvePlanningBackend({ backend: 'approx', ephemerisBackend: undefined }) === 'approx');

if (failed) {
  console.error(`${failed} planning backend check(s) failed`);
  process.exit(1);
}
console.log('planning_backend_default: ok');
