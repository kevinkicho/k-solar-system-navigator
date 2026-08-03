/**
 * Studio depth modules — window families, arch matrix, DSM, pins, fidelity, moon sketch.
 */
import { clusterWindowFamilies, formatFamilyCalendar } from '../js/physics/window-families.js';
import { buildArchitectureMatrix } from '../js/physics/architecture-matrix.js';
import {
  normalizeDsmNodes, sumDsmDv_m_s, needWithDsmSketch, suggestMidcourseDsmSeed,
} from '../js/physics/dsm-nodes.js';
import {
  snapshotPlanPin, diffPlanPins, pinPlan, getPlanPins, clearPlanPins,
} from '../js/physics/plan-pins.js';
import { listFidelityPresets, applyFidelityPreset } from '../js/physics/fidelity-presets.js';
import { moonSystemTemplates, listMoonsOf } from '../js/physics/moon-system-sketch.js';
import { itineraryTemplates, suggestItineraries } from '../js/physics/itinerary-suggest.js';
import { listPlaybooks, getPlaybook } from '../js/agent/playbooks.js';
import { listRoles, roleSystemPrompt } from '../js/agent/roles.js';
import { BODIES } from '../js/data/bodies.js';
import { MOONS } from '../js/data/moons.js';
import { J2000 } from '../js/constants.js';
import '../js/physics/routing.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

// --- Window families
const shortlist = [
  { rank: 1, dep_iso: '2031-06-01T00:00:00.000Z', tof_days: 220, dv_m_s: 6200 },
  { rank: 2, dep_iso: '2031-07-15T00:00:00.000Z', tof_days: 240, dv_m_s: 6400 },
  { rank: 3, dep_iso: '2033-08-01T00:00:00.000Z', tof_days: 500, dv_m_s: 7000 },
];
const fam = clusterWindowFamilies(shortlist);
assert(fam.families.length >= 2, 'at least 2 families');
assert(fam.families.filter((f) => f.recommended).length === 1, 'one recommended family');
assert(formatFamilyCalendar(fam).length === fam.families.length, 'calendar lines');
assert(/not a global/i.test(fam.note), 'honesty note');

// --- Architecture matrix
const need = { need_dv_m_s: 6000, applicable: true };
const earth = BODIES.find((b) => b.name === 'Earth');
const matrix = buildArchitectureMatrix(need, { cargoMass_kg: 2000, originBody: earth });
assert(matrix.rows.length >= 5, 'matrix rows');
assert(matrix.rows.some((r) => r.vehicleId === 'sh-starship'), 'has SS');
assert(matrix.product_class.includes('preliminary'), 'product class');

// --- DSM
const nodes = suggestMidcourseDsmSeed({ dv_m_s: 100 });
assert(sumDsmDv_m_s(nodes) === 100, 'dsm sum');
const sketch = needWithDsmSketch(5000, nodes);
assert(sketch.combined_need_m_s === 5100, 'combined need');
assert(normalizeDsmNodes([{ dv_m_s: -5 }]).length === 0 || normalizeDsmNodes([{ dv_m_s: 10 }])[0].dv_m_s === 10, 'normalize');

// --- Pins (memory — no localStorage assert required)
clearPlanPins();
const app = {
  routeOrigin: { name: 'Earth', id: 'earth' },
  routeDestination: { name: 'Mars', id: 'mars' },
  vehicleId: 'sh-starship',
  starshipArch: 'unrefueled',
  cargoMass_kg: 1000,
  transferData: {
    dossier: {
      status: 'pass',
      mission_ready: true,
      need: { need_dv_m_s: 5500 },
      capability: { capability_dv_m_s: 7000 },
      margin: { margin_dv_m_s: 1500, feasible: true },
      gates: [],
    },
  },
};
const p1 = pinPlan(app, { label: 'A' });
const p2 = pinPlan({ ...app, cargoMass_kg: 5000, transferData: {
  ...app.transferData,
  dossier: {
    ...app.transferData.dossier,
    margin: { margin_dv_m_s: -200, feasible: false },
    mission_ready: false,
  },
} }, { label: 'B' });
assert(getPlanPins().length === 2, 'two pins');
const diff = diffPlanPins(p1, p2);
assert(diff.a_label && diff.b_label, 'diff labels');
assert(snapshotPlanPin(app).product_class, 'snapshot class');

// --- Fidelity presets
assert(listFidelityPresets().length >= 4, 'presets');
const st = {
  ephemerisBackend: 'approx',
  fidelityLevel: 'L1',
  pathGeometry: 'visual',
  pathAccuracy: {},
  horizonsEndpointInject: true,
};
const ap = applyFidelityPreset(st, 'inner-product');
assert(ap.ok, 'preset ok');
assert(st.ephemerisBackend === 'sample-de', 'sample-de');
assert(st.pathGeometry === 'physical', 'physical path');

// --- Moon system
const europa = MOONS.find((m) => m.name === 'Europa') || listMoonsOf('Jupiter')[0];
const io = MOONS.find((m) => m.name === 'Io') || listMoonsOf('Jupiter')[1];
if (europa && io) {
  const mt = moonSystemTemplates(europa, io);
  assert(mt.templates.length >= 1, 'moon templates');
  assert(/not CR3BP/i.test(mt.note), 'cr3bp honesty');
}

// --- Itinerary expand + multi-obj
const mars = BODIES.find((b) => b.name === 'Mars');
const jupiter = BODIES.find((b) => b.name === 'Jupiter');
const tpls = itineraryTemplates(earth, jupiter);
assert(tpls.some((t) => /saturn|jupiter|venus|mars/i.test(t.label + t.id)), 'outer templates');
const dep = (Date.UTC(2031, 0, 10, 12) - J2000) / 1000;
const pack = suggestItineraries(earth, mars, dep, { ephemerisBackend: 'approx' }, {
  weights: { need: 1, tof: 0.5, stops: 0.2 },
});
assert(pack.weights, 'weights present');
assert(pack.suggestions[0]?.recommended, 'recommended');

// --- Playbooks & roles
assert(listPlaybooks().length >= 4, 'playbooks');
assert(getPlaybook('pb-unrefueled-mars')?.steps?.length >= 3, 'mars playbook');
assert(listRoles().length >= 4, 'roles');
assert(/Navigator/i.test(roleSystemPrompt('navigator')), 'navigator prompt');

console.log('studio_depth: ok', {
  families: fam.families.length,
  matrixRows: matrix.rows.length,
  presets: listFidelityPresets().length,
  playbooks: listPlaybooks().length,
});
