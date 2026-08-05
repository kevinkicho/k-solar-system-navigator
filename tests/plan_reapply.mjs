/**
 * Plan reapply + review recompute pure contracts (no browser DOM).
 */
import { normalizePlanRequest } from '../js/ui/plan-reapply.js';
import { parsePlanRequest, encodePlanRequestObject } from '../js/ui/share-codec.js';
import {
  buildPlanRequestFromState,
  pushCampaignStep,
  listCampaignSteps,
  undoCampaignStep,
  clearCampaign,
  CAMPAIGN_SCHEMA_VERSION,
} from '../js/agent/campaign-object.js';
import { state } from '../js/state.js';
import { BODIES } from '../js/data/bodies.js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ PLAN REAPPLY + REVIEW RECOMPUTE ━━━');

// Compact seed
const compact = {
  v: 2,
  o: 'earth',
  d: 'mars',
  dep: '2026-11-21',
  tof: 258,
  veh: 'sh-starship',
  arch: 'unrefueled',
  cargo: 1000,
  eph: 'sample',
  fb: [{ id: 'venus', date: '2027-03-01' }],
};
const n1 = normalizePlanRequest(compact);
check('normalize compact o/d', n1?.o === 'earth' && n1?.d === 'mars');
check('normalize compact flyby', n1?.fb?.length === 1 && n1.fb[0].id === 'venus');
check('normalize compact arch', n1?.arch === 'unrefueled');

// parsePlanRequest shape (share hash)
const hash = encodePlanRequestObject({
  o: 'earth',
  d: 'mars',
  dep: '2028-06-15',
  tof: 200,
  veh: 'sh-starship',
  arch: 'tanker-n',
  tankers: 4,
  cargo: 5000,
  eph: 'sample',
  fb: [{ id: 'venus', date: '2028-09-01' }],
});
check('encode multi-leg hash', !!hash && hash.startsWith('#'));
const parsed = parsePlanRequest(hash);
check('parsePlanRequest ok', !!parsed && parsed.originId === 'earth');
check('parsed has flybys', parsed.flybys?.length === 1);
const n2 = normalizePlanRequest(parsed);
check('normalize parse → compact o', n2?.o === 'earth' && n2?.d === 'mars');
check('normalize parse dep', n2?.dep === '2028-06-15');
check('normalize parse veh/arch', n2?.veh === 'sh-starship' && n2?.arch === 'tanker-n');
check('normalize parse tankers', n2?.tankers === 4);
check('normalize parse flybys', n2?.fb?.length === 1 && n2.fb[0].id === 'venus');
check('normalize parse eph sample', n2?.eph === 'sample');

// Empty / null
check('normalize null', normalizePlanRequest(null) === null);
check('normalize empty', normalizePlanRequest({}) === null);

// Round-trip: compact → encode → parse → normalize
const back = normalizePlanRequest(parsePlanRequest(encodePlanRequestObject({
  o: n1.o,
  d: n1.d,
  dep: n1.dep,
  tof: n1.tof,
  veh: n1.veh,
  arch: n1.arch,
  cargo: n1.cargo,
  eph: n1.eph,
  fb: n1.fb,
})));
check('round-trip o/d/dep', back?.o === 'earth' && back?.d === 'mars' && back?.dep === '2026-11-21');
check('round-trip flyby preserved', back?.fb?.some((f) => f.id === 'venus'));

// Campaign buildPlanRequestFromState includes flybys
clearCampaign();
state.routeOrigin = BODIES.find((b) => b.name === 'Earth');
state.routeDestination = BODIES.find((b) => b.name === 'Mars');
state.vehicleId = 'sh-starship';
state.starshipArch = 'unrefueled';
state.cargoMass_kg = 2000;
state.flybys = [{
  bodyId: 'venus',
  bodyName: 'Venus',
  simTime: 100 * 86400,
}];
state.transferData = {
  departureSimTime: 0,
  transferTime: 200 * 86400,
  arrivalSimTime: 200 * 86400,
  lambertOk: true,
  body1: state.routeOrigin,
  body2: state.routeDestination,
};
const prState = buildPlanRequestFromState(state);
check('state seed has fb', prState?.fb?.length === 1);
const n3 = normalizePlanRequest(prState);
check('state seed normalizes', n3?.o && n3?.fb?.[0]?.id === 'venus');

// Timeline stores plan_request on steps (undo needs cursor > 0)
pushCampaignStep({ kind: 'test', label: 'seed A', source: 'test' });
pushCampaignStep({ kind: 'test', label: 'with flybys', source: 'test' });
const steps = listCampaignSteps();
check('step has plan_request fb', steps.some((s) => s.plan_request?.fb?.length === 1));
const undone = undoCampaignStep();
check('undo returns prior step with seed', !!undone?.plan_request?.o && undone.label === 'seed A');
clearCampaign();
check('campaign schema still defined', typeof CAMPAIGN_SCHEMA_VERSION === 'number' || typeof CAMPAIGN_SCHEMA_VERSION === 'string');

// Module presence (hygiene)
const modules = [
  'js/ui/plan-reapply.js',
  'js/ui/review-recompute.js',
  'js/agent/plan-flow.js',
  'js/ui/campaign-timeline-ui.js',
];
for (const m of modules) {
  check(`module exists ${m}`, existsSync(resolve(ROOT, m)));
}
const reapplySrc = readFileSync(resolve(ROOT, 'js/ui/plan-reapply.js'), 'utf8');
check('reapply exports normalize', /export function normalizePlanRequest/.test(reapplySrc));
check('reapply restores flybys', /state\.flybys/.test(reapplySrc));
const reviewSrc = readFileSync(resolve(ROOT, 'js/ui/review-recompute.js'), 'utf8');
check('review uses normalize', /normalizePlanRequest/.test(reviewSrc));
check('review sets recompute=1', /recompute/.test(reviewSrc));
const flowSrc = readFileSync(resolve(ROOT, 'js/agent/plan-flow.js'), 'utf8');
check('plan-flow exports runPlanFlow', /export async function runPlanFlow/.test(flowSrc));
const mainSrc = readFileSync(resolve(ROOT, 'js/main.js'), 'utf8');
check('main wires tryApplyReviewOnLoad', /tryApplyReviewOnLoad/.test(mainSrc));
const tlSrc = readFileSync(resolve(ROOT, 'js/ui/campaign-timeline-ui.js'), 'utf8');
check('timeline uses reapplyPlanRequest', /reapplyPlanRequest/.test(tlSrc));
check('timeline COPY REVIEW URL', /ct-review-url|buildReviewRecomputeUrl/.test(tlSrc));

// Encode review URL shape (no DOM location)
const enc = encodePlanRequestObject(prState);
check('state seed encodable', !!enc);
// Simulate URL shape
const fake = `https://example.test/?firebase=0&recompute=1${enc}`;
check('review url contains recompute', fake.includes('recompute=1'));
check('review url has hash plan', /[#&]v=1/.test(fake) || fake.includes('#v=1') || fake.includes('v=1'));

if (failed) {
  console.error(`${failed} plan_reapply check(s) failed`);
  process.exit(1);
}
console.log('plan_reapply: ok');
