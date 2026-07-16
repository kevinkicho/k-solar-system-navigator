import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const v = await import(pathToFileURL(resolve(ROOT, 'js/physics/vehicles.js')).href);
const ss = await import(pathToFileURL(resolve(ROOT, 'js/physics/starship-architecture.js')).href);
const f9 = await import(pathToFileURL(resolve(ROOT, 'js/data/falcon9-c3-table.js')).href);
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ CAPABILITY / MARGIN / VEHICLES ━━━');

// PR2/3 legacy
const sh = v.superHeavyDeltaV();
check('SH golden ±1 m/s', Math.abs(sh - 3766.67) < 1, `got ${sh}`);
check('legacy label', /legacy/i.test(v.presetDisplayName('sh-starship')));
check('disclaimer long', v.presetDisclaimer('sh-starship').length > 40);

const needHelio = { phase: 'helio_leg', need_dv_m_s: 5000, applicable: true, c3_m2_s2: 20e6 };
const capAbs = v.evaluateCapability(needHelio, { vehicleId: 'chem-medium' });
check('chem-medium cap 6000', capAbs.capability_dv_m_s === 6000);
const mAbs = v.evaluateMargin(needHelio, capAbs, { cargoMass_kg: 1000 });
check('abstract ignores cargo for margin kind', mAbs.kind === 'dv' && mAbs.feasible === true);

const capLeg = v.evaluateCapability(needHelio, { vehicleId: 'sh-starship', starshipArch: 'legacy-demo' });
check('legacy SH cap', Math.abs(capLeg.capability_dv_m_s - sh) < 1);

// PR5 unrefueled
const zero = ss.unrefueledZeroCargoDv();
check('zero cargo ≈ starshipDeltaV', Math.abs(zero - v.starshipDeltaV()) < 1, `zero=${zero.toFixed(2)}`);
const highCargo = ss.starshipCapabilityDv(100000, 'unrefueled');
check('higher cargo lower Δv', highCargo < zero);
const needInj = { phase: 'injection', need_dv_m_s: zero * 0.5, applicable: true, c3_m2_s2: 15e6 };
const maxC = ss.maxCargoForNeed(needInj.need_dv_m_s, 'unrefueled');
check('max cargo positive', maxC > 0);
const round = ss.starshipCapabilityDv(maxC, 'unrefueled');
check('max cargo round-trip', round >= needInj.need_dv_m_s * 0.999);

// PR6 tankers
const n0 = ss.minTankersForNeed(5000, 50000);
check('tankers needed finite or null', n0 === null || (n0 >= 0 && n0 <= 20));
const capT = v.evaluateCapability(needInj, {
  vehicleId: 'sh-starship', starshipArch: 'tanker-n', tankerCount: 5, cargoMass_kg: 10000,
});
check('tanker-n capability', capT.applicable && capT.capability_dv_m_s > 0);

// PR4 F9
const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const c3 = 20e6; // 20 km²/s²
const pEx = f9.falcon9MaxPayloadKg(c3, 'expendable');
const pAs = f9.falcon9MaxPayloadKg(c3, 'asds');
check('F9 midpoint interp', pEx > 2200 && pEx < 4200, `p=${pEx}`);
check('ASDS derate', Math.abs(pAs - pEx * f9.F9_ASDS_DERATE) < 1e-6);
check('F9 knot exact c3=0', f9.falcon9MaxPayloadKg(0, 'expendable') === 5500);

const needF9 = { phase: 'injection', need_dv_m_s: 4000, applicable: true, c3_m2_s2: c3 };
const capF9 = v.evaluateCapability(needF9, { vehicleId: 'falcon9', originBody: earth, cargoMass_kg: 1000 });
check('F9 earth applicable', capF9.applicable && capF9.primary_metric === 'cargo');
const mF9 = v.evaluateMargin(needF9, capF9, { cargoMass_kg: 1000 });
check('F9 cargo margin kind', mF9.kind === 'cargo' && mF9.feasible === true);

const capF9bad = v.evaluateCapability(needF9, { vehicleId: 'falcon9', originBody: mars });
check('F9 non-earth inapplicable', !capF9bad.applicable);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll capability/margin checks passed');
