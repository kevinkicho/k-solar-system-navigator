// Offline tests for mission JSON → plan_request import mapping.

import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { planJsonToRequest } = await import(
  pathToFileURL(resolve(ROOT, 'js/ui/mission-import.js')).href
);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ MISSION IMPORT ━━━');

const v2 = {
  schema_version: 2,
  summary: {
    origin: 'Earth', origin_id: 'earth',
    destination: 'Mars', destination_id: 'mars',
    departure_utc: '2026-11-21T12:00:00.000Z',
    transit_days: 258.2,
    cost_basis: 'helio',
  },
  plan_request: {
    v: 1, o: 'earth', d: 'mars', dep: '2026-11-21', tof: 258,
    veh: 'abstract', ab: 9000, basis: 'helio', view: 'schematic',
  },
  methodology: { display_mode: 'schematic' },
  feasibility: { vehicle_id: 'abstract' },
};

const r1 = planJsonToRequest(v2);
check('v2 plan_request path', r1 && r1.originId === 'earth' && r1.destId === 'mars');
check('tof from plan_request', r1 && r1.tofDays === 258);
check('vehicle abstract', r1 && r1.vehicleId === 'abstract');
check('view schematic', r1 && r1.view === 'schematic');

const v1 = {
  schema_version: 1,
  summary: {
    origin: 'Earth',
    destination: 'Venus',
    departure_utc: '2026-10-01T00:00:00.000Z',
    transit_days: 146,
  },
};
const r2 = planJsonToRequest(v1);
check('v1 name-based summary', r2 && r2.originId === 'earth' && r2.destId === 'venus');
check('v1 dep date', r2 && r2.depDate && r2.depDate.getUTCFullYear() === 2026);

const multi = {
  schema_version: 2,
  summary: {
    origin_id: 'earth', destination_id: 'jupiter',
    departure_utc: '2031-01-10T12:00:00.000Z',
    multi_leg: true,
  },
  maneuvers: [
    { type: 'depart', body: 'Earth', epoch_utc: '2031-01-10T12:00:00.000Z' },
    { type: 'flyby', body: 'Mars', epoch_utc: '2031-10-01T12:00:00.000Z' },
    { type: 'arrive', body: 'Jupiter', epoch_utc: '2033-01-01T12:00:00.000Z' },
  ],
};
const r3 = planJsonToRequest(multi);
check('multi-leg flyby extracted', r3 && r3.flybys.length === 1 && r3.flybys[0].bodyId === 'mars');

check('rejects empty', planJsonToRequest(null) === null);
check('rejects garbage', planJsonToRequest({ foo: 1 }) === null);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll mission import checks passed');
