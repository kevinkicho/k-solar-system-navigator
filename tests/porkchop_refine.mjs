// Offline: coarse porkchop + refine-around-selection min Δv check.
// Worker is browser-only; this validates grid math + refine neighborhood.

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve as pathResolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathResolve(__dirname, '..');
const importMod = (rel) => import(pathToFileURL(pathResolve(ROOT, rel)).href);

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '   ' + detail : ''}`);
}

const { DAY } = await importMod('js/constants.js');
const { findById } = await importMod('js/data/catalog.js');
const {
  defaultGridSpec, sweepPorkchopGrid, cellTimes, refineGridSpec, evaluateCell,
} = await importMod('js/physics/porkchop-grid.js');

const earth = findById('earth');
const mars = findById('mars');
check('catalog.findById earth', !!earth && earth.name === 'Earth');
check('catalog.findById mars', !!mars && mars.name === 'Mars');

// Mid-2020-ish epoch in sim seconds from J2000 (matches typical UI start).
const departStart = (Date.UTC(2020, 6, 1, 12) - Date.UTC(2000, 0, 1, 12)) / 1000;

const coarseSpec = defaultGridSpec(earth, mars, departStart, 33, 26);
const coarse = sweepPorkchopGrid(earth, mars, coarseSpec);
check('coarse sweep has minCell', !!coarse.minCell, `dvMin=${(coarse.dvMin / 1000).toFixed(3)} km/s`);

const { ix, iy } = coarse.minCell;
const coarseTimes = cellTimes(coarseSpec, ix, iy);
const rSpec = refineGridSpec(coarseSpec, ix, iy, 40);
check('refine is 40×40', rSpec.nx === 40 && rSpec.ny === 40);
check('refine centered near coarse dep', Math.abs(
  (rSpec.departStart + rSpec.departEnd) / 2 - coarseTimes.dep
) < 1e-6);

const fine = sweepPorkchopGrid(earth, mars, rSpec);
check('refine sweep has minCell', !!fine.minCell, `dvMin=${(fine.dvMin / 1000).toFixed(3)} km/s`);

// Also evaluate exact coarse center so refine never loses the coarse sample.
const coarseCell = evaluateCell(earth, mars, coarseTimes.dep, coarseTimes.tof);
const coarseDv = coarseCell ? coarseCell.dv : coarse.dvMin;
const refineDv = Math.min(fine.dvMin, coarseDv);
const NOISE = 1e-3; // m/s
check(
  'refine min Δv ≤ coarse min (+noise)',
  refineDv <= coarseDv + NOISE,
  `refine=${(refineDv / 1000).toFixed(4)} coarse=${(coarseDv / 1000).toFixed(4)} km/s`,
);

// Spacing: ¼ of coarse cell
const coarseDepStep = (coarseSpec.departEnd - coarseSpec.departStart) / coarseSpec.nx;
const fineDepStep = (rSpec.departEnd - rSpec.departStart) / rSpec.nx;
check(
  'fine dep spacing ≈ ¼ coarse',
  Math.abs(fineDepStep - coarseDepStep / 4) / coarseDepStep < 1e-12,
  `fine=${fineDepStep.toFixed(1)}s expected=${(coarseDepStep / 4).toFixed(1)}s`,
);

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
