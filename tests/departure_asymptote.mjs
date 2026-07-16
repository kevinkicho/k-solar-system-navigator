import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = await import(pathToFileURL(resolve(ROOT, 'js/physics/departure-asymptote.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ DEPARTURE ASYMPTOTE ━━━');

const ecl = a.asymptoteAnglesFromVinf([3000, 0, 0]);
check('in-plane ecliptic DLA ~0', ecl && Math.abs(ecl.dla_ecliptic_deg) < 0.01);

const out = a.asymptoteAnglesFromVinf([0, 3000, 0]);
check('out-of-plane DLA ~±90', out && Math.abs(Math.abs(out.dla_ecliptic_deg) - 90) < 0.5);

const eq = a.eclipticVinfToEquatorialDlaRla([3000, 500, 1000]);
check('equatorial DLA finite', eq && isFinite(eq.dla_eq_deg));
check('equatorial RLA 0..360', eq && eq.rla_eq_deg >= 0 && eq.rla_eq_deg < 360);
check('obliquity model set', /J2000/.test(eq.obliquity_model));

const pkg = a.fullAsymptotePackage([2500, 800, 400], { earthDeparture: true });
check('full package ecliptic', !!pkg?.ecliptic);
check('full package equatorial', !!pkg?.equatorial_approx);
const pkgN = a.fullAsymptotePackage([2500, 800, 400], { earthDeparture: false });
check('non-Earth no equatorial', pkgN?.equatorial_approx == null);

// Hand check: pure ecliptic Z component rotates into eq Z with sin/cos ε
const pureZ = a.eclipticVinfToEquatorialDlaRla([0, 1000, 0]); // HELIOS y = ecl Z
// After rotation, declination of polar vector
check('polar-ish has large |DLA_eq|', pureZ && Math.abs(pureZ.dla_eq_deg) > 60);

if (failed) {
  console.error(`\n${failed} asymptote checks failed`);
  process.exit(1);
}
console.log('\nAll departure asymptote checks passed');
