// Golden share codec encode/decode (design K15 / PR 11) — pure module only.

import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const codec = await import(pathToFileURL(resolve(ROOT, 'js/ui/share-codec.js')).href);
const cat = await import(pathToFileURL(resolve(ROOT, 'js/data/catalog.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ SHARE CODEC ━━━');

const h1 = '#v=1&o=earth&d=mars&dep=2026-11-21&tof=258&veh=abstract&ab=8000&basis=helio&view=schematic';
const r1 = codec.parsePlanRequest(h1);
check('parse single-leg earth→mars', r1 && r1.originId === 'earth' && r1.destId === 'mars');
check('parse tof=258', r1 && r1.tofDays === 258);
check('parse abstract', r1 && r1.vehicleId === 'abstract' && r1.abstractBudget_m_s === 8000);
check('parse schematic', r1 && r1.view === 'schematic');
check('bodies resolve', !!codec.resolvePlanBodies(r1));

const h2 = '#v=1&o=earth&d=mars&dep=2027-01-10&fb=venus@2027-06-15&basis=mission&view=cinematic';
const r2 = codec.parsePlanRequest(h2);
check('parse multi-leg fb', r2 && r2.flybys.length === 1 && r2.flybys[0].bodyId === 'venus');
check('multi-leg coerces basis to helio', r2 && r2.costBasis === 'helio');
check('tof null with flybys', r2 && r2.tofDays === null);

check('unknown version rejected', codec.parsePlanRequest('#v=2&o=earth&d=mars&dep=2026-11-21') === null);
check('date out of range rejected', codec.parsePlanRequest('#v=1&o=earth&d=mars&dep=1600-01-01') === null);

const enc = codec.encodePlanRequestObject({
  o: 'earth', d: 'mars', dep: '2026-11-21', tof: 258,
  veh: 'chem-medium', basis: 'helio', view: 'cinematic',
});
check('encode produces hash', typeof enc === 'string' && enc.startsWith('#'));
const back = codec.parsePlanRequest(enc);
check('round-trip origin', back?.originId === 'earth');
check('round-trip dest', back?.destId === 'mars');
check('round-trip veh', back?.vehicleId === 'chem-medium');
check('round-trip tof', back?.tofDays === 258);

const encMulti = codec.encodePlanRequestObject({
  o: 'earth', d: 'jupiter', dep: '2031-01-10',
  fb: [{ id: 'mars', date: '2031-10-01' }],
  veh: 'high-energy', basis: 'mission', view: 'schematic',
});
const backM = codec.parsePlanRequest(encMulti);
check('multi encode forces helio', backM?.costBasis === 'helio');
check('multi has flyby', backM?.flybys?.[0]?.bodyId === 'mars');
check('catalog has earth', cat.findById('earth')?.name === 'Earth');

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll share codec checks passed');
