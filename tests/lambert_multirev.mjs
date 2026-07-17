/**
 * Multi-rev Lambert (PR7) — single-rev regression + optional N≥1 search.
 */
import { AU, DAY, G_CONST } from '../js/constants.js';
import { SUN_DATA } from '../js/data/bodies.js';
import {
  solveLambertProblem, solveLambertBestBranch,
} from '../js/physics/lambert.js';
import { buildTransferOrbit, propagateOrbit } from '../js/physics/helio.js';
import { v3mag, v3sub } from '../js/physics/vec3.js';

const mu = G_CONST * SUN_DATA.mass;
let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ LAMBERT MULTI-REV ━━━');

// Earth-ish → Mars-ish class positions
const r1 = [AU, 0, 0];
const r2 = [0, 1.5 * AU, 0];
const tof = 250 * DAY;

const s0 = solveLambertProblem(r1, r2, tof, mu, false, 0);
check('N=0 short solves', !!s0);
if (s0) {
  const orb = buildTransferOrbit(r1, s0.v1, mu);
  const hit = propagateOrbit(orb, tof);
  const miss = v3mag(v3sub(hit, r2));
  check('N=0 miss < 1000 km', miss < 1e6, `miss=${(miss / 1000).toFixed(1)} km`);
}

const best0 = solveLambertBestBranch(r1, r2, tof, mu, null, null, { maxRevolutions: 0 });
check('best branch Nmax=0', !!best0 && (best0.revolutions ?? 0) === 0);

// Longer TOF for multi-rev opportunity
const tofLong = 800 * DAY;
const best1 = solveLambertBestBranch(r1, r2, tofLong, mu, null, null, { maxRevolutions: 1 });
check('best branch with Nmax=1 returns something', !!best1);
if (best1) {
  check('revolutions field set', best1.revolutions === 0 || best1.revolutions === 1,
    `N=${best1.revolutions}`);
  const hit = propagateOrbit(best1.orb, tofLong);
  const miss = v3mag(v3sub(hit, r2));
  check('chosen branch miss < 1000 km', miss < 1e6, `miss=${(miss / 1000).toFixed(1)} km N=${best1.revolutions}`);
}

// Direct N=1 attempt (may fail for this geometry — soft)
const s1 = solveLambertProblem(r1, r2, tofLong, mu, false, 1);
console.log(`  · N=1 short attempt: ${s1 ? 'solved' : 'no solution (ok)'}`);

if (failed) {
  console.error(`\n${failed} multi-rev check(s) failed`);
  process.exit(1);
}
console.log('\nAll multi-rev Lambert checks passed');
