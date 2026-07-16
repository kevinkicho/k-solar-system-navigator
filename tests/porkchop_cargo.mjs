// Offline tests for porkchop cargo heatmap helpers.

import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pc = await import(pathToFileURL(resolve(ROOT, 'js/physics/porkchop-cargo.js')).href);
const f9 = await import(pathToFileURL(resolve(ROOT, 'js/data/falcon9-c3-table.js')).href);
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ PORKCHOP CARGO HEATMAP ━━━');

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');

check('F9 Earth → f9 mode', pc.cargoHeatmapMode('falcon9', earth, null) === 'f9');
check('F9 Mars → null', pc.cargoHeatmapMode('falcon9', mars, null) === null);
check('SS unrefueled → ss', pc.cargoHeatmapMode('sh-starship', earth, 'unrefueled') === 'ss');
check('SS tanker → ss', pc.cargoHeatmapMode('sh-starship', earth, 'tanker-n') === 'ss');
check('SS legacy → null', pc.cargoHeatmapMode('sh-starship', earth, 'legacy-demo') === null);
check('abstract → null', pc.cargoHeatmapMode('abstract', earth, null) === null);

const c3 = 20e6;
const f9kg = pc.cellMaxCargoKg({
  mode: 'f9', c3_m2_s2: c3, falcon9Variant: 'expendable',
});
const table = f9.falcon9MaxPayloadKg(c3, 'expendable');
check('F9 cell matches table', f9kg === table && f9kg > 0, `kg=${f9kg}`);

const asds = pc.cellMaxCargoKg({
  mode: 'f9', c3_m2_s2: c3, falcon9Variant: 'asds',
});
check('F9 ASDS derated', asds < f9kg && Math.abs(asds - f9kg * f9.F9_ASDS_DERATE) < 1e-6);

const sskg = pc.cellMaxCargoKg({
  mode: 'ss', dv_m_s: 5000, starshipArch: 'unrefueled', tankerCount: 0,
});
check('SS cell cargo positive', sskg != null && sskg > 0, `kg=${sskg}`);

const n = 9;
const c3Arr = new Float64Array(n);
const dvArr = new Float64Array(n);
const out = new Float64Array(n);
for (let i = 0; i < n; i++) {
  c3Arr[i] = (i * 10) * 1e6; // 0, 10, … km²/s²
  dvArr[i] = 4000 + i * 500;
}
// One invalid Lambert cell
c3Arr[4] = NaN;
dvArr[4] = NaN;

const stats = pc.fillCargoHeatmap(c3Arr, dvArr, out, {
  mode: 'f9', falcon9Variant: 'expendable',
});
check('fill finite count', stats.finite === n - 1, `finite=${stats.finite}`);
check('fill min/max ordered', stats.min <= stats.max);
check('invalid cell NaN', Number.isNaN(out[4]));
check('higher C3 ⇒ lower or equal F9 cargo', out[0] >= out[8] || Number.isNaN(out[8]));

const ssStats = pc.fillCargoHeatmap(c3Arr, dvArr, out, {
  mode: 'ss', starshipArch: 'unrefueled', tankerCount: 0,
});
check('SS fill has finite', ssStats.finite > 0);

// Static: metric button + module wired in UI
import { readFileSync } from 'fs';
const porkchopUi = readFileSync(resolve(ROOT, 'js/ui/porkchop.js'), 'utf8');
const indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
check('UI imports porkchop-cargo', /porkchop-cargo\.js/.test(porkchopUi));
check('MAX CARGO metric button', /data-metric=["']cargo["']/.test(indexHtml));
check('vehicle-changed refreshes cargo', /helios:vehicle-changed/.test(porkchopUi));

if (failed) {
  console.error(`\n${failed} porkchop cargo check(s) failed`);
  process.exit(1);
}
console.log('\nAll porkchop cargo checks passed');
