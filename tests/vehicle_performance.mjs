import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vp = await import(pathToFileURL(resolve(ROOT, 'js/physics/vehicle-performance.js')).href);
const v = await import(pathToFileURL(resolve(ROOT, 'js/physics/vehicles.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ VEHICLE PERFORMANCE SHEETS ━━━');

const esc = vp.earthSurfaceEscapeVelocity_m_s();
check('Earth escape ~11.2 km/s', Math.abs(esc - 11186) < 50, `got ${esc.toFixed(0)}`);
const circ = vp.earthCircularVelocity_m_s(200e3);
check('LEO circ ~7.8 km/s', Math.abs(circ - 7788) < 80, `got ${circ.toFixed(0)}`);
const g = vp.earthSurfaceG_m_s2();
check('surface g ~9.8', Math.abs(g - 9.81) < 0.05, `got ${g.toFixed(3)}`);

const sh = vp.superHeavyEngineeringSheet(0);
check('SH ideal Δv ≈ superHeavyDeltaV', Math.abs(sh.idealDv_m_s - v.superHeavyDeltaV()) < 1, `sh=${sh.idealDv_m_s.toFixed(1)}`);
check('SH T/W liftoff > 1', sh.twr_liftoff > 1, `twr=${sh.twr_liftoff?.toFixed(2)}`);
check('SH accel liftoff finite', sh.accel_liftoff_m_s2 > 0);

const ss = vp.starshipEngineeringSheet(0, 'unrefueled');
check('SS zero-cargo Δv ≈ starshipDeltaV', Math.abs(ss.idealDv_m_s - v.starshipDeltaV()) < 1);
check('SS engines 6', ss.numEngines === 6);

const f9 = vp.falcon9EngineeringSheet(1000, 'expendable');
check('F9 two stages', f9.stages.length === 2);
check('F9 S1 T/W > 1', f9.stages[0].twr_liftoff > 1);
check('F9 stack ideal Δv > 8 km/s', f9.stackIdealDv_m_s > 8000, `sum=${f9.stackIdealDv_m_s.toFixed(0)}`);

const rep = vp.buildVehicleEngineeringReport({
  vehicleId: 'sh-starship', starshipArch: 'unrefueled', cargoMass_kg: 50000,
});
check('report has SH+SS stages', rep.stages?.length === 2);
check('env has escape', rep.environment.surface_escape_m_s > 10000);
check('atm notes present', !!rep.environment.atmosphere.sea_level);

const repF9 = vp.buildVehicleEngineeringReport({ vehicleId: 'falcon9', cargoMass_kg: 2000 });
check('F9 report stages', repF9.stages?.length === 2);

if (failed) {
  console.error(`\n${failed} vehicle performance checks failed`);
  process.exit(1);
}
console.log('\nAll vehicle performance checks passed');
