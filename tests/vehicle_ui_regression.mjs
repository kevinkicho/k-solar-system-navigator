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
check('Card classroom note path', /classroomMode/.test(cardJs));
check('Default fidelity L1 in state', /fidelityLevel:\s*['"]L1['"]/.test(stateJs));

// PR14 Horizons → L2
check('Horizons success sets L2', /fidelityLevel\s*=\s*['"]L2['"]/.test(controlsJs));
const l2Idx = controlsJs.indexOf("fidelityLevel = 'L2'");
const rrAfterL2 = l2Idx >= 0 && controlsJs.indexOf('renderRouteUI()', l2Idx) > l2Idx
  && controlsJs.indexOf('renderRouteUI()', l2Idx) - l2Idx < 1200;
check('Horizons re-renders route on L2', rrAfterL2);
check('About documents L1/L2/L3', /Ephemeris fidelity badges/.test(indexHtml) && /L3/.test(indexHtml) && /never a planning mode/i.test(indexHtml));
check('About: L3 out of scope', /out of scope|never a planning mode/i.test(indexHtml));

// PR15+ porkchop cargo readout + heatmap
check('pc-cargo element in HTML', /id=["']pc-cargo["']/.test(indexHtml));
check('MAX CARGO metric button', /data-metric=["']cargo["']/.test(indexHtml));
check('porkchop-cargo module wired', /porkchop-cargo\.js/.test(porkchopJs));
check('cargo heatmap fill path', /fillCargoHeatmap|ensureCargoHeatmap/.test(porkchopJs));
check('F9 Earth-only gate via cargo mode', /cargoHeatmapMode|currentCargoMode/.test(porkchopJs));
check('fh-class not labeled Falcon Heavy', /Heavy-lift chemical/.test(indexHtml) && !/Falcon Heavy/.test(indexHtml.match(/fh-class[^<]*/)?.[0] || ''));
check('debug=1 triad log', /debug=1/.test(cardJs));

// PR16 classroom
check('classroom banner in HTML', /id=["']classroom-banner["']/.test(indexHtml));
check('main sets classroomMode', /classroomMode\s*=\s*true/.test(mainJs) && /get\(['"]mode['"]\)\s*===\s*['"]classroom['"]/.test(mainJs));
check('classroom → abstract vehicle', /classroom[\s\S]{0,200}vehicleId\s*=\s*['"]abstract['"]/.test(mainJs));
check('classroom → schematic', /classroom[\s\S]{0,300}setDisplayMode\(['"]schematic['"]\)/.test(mainJs));
check('classroom shows banner', /classroom-banner/.test(mainJs));
check('classroom forces L1', /classroom[\s\S]{0,350}fidelityLevel\s*=\s*['"]L1['"]/.test(mainJs));

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

// Product default arch flip respects classroom lock
state.classroomMode = true;
state.starshipArch = 'legacy-demo';
applyProductVehicleDefaults();
check('classroom blocks unrefueled flip', state.starshipArch === 'legacy-demo');
state.classroomMode = false;
applyProductVehicleDefaults();
check('product default unrefueled', state.starshipArch === 'unrefueled');

// Fidelity default
state.fidelityLevel = 'L1';
check('fidelity default L1', state.fidelityLevel === 'L1');
state.fidelityLevel = 'L2';
check('fidelity can be L2', state.fidelityLevel === 'L2');
state.fidelityLevel = 'L1';

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
check('Card has CAPABILITY section', /CAPABILITY/.test(card.html));
check('Card has MARGIN section', /MARGIN/.test(card.html));
check('Card disclaimer non-empty', (card.capability?.disclaimer || '').length > 20);

state.fidelityLevel = 'L2';
const cardL2 = buildMeasurementCard(td);
check('Card HTML has L2 badge', /fidelity-L2|data-fidelity=["']L2["']/.test(cardL2.html));

state.classroomMode = true;
state.vehicleId = 'abstract';
const cardClass = buildMeasurementCard(td);
check('Classroom card mentions methodology', /Classroom|methodology|abstract/i.test(cardClass.html));
state.classroomMode = false;

if (failed) {
  console.error(`\n${failed} vehicle UI regression check(s) failed`);
  process.exit(1);
}
console.log('\nAll vehicle UI regression checks passed');
