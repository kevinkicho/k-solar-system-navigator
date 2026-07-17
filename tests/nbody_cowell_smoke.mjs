/**
 * Cowell n-body overlay smoke (PR10) — never feeds Need.
 */
import { cowellSunOnlyMatchesKeplerSmoke, cowellPropagate } from '../js/physics/nbody-cowell.js';
import { AU, DAY } from '../js/constants.js';
import { G_CONST } from '../js/constants.js';
import { SUN_DATA } from '../js/data/bodies.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ N-BODY COWELL SMOKE ━━━');

check('sun-only short arc stays near 1 AU', cowellSunOnlyMatchesKeplerSmoke());

const mu = G_CONST * SUN_DATA.mass;
const r0 = [AU, 0, 0];
const v0 = [0, Math.sqrt(mu / AU), 0];
const out = cowellPropagate(r0, v0, 0, 30 * DAY, 80);
check('points produced', out.points_AU.length > 5, `n=${out.points_AU.length}`);
check('residual hint string', /educational residual/i.test(out.residualHint || ''));
const last = out.points_AU[out.points_AU.length - 1];
check('finite end', isFinite(last.x) && isFinite(last.y) && isFinite(last.z));

// Need invariant is architectural — assert API doesn't expose need mutation
check('API has no need field', !('need_dv_m_s' in out));

if (failed) {
  console.error(`\n${failed} n-body smoke check(s) failed`);
  process.exit(1);
}
console.log('\nAll n-body cowell smoke checks passed');
