/**
 * Domain spine Phases 1–5 contracts (offline, no browser).
 */
import {
  normalizePlanRequest,
  buildPlanRequestFromState,
  digestPlanSeed,
} from '../js/domain/plan-seed.js';
import {
  dispatchPlanCommand,
  setPlanCommandRecorder,
  getPlanSessionSnapshot,
} from '../js/domain/plan-commands.js';
import { buildPlanResult, planResultDigest } from '../js/domain/plan-result.js';
import {
  PRODUCT_MODES,
  PRODUCT_MODE_IDS,
  getProductMode,
  wantDualPathOverlay,
} from '../js/domain/display-modes.js';
import { parsePlanRequest, encodePlanRequestObject } from '../js/ui/share-codec.js';
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

console.log('\n━━━ DOMAIN SPINE (PHASES 1–5) ━━━');

// Command recorder mock (Phase 2 goldens style)
const recorded = [];
setPlanCommandRecorder((cmd) => recorded.push(cmd));
await dispatchPlanCommand({ type: 'SET_MODE', mode: 'analyze' });
await dispatchPlanCommand({ type: 'COMPUTE' });
await dispatchPlanCommand({ type: 'APPLY_SEED', seed: { o: 'earth', d: 'mars', dep: '2028-01-01' } });
setPlanCommandRecorder(null);
check('mock recorder captured 3', recorded.length === 3);
check('mock has SET_MODE', recorded.some((c) => c.type === 'SET_MODE'));
check('mock has COMPUTE', recorded.some((c) => c.type === 'COMPUTE'));
check('mock has APPLY_SEED', recorded.some((c) => c.type === 'APPLY_SEED'));

// Display modes
check('4 product modes', PRODUCT_MODE_IDS.length === 4);
check('present no dual', PRODUCT_MODES.present.dualOverlay === false);
check('compare dual', PRODUCT_MODES.compare.dualOverlay === true);
check('ops dual', PRODUCT_MODES.ops.dualOverlay === true);
state.productMode = 'present';
state.mapMode = false;
state.physicsAccurate = false;
state.pathGeometry = 'physical';
check('present wantDual false unless both', wantDualPathOverlay(state) === false);
state.productMode = 'compare';
check('compare wantDual true', wantDualPathOverlay(state) === true);

// Plan result
state.routeOrigin = BODIES.find((b) => b.name === 'Earth');
state.routeDestination = BODIES.find((b) => b.name === 'Mars');
state.vehicleId = 'sh-starship';
state.starshipArch = 'unrefueled';
state.transferData = {
  departureSimTime: 0,
  arrivalSimTime: 200 * 86400,
  transferTime: 200 * 86400,
  lambertOk: true,
  dvTotal_lambert: 5500,
  body1: state.routeOrigin,
  body2: state.routeDestination,
  dossier: {
    status: 'pass',
    mission_ready: true,
    need: { need_dv_m_s: 5500 },
    margin: { feasible: true, margin_dv_m_s: 400 },
    gates: [],
  },
};
const pr = buildPlanResult();
check('plan result schema', pr?.schema === 1);
check('plan result assessment need', pr?.assessment?.need_dv_m_s === 5500);
check('plan result mission_ready', pr?.assessment?.mission_ready === true);
check('plan result seed digest', !!pr?.seedDigest);
check('plan result digest compact', !!planResultDigest(pr)?.seedDigest);

// Share path uses domain modules
const shareSrc = readFileSync(resolve(ROOT, 'js/ui/share.js'), 'utf8');
check('share apply uses domain reapply', /domain\/plan-apply|reapplyPlanRequest/.test(shareSrc));
check('share not using solveMultiLeg inline', !/solveMultiLegRoute/.test(shareSrc));

// Agent campaign no click
const campSrc = readFileSync(resolve(ROOT, 'js/agent/campaign.js'), 'utf8');
check('campaign uses dispatchPlanCommand', /dispatchPlanCommand/.test(campSrc));
check('campaign no find-windows click', !/find-windows.*click|btn-ga-suggest.*click/.test(campSrc));

const onboardSrc = readFileSync(resolve(ROOT, 'js/agent/onboard.js'), 'utf8');
check('onboard set_vehicle via plan-actions', /applyVehicleArgs|plan-actions/.test(onboardSrc));
check('onboard no vehicle-select click automation required', !/btn-ga-suggest\)\?\.click/.test(onboardSrc));

// Mission package plan_result
const expSrc = readFileSync(resolve(ROOT, 'js/ui/mission-export.js'), 'utf8');
check('export includes plan_result', /plan_result/.test(expSrc));
check('export includes plan_result_digest', /plan_result_digest/.test(expSrc));

// Domain modules exist
for (const m of [
  'js/domain/plan-seed.js',
  'js/domain/plan-apply.js',
  'js/domain/plan-commands.js',
  'js/domain/plan-result.js',
  'js/domain/display-modes.js',
  'js/domain/plan-actions.js',
  'js/domain/wait-plan.js',
  'js/domain/workflow-runner.js',
  'js/domain/index.js',
]) {
  check(`exists ${m}`, existsSync(resolve(ROOT, m)));
}

// Product mode in HTML
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
check('product-mode-select in HTML', /product-mode-select/.test(html));

// Deploy primary declared
const deploy = readFileSync(resolve(ROOT, 'docs/DEPLOY.md'), 'utf8');
check('DEPLOY mentions App Hosting primary', /App Hosting \(primary/i.test(deploy));

// Round-trip seed still works
const hash = encodePlanRequestObject({
  o: 'earth', d: 'mars', dep: '2029-05-01', tof: 210, veh: 'sh-starship', arch: 'unrefueled',
});
const parsed = parsePlanRequest(hash);
const n = normalizePlanRequest(parsed);
check('share→normalize o/d', n?.o === 'earth' && n?.d === 'mars');
check('digest stable', digestPlanSeed(n) === digestPlanSeed(n));

const snap = getPlanSessionSnapshot();
check('session snapshot has productMode', !!snap.productMode || snap.productMode === 'present');

if (failed) {
  console.error(`${failed} domain_spine check(s) failed`);
  process.exit(1);
}
console.log('domain_spine: ok');
