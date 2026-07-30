/**
 * Mission package brief builder (offline).
 */
import { DAY } from '../js/constants.js';
import { BODIES } from '../js/data/bodies.js';
import { solveTransferOrbit } from '../js/physics/routing.js';
import { state } from '../js/state.js';
import { buildPlanDossier } from '../js/ui/plan-dossier.js';
import { buildMissionBrief, packageShareHash } from '../js/ui/mission-package.js';
import { parsePlanRequest } from '../js/ui/share-codec.js';
import { setSampleTableForTests } from '../js/physics/ephemeris-sample.js';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const samples = JSON.parse(readFileSync(resolve(ROOT, 'assets/ephemeris-samples-v1.json'), 'utf8'));
setSampleTableForTests(samples);

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

state.classroomMode = false;
state.ephemerisBackend = 'approx';
state.vehicleId = 'abstract';
state.abstractBudget_m_s = 50000;
state.fidelityLevel = 'L3-plan';

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const depSim = (Date.UTC(2026, 3, 23, 12) - Date.UTC(2000, 0, 1, 12)) / 1000;
const td = {
  body1: earth,
  body2: mars,
  departureSimTime: depSim,
  transferTime: 259 * DAY,
  arrivalSimTime: depSim + 259 * DAY,
  ephemerisBackend: 'approx',
};
solveTransferOrbit(td);
assert(td.lambertOk, `Lambert should solve`);
buildPlanDossier(td);
const brief = buildMissionBrief(td);
assert(/Mission Brief/i.test(brief), 'brief title');
assert(/Not flight-certified/i.test(brief), 'product class');
assert(/Earth/i.test(brief) && /Mars/i.test(brief), 'route bodies');
assert(/Gates/i.test(brief), 'gates section');
assert(/Need/i.test(brief), 'need section');
const hash = packageShareHash(td);
assert(hash && hash.startsWith('#v=1'), 'package share hash');
assert(parsePlanRequest(hash), 'share hash parseable');
assert(/Share hash/i.test(brief), 'brief embeds share hash');

console.log('mission_package: ok');
