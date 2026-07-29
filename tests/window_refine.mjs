/**
 * Neighborhood window refine + multi-objective scoring.
 */
import { DAY, J2000 } from '../js/constants.js';
import { BODIES } from '../js/data/bodies.js';
import { defaultGridSpec, sweepPorkchopGrid } from '../js/physics/porkchop-grid.js';
import { buildWindowShortlist } from '../js/physics/window-shortlist.js';
import {
  scoreWindowCandidate, rankShortlistScored, refineShortlistNeighborhood,
} from '../js/physics/window-refine.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ WINDOW REFINE ━━━');

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const dep = (Date.UTC(2026, 10, 21, 12) - J2000) / 1000;
const grid = defaultGridSpec(earth, mars, dep, 24, 18);
const sweep = sweepPorkchopGrid(earth, mars, grid, { backend: 'approx' });
check('sweep has data', sweep?.data?.length > 0);

const seeds = buildWindowShortlist(sweep.data, grid, earth, mars, {
  topN: 5,
  planOpts: { backend: 'approx' },
  reevaluate: true,
});
check('shortlist non-empty', seeds.length >= 3, `n=${seeds.length}`);
check('shortlist ranked', seeds[0].rank === 1 && seeds[0].dv_m_s <= seeds[1].dv_m_s);

const s0 = scoreWindowCandidate(seeds[0]);
const bad = scoreWindowCandidate({ dv_m_s: seeds[0].dv_m_s + 5000, c3_m2_s2: 1e8, tof_days: 900, revolutions: 1 });
check('score finite for seed', Number.isFinite(s0));
check('worse candidate scores higher', bad > s0, `s0=${s0.toFixed(0)} bad=${bad.toFixed(0)}`);

const ranked = rankShortlistScored(seeds, { topN: 4, minDepDayGap: 3 });
check('rank returns ≤ topN', ranked.length <= 4 && ranked.length > 0);

const refined = refineShortlistNeighborhood(seeds, earth, mars, grid, {
  planOpts: { backend: 'approx' },
  subdiv: 2,
  topN: 5,
});
check('refined flag', refined.refined === true);
check('nEvals > seeds', refined.nEvals > seeds.length, `nEvals=${refined.nEvals}`);
check('refined shortlist', refined.shortlist.length > 0);
const bestSeed = Math.min(...seeds.map((s) => s.dv_m_s));
const bestRef = Math.min(...refined.shortlist.map((s) => s.dv_m_s));
check('refined best ≤ seed best (+1 m/s)', bestRef <= bestSeed + 1,
  `seed=${bestSeed.toFixed(0)} ref=${bestRef.toFixed(0)}`);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nwindow_refine: ok');
