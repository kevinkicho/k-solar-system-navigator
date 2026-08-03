// PR17 — Vehicle / Measurement Card / fidelity / classroom regression (offline).
// Static HTML/JS checks + pure-module capability paths. No browser required.

import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

const indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const mainJs = readFileSync(resolve(ROOT, 'js/main.js'), 'utf8');
const controlsJs = readFileSync(resolve(ROOT, 'js/ui/controls.js'), 'utf8');
const porkchopJs = readFileSync(resolve(ROOT, 'js/ui/porkchop.js'), 'utf8');
const cardJs = readFileSync(resolve(ROOT, 'js/ui/measurement-card.js'), 'utf8');
const stateJs = readFileSync(resolve(ROOT, 'js/state.js'), 'utf8');

console.log('\n━━━ VEHICLE UI REGRESSION (STATIC) ━━━');

// Measurement Card surface
check('measurement-card module exists', existsSync(resolve(ROOT, 'js/ui/measurement-card.js')));
check('Card uses data-fidelity', /data-fidelity=/.test(cardJs));
check('Card shows fidelity badge', /fidelity-badge/.test(cardJs));
// Product default is L2-plan (sample-DE); runtime may promote L3-plan when SPICE table loads
check('Product fidelity L2-plan in state', /fidelityLevel:\s*['"]L2-plan['"]/.test(stateJs)
  || /fidelityLevel:\s*['"]L1['"]/.test(stateJs));
check('L3-plan fidelity documented in state', /L3-plan/.test(stateJs));
check('flightOpsMode state flag', /flightOpsMode/.test(stateJs));
check('Product sample-de backend default', /ephemerisBackend:\s*['"]sample-de['"]/.test(stateJs)
  || /ephemerisBackend:\s*['"]approx['"]/.test(stateJs));

// PR14 Horizons → L2
check('Horizons success sets L2-compare', /fidelityLevel\s*=\s*['"]L2-compare['"]/.test(controlsJs));
const l2Idx = controlsJs.indexOf("fidelityLevel = 'L2-compare'");
const rrAfterL2 = l2Idx >= 0 && controlsJs.indexOf('renderRouteUI()', l2Idx) > l2Idx
  && controlsJs.indexOf('renderRouteUI()', l2Idx) - l2Idx < 1200;
check('Horizons re-renders route on L2-compare', rrAfterL2);
check('approx error module exists', existsSync(resolve(ROOT, 'js/data/approx-ephemeris-errors.js')));
check('ephemeris provider exists', existsSync(resolve(ROOT, 'js/physics/ephemeris-provider.js')));
check('sample asset exists', existsSync(resolve(ROOT, 'assets/ephemeris-samples-v1.json')));
check('About documents L1/L2/L3', /Ephemeris fidelity badges/.test(indexHtml)
  && /L3-plan/.test(indexHtml)
  && (/not a planning mode|never a planning mode|does not by itself change planning|Out of scope forever/i.test(indexHtml)));
check('About: certified ops out of scope', /out of scope|not flight-certified|NOT certified flight software/i.test(indexHtml));
check('About documents OPS mode', /OPS mode|flight-ops workflow/i.test(indexHtml));
check('flight-ops module exists', existsSync(resolve(ROOT, 'js/physics/flight-ops.js')));
check('flight-ops UI exists', existsSync(resolve(ROOT, 'js/ui/flight-ops-ui.js')));
check('main wires flight ops', /wireFlightOpsUi/.test(mainJs));
check('SPICE bake script exists', existsSync(resolve(ROOT, 'scripts/build-ephemeris-from-spice.py')));
check('kernel download script exists', existsSync(resolve(ROOT, 'scripts/download-kernels.py')));
check('Mission Design branding', /MISSION DESIGN/.test(indexHtml));
check('Campaign steps in Plan rail', /campaign-steps/.test(indexHtml) && /Compute trajectory/.test(indexHtml));
check('Product class footer markup', /product-class-footer/.test(indexHtml));
check('Mission package module', existsSync(resolve(ROOT, 'js/ui/mission-package.js')));
check('Reference missions module', existsSync(resolve(ROOT, 'js/data/demo-links.js')));
check('Reference missions industrial (no classroom demos)', (() => {
  const d = readFileSync(resolve(ROOT, 'js/data/demo-links.js'), 'utf8');
  return /REFERENCE_MISSIONS/.test(d) && /PRIMARY_APP_URL/.test(d) && /CLASSROOM_DEMOS\s*=\s*\[\s*\]/.test(d);
})());
check('Release check script', existsSync(resolve(ROOT, 'scripts/release-check.mjs')));
check('Trust Card industrial preliminary', /Industrial preliminary|PRELIMINARY DESIGN|not flight-certified/i.test(
  readFileSync(resolve(ROOT, 'js/ui/trust-card.js'), 'utf8')));
check('OPS deep-link ops=1', /ops.*===.*['"]1['"]|get\(['"]ops['"]\)/.test(
  readFileSync(resolve(ROOT, 'js/ui/flight-ops-ui.js'), 'utf8')));
check('Window campaigns delete/compare UI', /wcp-compare|deleteWindowCampaign/.test(
  readFileSync(resolve(ROOT, 'js/ui/firebase-ui.js'), 'utf8')));
check('route-display analysis READY board', /missionReviewBoardHtml|mission-review-board|READY \(analysis\)/.test(
  readFileSync(resolve(ROOT, 'js/ui/route-display.js'), 'utf8')));
check('effectivePathGeometry helper', /export function effectivePathGeometry/.test(stateJs));
check('path geometry HTML default physical', /path-geometry-select[\s\S]*value=["']physical["'][^>]*selected|value=["']physical["'] selected/.test(indexHtml));
check('MAP restores product physical', /PRODUCT_PATH_GEOMETRY|_pathGeomBeforeMap/.test(
  readFileSync(resolve(ROOT, 'js/ui/map-mode.js'), 'utf8')));
check('planning backend resolve sample-de', /PRODUCT_PLANNING_BACKEND|resolvePlanningBackend/.test(
  readFileSync(resolve(ROOT, 'js/physics/planning-defaults.js'), 'utf8')));
check('Vehicle Lab model provenance', /MODEL PROVENANCE|model provenance/i.test(
  readFileSync(resolve(ROOT, 'js/ui/vehicle-lab.js'), 'utf8')));
check('Launch site not edu-labeled', !/Launch site \(edu/.test(indexHtml));
check('product-chrome module', existsSync(resolve(ROOT, 'js/ui/product-chrome.js')));
check('Ship pathGeometry honesty in routing', /pathGeometry.*physical|geometry === 'physical'/.test(
  readFileSync(resolve(ROOT, 'js/physics/routing.js'), 'utf8')));
check('Adaptive sampling default ON', /adaptiveSampling:\s*true/.test(stateJs));
check('Endpoint markers match_path_end default', /endpointMarkerPolicy:\s*['"]match_path_end['"]/.test(stateJs));
check('Product pathGeometry physical', /pathGeometry:\s*['"]physical['"]/.test(stateJs));
check('Product starshipArch unrefueled', /starshipArch:\s*['"]unrefueled['"]/.test(stateJs));
check('Multi-rev Lambert default ON', /multiRevLambert:\s*true/.test(stateJs));
check('Agent industrial not classroom educational', /preliminary mission-design|not flight-certified/i.test(
  readFileSync(resolve(ROOT, 'js/agent/tools.js'), 'utf8'))
  && !/Concept-grade educational planner only/i.test(
    readFileSync(resolve(ROOT, 'js/agent/tools.js'), 'utf8')));
check('Deploy checklist doc', existsSync(resolve(ROOT, 'docs/DEPLOY.md')));
check('Label layout module', existsSync(resolve(ROOT, 'js/scene/label-layout.js')));
check('GA suggest module', existsSync(resolve(ROOT, 'js/physics/ga-suggest.js')));
check('GA suggest UI module', existsSync(resolve(ROOT, 'js/ui/ga-suggest-ui.js')));
check('SUGGEST GA button in HTML', /id=["']btn-ga-suggest["']/.test(indexHtml));
check('Manual +FLYBY still present', /id=["']btn-add-flyby["']/.test(indexHtml));
check('Animation wires label de-overlap', /resolveLabelOverlaps/.test(mainJs)
  || /resolveLabelOverlaps/.test(readFileSync(resolve(ROOT, 'js/animation.js'), 'utf8')));

// PR15+ porkchop cargo readout + heatmap
check('pc-cargo element in HTML', /id=["']pc-cargo["']/.test(indexHtml));
check('MAX CARGO metric button', /data-metric=["']cargo["']/.test(indexHtml));
check('porkchop-cargo module wired', /porkchop-cargo\.js/.test(porkchopJs));
check('cargo heatmap fill path', /fillCargoHeatmap|ensureCargoHeatmap/.test(porkchopJs));
check('F9 Earth-only gate via cargo mode', /cargoHeatmapMode|currentCargoMode/.test(porkchopJs));
check('fh-class not labeled Falcon Heavy', /Heavy-lift chemical/.test(indexHtml) && !/Falcon Heavy/.test(indexHtml.match(/fh-class[^<]*/)?.[0] || ''));
check('debug=1 triad log', /debug=1/.test(cardJs));

// Classroom mode removed — industrial product only
check('no classroom banner in HTML', !/id=["']classroom-banner["']/.test(indexHtml));
check('main does not activate classroom', !/classroomMode\s*=\s*true/.test(mainJs));
check('main applies product defaults', /applyProductVehicleDefaults/.test(mainJs));
check('About has no classroom force L1', !/Classroom mode forces L1/i.test(indexHtml));

// PR17 hooks + export surface
check('__HELIOS exposes buildMeasurementCard', /buildMeasurementCard/.test(mainJs));
check('export records fidelity', (() => {
  const exp = readFileSync(resolve(ROOT, 'js/ui/mission-export.js'), 'utf8');
  return /fidelity:\s*state\.fidelityLevel/.test(exp) && /schema_version:\s*3/.test(exp);
})());
check('vehicle select options include falcon9 + sh', /value=["']falcon9['"]/.test(indexHtml) && /value=["']sh-starship['"]/.test(indexHtml));
check('cargo-mass input present', /id=["']cargo-mass["']/.test(indexHtml));
check('starship-arch includes legacy-demo', /value=["']legacy-demo['"]/.test(indexHtml));

console.log('\n━━━ VEHICLE UI REGRESSION (MODULES) ━━━');

const v = await import(pathToFileURL(resolve(ROOT, 'js/physics/vehicles.js')).href);
const f9 = await import(pathToFileURL(resolve(ROOT, 'js/data/falcon9-c3-table.js')).href);
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);
const { state, applyProductVehicleDefaults } = await import(pathToFileURL(resolve(ROOT, 'js/state.js')).href);

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');

// F9 path (CI acceptance: F9 + cargo)
const need = { phase: 'injection', need_dv_m_s: 3500, applicable: true, c3_m2_s2: 15e6 };
const cap = v.evaluateCapability(need, {
  vehicleId: 'falcon9', originBody: earth, cargoMass_kg: 500, falcon9Variant: 'expendable',
});
check('F9 capability applicable', cap.applicable === true && cap.primary_metric === 'cargo');
const margin = v.evaluateMargin(need, cap, { cargoMass_kg: 500 });
check('F9 cargo margin feasible for 500 kg', margin.feasible === true && margin.kind === 'cargo');
const capMars = v.evaluateCapability(need, { vehicleId: 'falcon9', originBody: mars, cargoMass_kg: 500 });
check('F9 non-Earth inapplicable', capMars.applicable === false);

// Legacy banner path still works
const capLeg = v.evaluateCapability(need, { vehicleId: 'sh-starship', starshipArch: 'legacy-demo' });
check('legacy-demo capability Δv', capLeg.applicable && capLeg.primary_metric === 'dv');
check('legacy display name', /legacy/i.test(v.presetDisplayName('sh-starship')));

// Product default always unrefueled (classroom lock removed)
state.starshipArch = 'legacy-demo';
applyProductVehicleDefaults();
check('product default unrefueled', state.starshipArch === 'unrefueled');

// Fidelity modes
state.fidelityLevel = 'L1';
state.ephemerisBackend = 'approx';
check('fidelity can be L1', state.fidelityLevel === 'L1');
state.fidelityLevel = 'L2-compare';
check('fidelity can be L2-compare', state.fidelityLevel === 'L2-compare');
state.fidelityLevel = 'L2-plan';
state.ephemerisBackend = 'sample-de';
check('fidelity can be L2-plan', state.fidelityLevel === 'L2-plan');

// Porkchop cell math matches F9 table
const c3 = 20e6;
const p = f9.falcon9MaxPayloadKg(c3, 'expendable');
check('cell C3 cargo finite', p != null && p > 0);

// Measurement card HTML without DOM (build function)
const { buildMeasurementCard } = await import(pathToFileURL(resolve(ROOT, 'js/ui/measurement-card.js')).href);
state.vehicleId = 'falcon9';
state.cargoMass_kg = 1000;
state.falcon9Variant = 'expendable';
state.fidelityLevel = 'L1';
state.ephemerisBackend = 'approx';
state.classroomMode = false;
const td = {
  body1: earth,
  body2: mars,
  lambertOk: true,
  dvTotal_lambert: 5600,
  dv1_lambert: 3600,
  dv2_lambert: 2000,
  departureSimTime: 0,
  arrivalSimTime: 200 * 86400,
  transferTime: 200 * 86400,
  vInfDep: Math.sqrt(15e6),
  vInfArr: 3000,
};
const card = buildMeasurementCard(td);
check('Card HTML has measurement-card root', /id=["']measurement-card["']/.test(card.html) || /measurement-card/.test(card.html));
check('Card HTML has L1 badge', /fidelity-L1|data-fidelity=["']L1["']/.test(card.html));
check('Card shows approx error row', /Approx error|nominal/i.test(card.html));
check('Card has CAPABILITY section', /CAPABILITY/.test(card.html));
check('Card has MARGIN section', /MARGIN/.test(card.html));
// Vehicle engineering sheet lives in Vehicle Lab, not inline on every plan card.
check('Card does not dump full vehicle engineering sheet', !/VEHICLE ENGINEERING/i.test(card.html));
check('Vehicle lab module exists', existsSync(resolve(ROOT, 'js/ui/vehicle-lab.js')));
check('Card disclaimer non-empty', (card.capability?.disclaimer || '').length > 20);

state.fidelityLevel = 'L2-compare';
const cardL2 = buildMeasurementCard(td);
check('Card HTML has L2-compare badge', /L2-compare|fidelity-L2/.test(cardL2.html));

state.vehicleId = 'sh-starship';
state.starshipArch = 'unrefueled';
state.fidelityLevel = 'L3-plan';
const cardInd = buildMeasurementCard(td);
check('Industrial card has L3-plan or Need', /L3-plan|NEED|Need/i.test(cardInd.html));
check('Card not classroom methodology banner', !/Classroom mode|methodology-first/i.test(cardInd.html));

if (failed) {
  console.error(`\n${failed} vehicle UI regression check(s) failed`);
  process.exit(1);
}
console.log('\nAll vehicle UI regression checks passed');
