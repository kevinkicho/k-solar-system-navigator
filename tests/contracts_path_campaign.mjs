/**
 * Contract suite — scene path, Mode A/B-ish defaults, path truth, apply helpers.
 * Prefer behavior over source greps.
 */
import {
  state, scenePathGeometry, pathSampleGeometry, PRODUCT_PATH_GEOMETRY,
} from '../js/state.js';
import { buildPathTruth, formatPathTruthLine } from '../js/physics/path-truth.js';
import { clusterWindowFamilies } from '../js/physics/window-families.js';
import { buildArchitectureMatrix } from '../js/physics/architecture-matrix.js';
import { BODIES } from '../js/data/bodies.js';
import { solveTransferOrbit, getShipPositionOnTransfer as shipPos } from '../js/physics/routing.js';
import { sampleTransferPathAtTime as samplePath } from '../js/physics/transfer-path.js';
import { DAY } from '../js/constants.js';
import { GOLDEN_SCENARIOS, runEvalHarness, recommendToolsForText } from '../js/agent/eval-harness.js';
import { listPlaybooks, getPlaybook } from '../js/agent/playbooks.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ CONTRACTS: PATH + CAMPAIGN ━━━');

// Scene path matrix
state.display = state.display || {};
state.physicsAccurate = false;
state.mapMode = false;
state.display.mode = 'cinematic';
state.pathGeometry = PRODUCT_PATH_GEOMETRY;
check('cinematic → scene visual', scenePathGeometry() === 'visual');
check('Need sample still physical when setting physical', pathSampleGeometry() === 'physical');

state.display.mode = 'schematic';
check('schematic + physical → scene physical', scenePathGeometry() === 'physical');
state.display.mode = 'cinematic';
state.physicsAccurate = true;
check('ACCURATE → scene physical', scenePathGeometry() === 'physical');
state.physicsAccurate = false;

// Ship ≡ line under cinematic visual
const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const depT = (Date.UTC(2026, 11, 1, 12) - Date.UTC(2000, 0, 1, 12)) / 1000;
const td = {
  body1: earth,
  body2: mars,
  departureSimTime: depT,
  transferTime: 259 * DAY,
  arrivalSimTime: depT + 259 * DAY,
};
solveTransferOrbit(td);
state.display.mode = 'cinematic';
check('Lambert ok for path truth', !!td.lambertOk);

let maxD = 0;
if (td.lambertOk) {
  for (let k = 0; k <= 10; k++) {
    const t = depT + (k / 10) * td.transferTime;
    const ship = shipPos(depT, td, t);
    const line = samplePath(td, t, { geometry: 'visual', exaggerate: true, offsetPolicy: 'time_varying' });
    if (!ship || !line) { maxD = Infinity; break; }
    maxD = Math.max(maxD, Math.hypot(ship.x - line.x, ship.y - line.y, ship.z - line.z));
  }
}
check('cinematic ship≡visual path ≤ 1e-6 AU', maxD <= 1e-6, `max=${maxD}`);

// Path truth
const truth = buildPathTruth(td, state, td.arrivalSimTime);
check('path truth ok', truth.ok === true);
check('path truth has scene geom', truth.scenePathGeometry === 'visual' || truth.scenePathGeometry === 'physical');
check('path truth line non-empty', formatPathTruthLine(truth).length > 20);
check('ARR residual finite or null', truth.pathEndVsArrivalBody_AU == null || Number.isFinite(truth.pathEndVsArrivalBody_AU));

// Window families structure
const fam = clusterWindowFamilies([
  { dep_iso: '2031-01-01', tof_days: 200, dv_m_s: 6000 },
  { dep_iso: '2033-06-01', tof_days: 500, dv_m_s: 7000 },
]);
check('families clustered', fam.families.length >= 1);
check('one recommended family', fam.families.filter((f) => f.recommended).length === 1);

// Architecture matrix
const matrix = buildArchitectureMatrix(
  { need_dv_m_s: 6000, applicable: true },
  { cargoMass_kg: 1000, originBody: earth },
);
check('matrix has rows', matrix.rows.length >= 4);

// Playbooks + eval harness
check('playbooks ≥ 4', listPlaybooks().length >= 4);
check('unrefueled mars playbook', !!getPlaybook('pb-unrefueled-mars'));
const harness = runEvalHarness();
check('eval harness ok', harness.ok, harness.failed?.join(','));
check('golden count', GOLDEN_SCENARIOS.length >= 6);
const rec = recommendToolsForText('apply architecture matrix and path truth');
check(
  'recommend tools hits matrix or path',
  rec.some((t) => /architecture|path|watchdog|brief/i.test(t)),
  rec.join(','),
);

// Tool-only golden sequences (documented contracts — no browser execute)
const TOOL_GOLDENS = [
  {
    id: 'campaign-setup',
    tools: ['set_route', 'set_vehicle', 'set_departure', 'compute_route'],
  },
  {
    id: 'nogo-ladder',
    tools: ['get_watchdogs', 'propose_gate_recovery', 'apply_gate_recovery'],
  },
  {
    id: 'studio-apply',
    tools: ['get_window_families', 'apply_window_family', 'get_architecture_matrix', 'apply_architecture_row'],
  },
  {
    id: 'path-honesty',
    tools: ['get_path_truth', 'get_residual_dashboard'],
  },
];
for (const g of TOOL_GOLDENS) {
  check(`tool golden ${g.id} non-empty`, g.tools.length >= 2);
}

if (failed) {
  console.error(`${failed} contract check(s) failed`);
  process.exit(1);
}
console.log('contracts_path_campaign: ok');
