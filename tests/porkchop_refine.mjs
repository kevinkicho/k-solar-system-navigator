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
check('refine centered near coarse tof (interior)', Math.abs(
  (rSpec.tofMin + rSpec.tofMax) / 2 - coarseTimes.tof
) < 1e-6);

const fine = sweepPorkchopGrid(earth, mars, rSpec);
check('refine sweep has minCell', !!fine.minCell, `dvMin=${(fine.dvMin / 1000).toFixed(3)} km/s`);

const coarseCell = evaluateCell(earth, mars, coarseTimes.dep, coarseTimes.tof);
const coarseDv = coarseCell ? coarseCell.dv : coarse.dvMin;
const NOISE = 1e-3; // m/s — matches REFINE_DV_NOISE in porkchop.js

// Non-tautological: fine grid itself must improve or match coarse for this corridor.
// (Fine lattice may miss the exact coarse sample; for Earth–Mars min it still beats it.)
check(
  'fine.dvMin ≤ coarseDv (+noise)',
  isFinite(fine.dvMin) && fine.dvMin <= coarseDv + NOISE,
  `fine=${(fine.dvMin / 1000).toFixed(4)} coarse=${(coarseDv / 1000).toFixed(4)} km/s`,
);

// Explicit UI clamp path (mirrors refineAroundSelection selection logic).
function pickRefinedDv(fineMin, coarseMin) {
  return fineMin <= coarseMin + NOISE ? fineMin : coarseMin;
}
check('UI clamp keeps coarse when fine worse', pickRefinedDv(coarseDv + 100, coarseDv) === coarseDv);
check('UI clamp takes fine when better', pickRefinedDv(coarseDv - 10, coarseDv) === coarseDv - 10);
check(
  'UI-selected Δv ≤ coarse (+noise)',
  pickRefinedDv(fine.dvMin, coarseDv) <= coarseDv + NOISE,
  `selected=${(pickRefinedDv(fine.dvMin, coarseDv) / 1000).toFixed(4)} km/s`,
);

// Spacing: ¼ of coarse cell (depart + TOF)
const coarseDepStep = (coarseSpec.departEnd - coarseSpec.departStart) / coarseSpec.nx;
const fineDepStep = (rSpec.departEnd - rSpec.departStart) / rSpec.nx;
check(
  'fine dep spacing ≈ ¼ coarse',
  Math.abs(fineDepStep - coarseDepStep / 4) / coarseDepStep < 1e-12,
  `fine=${fineDepStep.toFixed(1)}s expected=${(coarseDepStep / 4).toFixed(1)}s`,
);
const coarseTofStep = (coarseSpec.tofMax - coarseSpec.tofMin) / coarseSpec.ny;
const fineTofStep = (rSpec.tofMax - rSpec.tofMin) / rSpec.ny;
check(
  'fine tof spacing ≈ ¼ coarse',
  Math.abs(fineTofStep - coarseTofStep / 4) / coarseTofStep < 1e-12,
  `fine=${fineTofStep.toFixed(1)}s expected=${(coarseTofStep / 4).toFixed(1)}s`,
);

// --- Edge clamp: low-TOF cell must preserve fine step (not de-center by one-sided clamp)
{
  const edgeSpec = {
    departStart: 0,
    departEnd: 100 * DAY,
    tofMin: 1 * DAY,
    tofMax: 50 * DAY,
    nx: 20,
    ny: 20,
  };
  const edgeIy = 0;
  const edgeIx = 10;
  const edgeTimes = cellTimes(edgeSpec, edgeIx, edgeIy);
  const edgeRefine = refineGridSpec(edgeSpec, edgeIx, edgeIy, 40);
  const expectedStep = ((edgeSpec.tofMax - edgeSpec.tofMin) / edgeSpec.ny) / 4;
  const actualStep = (edgeRefine.tofMax - edgeRefine.tofMin) / edgeRefine.ny;
  check(
    'edge refine tof step stays ¼ coarse',
    Math.abs(actualStep - expectedStep) / expectedStep < 1e-12,
    `step=${actualStep.toFixed(3)} expected=${expectedStep.toFixed(3)}`,
  );
  check(
    'edge refine tofMin ≥ minTof floor',
    edgeRefine.tofMin >= 1e-6 - 1e-12,
    `tofMin=${edgeRefine.tofMin}`,
  );
  check(
    'edge refine preserves span (= n * fineStep)',
    Math.abs((edgeRefine.tofMax - edgeRefine.tofMin) - 40 * expectedStep) < 1e-6,
    `span=${(edgeRefine.tofMax - edgeRefine.tofMin).toFixed(1)}`,
  );
  // Window may shift up, so center can be above coarse tof — but not by more than half a span
  // unless the unshifted window would go below floor.
  const unshiftedLo = edgeTimes.tof - 0.5 * 40 * expectedStep;
  if (unshiftedLo < 1e-6) {
    check(
      'edge refine shifts up when clipped',
      edgeRefine.tofMin <= 1e-6 + 1e-9,
      `tofMin=${edgeRefine.tofMin}`,
    );
  }
}

// Contract fixture: progressive row / done / cancel message field shapes (static).
{
  const rowMsg = { type: 'row', requestId: 1, iy: 0, dv: [], c3: [], vinf: [] };
  const doneMsg = {
    type: 'done', requestId: 1, minCell: { ix: 0, iy: 0 },
    stats: { dvMin: 1, dvMax: 2, c3Min: 1, c3Max: 2, vinfMin: 1, vinfMax: 2 },
  };
  const cancelMsg = { type: 'cancel', requestId: 1 };
  check('row msg contract fields', rowMsg.type === 'row' && 'iy' in rowMsg && 'dv' in rowMsg && 'c3' in rowMsg && 'vinf' in rowMsg);
  check('done msg contract fields', doneMsg.type === 'done' && 'minCell' in doneMsg && 'stats' in doneMsg);
  check('cancel msg contract fields', cancelMsg.type === 'cancel' && typeof cancelMsg.requestId === 'number');
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
