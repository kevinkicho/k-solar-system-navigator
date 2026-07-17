/**
 * Vehicle design-for-Need paper study (rocket-equation sizing).
 */
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vd = await import(pathToFileURL(resolve(ROOT, 'js/physics/vehicle-design.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ VEHICLE DESIGN FOR NEED ━━━');

// Classic: LOX/CH4, 350 s, dry 120 t, need 3 km/s → MR and prop
const R = vd.massRatioForDv(3000, 350);
check('mass ratio ~2.4 for 3 km/s @ 350 s', R != null && R > 2.3 && R < 2.5, `R=${R?.toFixed(3)}`);

const mp = vd.propellantForNeed(3000, 350, 120000, 0);
// mp = (R-1)*120000 ≈ 1.4*120e3 ≈ 168 t
check('propellant finite for 3 km/s', mp != null && mp > 100000 && mp < 250000, `mp=${(mp / 1000)?.toFixed(1)} t`);

const dvBack = vd.dvFromMasses(350, 120000, mp, 0);
check('round-trip rocket eq closes', Math.abs(dvBack - 3000) < 1, `dv=${dvBack?.toFixed(2)}`);

// High-energy Deimos→Neptune class ~22 km/s
const design = vd.designVehicleForNeed(22180, { cargoMass_kg: 0 });
check('design ok for 22 km/s', design.ok === true);
check('has Isp sweep', design.isp_sweep?.length >= 4);
check('has dry sweep', design.dry_mass_sweep?.length >= 4);
check('has paper sketch lines', design.recommendation?.paper_sketch?.length >= 3);
check('abstract budget ≥ need', design.recommendation?.abstract_budget_m_s >= 22180);
check('comparison gap positive', design.comparison?.gap_vs_unrefueled_m_s > 0);

// Higher Isp needs less prop
const mp330 = vd.propellantForNeed(10000, 330, 120000, 0);
const mp450 = vd.propellantForNeed(10000, 450, 120000, 0);
check('higher Isp → less prop', mp450 < mp330, `330=${(mp330 / 1000).toFixed(0)}t 450=${(mp450 / 1000).toFixed(0)}t`);

const two = vd.twoStageEqualSplit(8000, 350, 40000, 80000, 0);
check('two-stage total dv ~ need', two && Math.abs(two.total_dv_m_s - 8000) < 50, `tot=${two?.total_dv_m_s?.toFixed(0)}`);

const sens = vd.propellantSensitivity(5000, 350, 100000, 0);
check('sensitivity slope positive', sens.at_need.d_prop_per_km_s > 0);

check('bad need fails', vd.designVehicleForNeed(-1).ok === false);
check('equations documented', !!design.equations?.rocket);

if (failed) {
  console.error(`\n${failed} vehicle design check(s) failed`);
  process.exit(1);
}
console.log('\nAll vehicle design checks passed');
