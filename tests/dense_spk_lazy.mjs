/**
 * Dense SPICE packs: Galilean load + lazy body map + registry.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { J2000, AU } from '../js/constants.js';
import { MOONS } from '../js/data/moons.js';
import {
  setDensePackForTests,
  packIdForBody,
  denseSpkAvailable,
  sampleDenseSpkAU,
  listLoadedDensePacks,
} from '../js/physics/dense-spk-pack.js';
import {
  parentRelativeState,
} from '../js/physics/planet-relative.js';
import { BODIES } from '../js/data/bodies.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ DENSE SPK LAZY / GALILEAN ━━━');

check('pack map Io → galilean', packIdForBody({ name: 'Io' }) === 'galilean');
check('pack map Titan → titan', packIdForBody({ name: 'Titan' }) === 'titan');
check('pack map Triton → triton', packIdForBody({ name: 'Triton' }) === 'triton');

const galPath = resolve(ROOT, 'assets/dense-spk/galilean.meta.json');
const galBin = resolve(ROOT, 'assets/dense-spk/galilean.bin');
if (existsSync(galPath) && existsSync(galBin)) {
  const meta = JSON.parse(readFileSync(galPath, 'utf8'));
  const buf = readFileSync(galBin);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  setDensePackForTests('galilean', meta, new Float32Array(ab));
  check('galilean step 30 min', meta.step_min === 30, `step=${meta.step_min}`);
  check('galilean 4 bodies', meta.bodies?.length === 4);

  const Io = MOONS.find((m) => m.name === 'Io');
  const Europa = MOONS.find((m) => m.name === 'Europa');
  const Jupiter = BODIES.find((b) => b.name === 'Jupiter');
  const t0 = (Date.UTC(2026, 5, 1, 12) - J2000) / 1000;

  check('Io dense available 2026', denseSpkAvailable(Io, t0));
  const p = sampleDenseSpkAU(Io, t0);
  check('Io dense sample', !!p && p.pack_id === 'galilean', p?.source);
  if (p) {
    const r_km = Math.hypot(p.x, p.y, p.z) * AU / 1000;
    check('Io |r| ~ 400–450e3 km', r_km > 350000 && r_km < 500000, `r=${r_km.toFixed(0)}`);
  }
  const st = parentRelativeState(Io, Jupiter, t0, {});
  check('PR Io uses dense SPICE', /spice|dense|galilean/i.test(st.ephSource || ''), `src=${st.ephSource}`);

  const stE = parentRelativeState(Europa, Jupiter, t0, {});
  check('PR Europa dense', /spice|dense|galilean/i.test(stE.ephSource || ''), `src=${stE.ephSource}`);
  check('loaded packs include galilean', listLoadedDensePacks().includes('galilean'));
} else {
  console.log('  · galilean pack missing — skip SPICE checks');
}

const regPath = resolve(ROOT, 'assets/dense-spk/registry.json');
if (existsSync(regPath)) {
  const reg = JSON.parse(readFileSync(regPath, 'utf8'));
  check('registry has packs', Array.isArray(reg.packs) && reg.packs.length >= 3);
  check('registry body_to_pack io', reg.body_to_pack?.io === 'galilean');
} else {
  check('registry exists', false);
}

// Optional titan/triton
for (const id of ['titan', 'triton']) {
  const mp = resolve(ROOT, `assets/dense-spk/${id}.meta.json`);
  const bp = resolve(ROOT, `assets/dense-spk/${id}.bin`);
  if (existsSync(mp) && existsSync(bp)) {
    const meta = JSON.parse(readFileSync(mp, 'utf8'));
    const buf = readFileSync(bp);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    setDensePackForTests(id, meta, new Float32Array(ab));
    const moon = MOONS.find((m) => m.name.toLowerCase() === id);
    const t0 = (Date.UTC(2026, 5, 1, 12) - J2000) / 1000;
    check(`${id} dense available`, moon && denseSpkAvailable(moon, t0));
  } else {
    console.log(`  · ${id} pack not baked yet (optional Tier B kernel)`);
  }
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\ndense_spk_lazy: ok');
