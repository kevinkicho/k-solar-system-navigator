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

// Starship ship / Super Heavy multiples
const base = vd.shStarshipBaseline();
// Primary baseline is Starship ship (~1200 t prop), not full stack
check('baseline ship prop ~1200 t', base.propellantMass_kg > 1e6 && base.propellantMass_kg < 1.5e6);
check('stack prop still includes SH', base.stack?.propellantMass_kg > 4e6);
check('formatTimes 2.25', vd.formatTimes(2.25) === '2.25×');
const vs = design.recommendation?.vs_sh_starship;
check('vs baseline ok', vs?.ok === true);
check('has fuel multiple text', !!vs?.multiples_text?.propellant_mass);
check('has thrust multiple text', !!vs?.multiples_text?.thrust_same_twr);
check('has tank volume multiple', !!vs?.multiples_text?.tank_volume);
check('comparison lines mention Super Heavy', (vs?.lines || []).some((l) => /Super Heavy/i.test(l)));
check('comparison lines mention Starship ship', (vs?.lines || []).some((l) => /Starship ship/i.test(l)));
check('paper sketch includes multiples section', (design.recommendation?.paper_sketch || []).some((l) => /multiples|Super Heavy|Starship ship/i.test(l)));

// Hard Need at CH4: fuel multiple vs Starship ship must be ≫ 0.2 (old full-stack bug)
const ch4Hard = vd.designVehicleForNeed(12000, { cargoMass_kg: 0 });
const ch4Mp = vd.propellantForNeed(12000, 350, 120000, 0);
const ch4Vs = vd.compareSketchToShStarship({
  dryMass_kg: 120000,
  propellantMass_kg: ch4Mp,
  wetMass_kg: 120000 + ch4Mp,
}, vd.PROPULSION_CLASSES[1]);
check(
  'CH4 12 km/s fuel ≥ ~2× Starship ship (not ~0.1× full stack)',
  ch4Vs.ok && ch4Vs.multiples.propellant_mass > 2,
  `×=${ch4Vs.multiples?.propellant_mass?.toFixed(2)} prop=${(ch4Mp / 1000).toFixed(0)}t`,
);
// High-Isp recommender should still expose chemical SS-class multiples
const chemVs = ch4Hard.recommendation?.vs_chemical_starship_class;
check(
  'chemical SS-class comparison present when Isp escalates or always',
  chemVs?.ok === true && chemVs.multiples.propellant_mass > 1,
  `chem×=${chemVs?.multiples?.propellant_mass?.toFixed(2)} isp=${ch4Hard.recommendation?.propulsion?.isp}`,
);

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
