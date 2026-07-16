import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const t = await import(pathToFileURL(resolve(ROOT, 'js/data/approx-ephemeris-errors.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ APPROX EPHEMERIS ERROR TABLE ━━━');

const planets = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
for (const p of planets) {
  check(`${p} in table`, !!t.APPROX_ERRORS_1800_2050[p]);
}
check('EM bary present', !!t.APPROX_ERRORS_1800_2050.em_bary);

// JPL published 1800–2050 table (SSD approx_pos)
check('Mars ρ class = 25 (×1000 km)', t.APPROX_ERRORS_1800_2050.mars.rho_1000km === 25);
check('Mars λ = 40 arcsec', t.APPROX_ERRORS_1800_2050.mars.lambda_arcsec === 40);
check('Earth ρ class = 6', t.APPROX_ERRORS_1800_2050.earth.rho_1000km === 6);
check('Jupiter λ = 400', t.APPROX_ERRORS_1800_2050.jupiter.lambda_arcsec === 400);

check('resolve by name Earth', t.approxErrorForBody({ name: 'Earth' })?.rho_1000km === 6);
check('resolve by id mars', t.approxErrorForBody('mars')?.lambda_arcsec === 40);
check('unknown null', t.approxErrorForBody({ name: 'Bennu' }) === null);

const s = t.formatApproxErrorSummary('mars');
check('format mentions Mars', /Mars/i.test(s) && /40/.test(s));
check('source URL https', /^https:\/\//.test(t.APPROX_EPHEMERIS_ERROR_URL));

if (failed) {
  console.error(`\n${failed} approx error checks failed`);
  process.exit(1);
}
console.log('\nAll approx error table checks passed');
