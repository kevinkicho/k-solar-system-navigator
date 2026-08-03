/**
 * Studio depth pass 2 — waterfall, DoE, launch geometry, free-return, eval harness, rank API.
 */
import { buildNeedWaterfall } from '../js/physics/need-waterfall.js';
import { cargoSweep, tankerSweep, runVehicleDoe } from '../js/physics/vehicle-doe.js';
import { buildLaunchGeometryCard } from '../js/physics/launch-geometry-card.js';
import { sketchSampleReturn, canSketchSampleReturn } from '../js/physics/free-return-sketch.js';
import { rankPlanCandidates, scorePlanCandidate } from '../js/physics/plan-api-rank.js';
import {
  GOLDEN_SCENARIOS, runEvalHarness, scoreToolOverlap, recommendToolsForText,
} from '../js/agent/eval-harness.js';
import { BODIES } from '../js/data/bodies.js';
import { J2000 } from '../js/constants.js';
import '../js/physics/routing.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const need = { need_dv_m_s: 6200, applicable: true };

// Waterfall
const wf = buildNeedWaterfall({
  need,
  vehicleId: 'sh-starship',
  dsmNodes: [{ dv_m_s: 50 }],
  captureBudget_m_s: 200,
});
assert(wf.rows.length >= 4, 'waterfall rows');
assert(wf.lambert_need_m_s === 6200, 'lambert authority');
assert(wf.stack_outside_lambert_m_s > 200, 'outside stack includes ascent+dsm+capture');
assert(/Lambert/i.test(wf.note), 'honesty');

// DoE
const doe = runVehicleDoe(need, { cargoMass_kg: 2000, originBody: earth });
assert(doe.cargo.rows.length >= 4, 'cargo sweep');
assert(doe.tankers.rows.length >= 5, 'tanker sweep');
assert(cargoSweep(need, { cargos_kg: [0, 1000] }).rows.length === 2, 'cargo custom');
assert(tankerSweep(need, { cargoMass_kg: 1000, maxTankers: 3 }).rows.length === 4, 'tanker 0..3');

// Launch geometry card (no td → incomplete)
const emptyCard = buildLaunchGeometryCard(null, { launchSiteId: 'cape' });
assert(emptyCard.ok === false, 'no td');
const card = buildLaunchGeometryCard({
  dossier: { geometry: { dla_deg: 28, rla_deg: 10, vinf_dep_m_s: 3500 } },
}, { launchSiteId: 'cape' });
assert(card.ok, 'card ok');
assert(card.lines.length >= 3, 'lines');

// Sample-return sketch
assert(canSketchSampleReturn(earth, mars), 'can sketch');
const dep = (Date.UTC(2031, 0, 10, 12) - J2000) / 1000;
const sr = sketchSampleReturn(earth, mars, dep, { ephemerisBackend: 'approx' }, { stay_days: 20 });
assert(sr.ok || sr.partial, 'sample return structure');
assert(/not a free-return|NOT a free-return/i.test(sr.note || ''), 'free-return honesty');

// Rank API pure
const ranked = rankPlanCandidates([
  { dep_iso: '2031-01-01', tof_days: 200, dv_m_s: 7000 },
  { dep_iso: '2031-06-01', tof_days: 220, dv_m_s: 6000 },
  { dep_iso: '2033-01-01', tof_days: 400, dv_m_s: 6500 },
], { topN: 2 });
assert(ranked.ok && ranked.ranked.length === 2, 'rank top2');
assert(ranked.ranked[0].dv_m_s <= ranked.ranked[1].dv_m_s, 'sorted by score~dv');
assert(scorePlanCandidate({ dv_m_s: 1000 }) < scorePlanCandidate({ dv_m_s: 9000 }), 'score order');

// Eval harness
const harness = runEvalHarness();
assert(harness.n === GOLDEN_SCENARIOS.length, 'golden count');
assert(harness.ok, `parse goldens failed: ${harness.failed?.join(',')}`);
const ov = scoreToolOverlap(['run_mission_campaign', 'set_route'], ['run_mission_campaign', 'compute_route']);
assert(ov.hit === 1 && ov.missing.includes('compute_route'), 'overlap');
const rec = recommendToolsForText('run playbook for architecture matrix');
assert(rec.includes('run_playbook') || rec.includes('get_architecture_matrix'), 'recommend');

console.log('studio_depth2: ok', {
  wfRows: wf.rows.length,
  doeCargo: doe.cargo.rows.length,
  sampleReturn: sr.kind || sr.partial,
  harnessN: harness.n,
});
