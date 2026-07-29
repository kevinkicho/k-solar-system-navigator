/**
 * Launch azimuth + dogleg educational sketch.
 */
import { launchAzimuthDoglegSketch, doglegNeedAddon_m_s } from '../js/physics/launch-azimuth.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ LAUNCH AZIMUTH / DOGLEG ━━━');

const any = launchAzimuthDoglegSketch(20, 'any');
check('any site n/a', !any.dogleg_needed && any.azimuth_from_north_deg == null);

// Due-east class: |DLA| ≈ site latitude → prograde Az ~90°
const capeMatch = launchAzimuthDoglegSketch(28.5, 'cape');
check('Cape i=28.5 reachable', capeMatch.azimuth_reachable === true, `az=${capeMatch.azimuth_from_north_deg}`);
check('Cape az near east', capeMatch.azimuth_from_north_deg > 80 && capeMatch.azimuth_from_north_deg < 100,
  `az=${capeMatch.azimuth_from_north_deg}`);
check('Cape matched lat no dogleg', !capeMatch.dogleg_needed);

const capeHigh = launchAzimuthDoglegSketch(50, 'cape');
check('Cape DLA 50 needs plane/dogleg', capeHigh.dogleg_needed || capeHigh.recommended_addon_m_s > 0,
  `addon=${capeHigh.recommended_addon_m_s}`);
check('dogleg cheaper than pure plane',
  capeHigh.dogleg_dv_m_s > 0
  && capeHigh.plane_change_dv_m_s > 0
  && capeHigh.dogleg_dv_m_s <= capeHigh.plane_change_dv_m_s + 1e-6);

// i_des < site lat → cannot achieve i < |φ| without plane/dogleg after insertion
const lowDla = launchAzimuthDoglegSketch(10, 'cape'); // 10° < 28.5°
check('low DLA vs Cape lat → dogleg path', lowDla.dogleg_needed === true || lowDla.azimuth_reachable === false,
  `i_des=${lowDla.i_des_deg} i_min=${lowDla.i_min_deg}`);

const kourou = launchAzimuthDoglegSketch(5.2, 'kourou');
check('Kourou near-equatorial az', kourou.azimuth_from_north_deg != null || kourou.note);

const addon = doglegNeedAddon_m_s({ body1: { name: 'Earth' } }, 'cape', 50);
check('Earth dogleg addon > 0', addon > 100, `addon=${addon}`);
check('Mars no dogleg addon', doglegNeedAddon_m_s({ body1: { name: 'Mars' } }, 'cape', 50) === 0);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nlaunch_azimuth: ok');
