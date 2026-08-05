/**
 * Tool-only golden sequences — no LLM, no browser DOM.
 * Documents expected tool ladders; pure parse + allowlist membership.
 */
import { HELIOS_AGENT_TOOLS } from '../js/agent/tools.js';
import { parseCampaignHint } from '../js/agent/campaign-parse.js';
import { GOLDEN_SCENARIOS, scoreToolOverlap, recommendToolsForText } from '../js/agent/eval-harness.js';
import { listPlaybooks, getPlaybook } from '../js/agent/playbooks.js';
import {
  snapshotCampaign, buildPlanRequestFromState, CAMPAIGN_SCHEMA_VERSION,
  pushCampaignStep, listCampaignSteps, undoCampaignStep, clearCampaign,
} from '../js/agent/campaign-object.js';
import { state } from '../js/state.js';
import { BODIES } from '../js/data/bodies.js';
import { paretoWindowShortlist } from '../js/physics/pareto-shortlist.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ TOOL GOLDENS (NO LLM) ━━━');

const toolNames = new Set(
  HELIOS_AGENT_TOOLS.map((t) => t.function?.name).filter(Boolean),
);

const LADDERS = {
  'campaign-setup': ['set_route', 'set_vehicle', 'set_departure', 'compute_route'],
  'nogo-ladder': ['get_watchdogs', 'propose_gate_recovery', 'apply_gate_recovery'],
  'studio-apply': ['get_window_families', 'apply_window_family', 'get_architecture_matrix', 'apply_architecture_row'],
  'path-honesty': ['get_path_truth', 'get_residual_dashboard'],
  'campaign-object': ['run_campaign_dag', 'get_path_truth', 'pin_plan', 'get_campaign_snapshot'],
  'review-recompute': ['get_campaign_snapshot', 'compute_route', 'get_path_truth'],
};

for (const [id, tools] of Object.entries(LADDERS)) {
  const missing = tools.filter((t) => !toolNames.has(t));
  check(`ladder ${id} tools in HELIOS_AGENT_TOOLS`, missing.length === 0, missing.join(',') || 'ok');
}

// Parse goldens
const harness = GOLDEN_SCENARIOS.map((g) => {
  const p = parseCampaignHint(g.text || '');
  return { id: g.id, parse: p, expect: g.expectTools };
});
check('harness scenarios loaded', harness.length >= 8);

// Recommend tools overlap for path golden
const rec = recommendToolsForText('path truth scene vs Need ARR ghost');
const ov = scoreToolOverlap(rec, ['get_path_truth']);
check('recommend includes get_path_truth', ov.hit >= 1, rec.join(','));

// Playbooks reference real-ish tool names
const pb = getPlaybook('pb-nogo-ladder');
check('nogo playbook exists', !!pb);
if (pb) {
  const actions = pb.steps.map((s) => s.action);
  check('nogo playbook has watchdogs or recovery', actions.some((a) => /watchdog|recovery/i.test(a)));
}
check('playbook count', listPlaybooks().length >= 4);

// Campaign object pure
clearCampaign();
state.routeOrigin = BODIES.find((b) => b.name === 'Earth');
state.routeDestination = BODIES.find((b) => b.name === 'Mars');
state.vehicleId = 'sh-starship';
state.starshipArch = 'unrefueled';
state.cargoMass_kg = 1000;
state.transferData = {
  departureSimTime: 0,
  transferTime: 200 * 86400,
  arrivalSimTime: 200 * 86400,
  lambertOk: true,
  dvTotal_lambert: 6000,
  dossier: { status: 'pass', mission_ready: true, need: { need_dv_m_s: 6000 }, margin: { feasible: true, margin_dv_m_s: 500 }, gates: [] },
  body1: state.routeOrigin,
  body2: state.routeDestination,
};
const pr = buildPlanRequestFromState(state);
check('plan_request has o/d', pr && pr.o && pr.d);
const snap = snapshotCampaign(state);
check('campaign schema version', snap.schema_version === CAMPAIGN_SCHEMA_VERSION);
check('snapshot plan_request', !!snap.plan_request);
pushCampaignStep({ kind: 'test', label: 'step A', source: 'test' });
pushCampaignStep({ kind: 'test', label: 'step B', source: 'test' });
check('timeline 2 steps', listCampaignSteps().length === 2);
const u = undoCampaignStep();
check('undo to step A', u?.label === 'step A');
clearCampaign();

// Pareto
const p = paretoWindowShortlist([
  { dv_m_s: 5000, tof_days: 300, dep_iso: '2031-01-01' },
  { dv_m_s: 6000, tof_days: 200, dep_iso: '2031-06-01' },
  { dv_m_s: 7000, tof_days: 400, dep_iso: '2032-01-01' }, // dominated by first? 7000>5000 and 400>300 yes
  { dv_m_s: 5500, tof_days: 250, dep_iso: '2031-03-01' },
]);
check('pareto non-empty', p.n_pareto >= 2);
check('dominated exists', p.dominated.length >= 1);

if (failed) {
  console.error(`${failed} tool golden check(s) failed`);
  process.exit(1);
}
console.log('tool_goldens: ok', { tools: toolNames.size, ladders: Object.keys(LADDERS).length });
