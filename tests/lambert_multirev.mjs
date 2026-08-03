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
import {
  resolveMaxRevolutionsForTof, AUTO_MULTI_REV_TOF_SEC,
} from '../js/physics/planning-defaults.js';

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

// Golden: long Earth–Mars-class TOF with Nmax=1 must close and stay in Δv band
const rEarth = [1.0 * AU, 0, 0];
const rMars = [0.2 * AU, 1.52 * AU, 0];
const tofGold = 700 * DAY;
const gold = solveLambertBestBranch(rEarth, rMars, tofGold, mu, null, null, { maxRevolutions: 1 });
check('golden long-TOF branch solves', !!gold);
if (gold) {
  const hitG = propagateOrbit(gold.orb, tofGold);
  const missG = v3mag(v3sub(hitG, rMars));
  check('golden long-TOF miss < 1000 km', missG < 1e6, `miss=${(missG / 1000).toFixed(1)} km N=${gold.revolutions}`);
  const dv1 = gold.v1 ? v3mag(gold.v1) : null;
  // Heliocentric |v1| class for inner-system multi-rev: ~15–45 km/s
  if (dv1 != null) {
    check('golden |v1| in 15–45 km/s class', dv1 > 15000 && dv1 < 45000, `v1=${(dv1 / 1000).toFixed(2)} km/s`);
  }
  check('golden revolutions 0 or 1', gold.revolutions === 0 || gold.revolutions === 1, `N=${gold.revolutions}`);
}

// Policy helper: long TOF auto multi-rev
check('auto multi-rev TOF threshold ~400d', AUTO_MULTI_REV_TOF_SEC > 300 * DAY);
check('long TOF policy → 1', resolveMaxRevolutionsForTof(500 * DAY, {}) === 1);
check('short TOF policy → 0', resolveMaxRevolutionsForTof(100 * DAY, {}) === 0);
check('flag forces multi-rev', resolveMaxRevolutionsForTof(100 * DAY, { multiRevLambert: true, multiRevMax: 1 }) === 1);

if (failed) {
  console.error(`\n${failed} multi-rev check(s) failed`);
  process.exit(1);
}
console.log('\nAll multi-rev Lambert checks passed');
