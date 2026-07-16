import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cat = await import(pathToFileURL(resolve(ROOT, 'js/data/catalog.js')).href);
const kepler = await import(pathToFileURL(resolve(ROOT, 'js/physics/kepler.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ CATALOG ━━━');

check('findById earth', cat.findById('earth')?.name === 'Earth');
check('findByIdOrName Moon', cat.findByIdOrName('Moon')?.kind === 'moon');
check('≥4 dwarfs', cat.listDwarfs().length >= 4, String(cat.listDwarfs().length));
check('≥5 NEOs', cat.listNeos().length >= 5, String(cat.listNeos().length));
check('EM L1/L2', cat.listWaypoints().length >= 2);

const fly = cat.listFlybyEligible();
check('planets flyby eligible', fly.some(b => b.name === 'Earth'));
check('moons not flyby eligible', !fly.some(b => b.kind === 'moon'));
check('waypoints not flyby', !fly.some(b => b.kind === 'waypoint'));

// Waypoint geometry ratios
const earth = cat.findById('earth');
const moon = cat.findById('moon');
const l1 = cat.findById('em-l1');
const l2 = cat.findById('em-l2');
const t = 0;
const re = kepler.getBodyPosition3D(earth, t, false);
const rm = kepler.getBodyPosition3D(moon, t, false);
const r1 = kepler.getBodyPosition3D(l1, t, false);
const r2 = kepler.getBodyPosition3D(l2, t, false);
const rem = Math.hypot(rm.x - re.x, rm.y - re.y, rm.z - re.z);
const rL1 = Math.hypot(r1.x - re.x, r1.y - re.y, r1.z - re.z);
const rL2 = Math.hypot(r2.x - re.x, r2.y - re.y, r2.z - re.z);
const f1 = rL1 / rem, f2 = rL2 / rem;
check('L1 ~0.84 R_EM', Math.abs(f1 - 0.84) < 0.02, f1.toFixed(4));
check('L2 ~1.16 R_EM', Math.abs(f2 - 1.16) < 0.02, f2.toFixed(4));

// NEO has a position at J2000
const bennu = cat.findById('bennu');
const pb = kepler.getBodyPosition3D(bennu, 0, false);
check('Bennu r finite', isFinite(pb.r) && pb.r > 0.5 && pb.r < 2.5, `r=${pb.r.toFixed(3)}`);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll catalog checks passed');
