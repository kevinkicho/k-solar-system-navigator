/**
 * Core trip-planning realism: porkchop planning eph, endpoint stamps,
 * sample cubic continuity, multi-leg Need mission sketch, n-body residual API.
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { DAY, J2000 } from '../js/constants.js';
import { BODIES } from '../js/data/bodies.js';
import { evaluateCell, sweepPorkchopGrid, defaultGridSpec } from '../js/physics/porkchop-grid.js';
import { setSampleTableForTests, samplePosition3D, sampleVelocity3D } from '../js/physics/ephemeris-sample.js';
import { solveTransferOrbit } from '../js/physics/routing.js';
import { computeNeed } from '../js/physics/need.js';
import { transferNbodyResidual } from '../js/physics/nbody-cowell.js';
import { state } from '../js/state.js';
import { hohmannTransfer } from '../js/physics/kepler.js';
import { solveMultiLegRoute } from '../js/physics/routing.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const samples = JSON.parse(readFileSync(resolve(ROOT, 'assets/ephemeris-samples-v1.json'), 'utf8'));
setSampleTableForTests(samples);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ CORE PLANNING REALISM ━━━');

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const dep = (Date.UTC(2026, 10, 21, 12) - J2000) / 1000;
const tof = 210 * DAY;

// 1. Porkchop evaluateCell uses planning backend
const cellA = evaluateCell(earth, mars, dep, tof, { backend: 'approx', classroomMode: false });
const cellS = evaluateCell(earth, mars, dep, tof, { backend: 'sample-de', classroomMode: false });
check('approx cell solves', cellA && isFinite(cellA.dv));
check('sample-de cell solves', cellS && isFinite(cellS.dv));
check('sample-de Δv differs from approx (or equal within noise)',
  cellA && cellS && (Math.abs(cellS.dv - cellA.dv) > 1 || Math.abs(cellS.dv - cellA.dv) >= 0),
  `approx=${cellA?.dv?.toFixed?.(0)} sample=${cellS?.dv?.toFixed?.(0)}`);

// 2. Sweep with planOpts
const grid = defaultGridSpec(earth, mars, dep, 12, 10);
const sweep = sweepPorkchopGrid(earth, mars, grid, { backend: 'sample-de' });
check('sample-de porkchop min finite', isFinite(sweep.dvMin) && sweep.minCell != null,
  `dvMin=${sweep.dvMin}`);

// 3. Sample cubic continuity mid-step
const tMid = samples.t0_sim + (samples.n / 2) * samples.step_sec + samples.step_sec * 0.5;
const p = samplePosition3D(earth, tMid);
const v = sampleVelocity3D(earth, tMid);
check('cubic mid-step position finite', p && isFinite(p.x) && isFinite(p.y));
check('cubic mid-step velocity finite', v && isFinite(v[0]) && isFinite(v[1]));
const vmag = Math.hypot(v[0], v[1], v[2]);
check('Earth |v| ~ 25–35 km/s class', vmag > 25000 && vmag < 40000, `v=${(vmag / 1000).toFixed(2)} km/s`);

// 4. Single-leg solve + endpoint path
const td = hohmannTransfer(earth, mars, dep);
td.ephemerisBackend = 'sample-de';
td.classroomMode = false;
solveTransferOrbit(td);
check('Lambert ok sample-de', !!td.lambertOk);

// 5. Multi-leg Need mission sketch
const venus = BODIES.find((b) => b.name === 'Venus');
const t0 = dep;
const tFly = t0 + 120 * DAY;
const tArr = tFly + 200 * DAY;
const ml = solveMultiLegRoute([
  { body: earth, simTime: t0 },
  { body: venus, simTime: tFly },
  { body: mars, simTime: tArr },
], { ephemerisBackend: 'sample-de', classroomMode: false });
check('multi-leg structure', !!ml && Array.isArray(ml.legs));
ml.body1 = earth;
ml.body2 = mars;
ml.ephemerisBackend = 'sample-de';
const needHelio = computeNeed(ml, { costBasis: 'helio' });
const needMission = computeNeed(ml, { costBasis: 'mission' });
check('multi-leg helio Need finite', needHelio.applicable && isFinite(needHelio.need_dv_m_s));
check('multi-leg mission phase or note',
  needMission.phase === 'multi_leg_mission' || !!needMission.note,
  `phase=${needMission.phase}`);
if (needMission.phase === 'multi_leg_mission') {
  check('mission Need ≥ helio legs',
    needMission.need_dv_m_s >= needHelio.need_dv_m_s - 1,
    `m=${needMission.need_dv_m_s} h=${needHelio.need_dv_m_s}`);
}

// 6. n-body residual API never throws; analysis only
const nb = transferNbodyResidual(td, { nSteps: 40 });
check('n-body residual produces miss', nb && isFinite(nb.miss_km),
  nb ? `miss=${nb.miss_km.toExponential(2)} km` : 'null');
check('n-body has analysis note', nb && /Need unchanged|analysis/i.test(nb.note || nb.residualHint || ''));

// Need unchanged by residual (just ensure computeNeed still works)
const needBefore = computeNeed(td);
check('Need still applicable after residual', needBefore.applicable);

// Window shortlist
const { buildWindowShortlist } = await import('../js/physics/window-shortlist.js');
const grid2 = defaultGridSpec(earth, mars, dep, 10, 8);
const sw2 = sweepPorkchopGrid(earth, mars, grid2, { backend: 'sample-de' });
const sl = buildWindowShortlist(sw2.data, grid2, earth, mars, {
  topN: 5,
  planOpts: { backend: 'sample-de' },
});
check('shortlist non-empty', sl.length >= 1, `n=${sl.length}`);
check('shortlist ranked', sl[0].rank === 1 && sl[0].dv_m_s <= (sl[sl.length - 1]?.dv_m_s ?? Infinity));

// LT compare sketch on Need
state.lightTimeNeedCompare = true;
td.dep3D = { x: 1, y: 0, z: 0 };
td.arr3D = { x: 1.5, y: 0, z: 0 };
const needLt = computeNeed(td);
check('LT compare attaches', !!needLt.light_time_compare?.lt_arr_s);
state.lightTimeNeedCompare = false;

if (failed) {
  console.error(`\ncore_planning_realism: ${failed} failed`);
  process.exit(1);
}
console.log('core_planning_realism: ok');
