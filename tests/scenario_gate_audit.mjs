/**
 * Offline scenario gate audit (E2 / K12).
 * Freezes vehicle per scenario.auditVehicleId — not ambient product default.
 */
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { SCENARIOS } = await import(pathToFileURL(resolve(ROOT, 'js/data/scenarios.js')).href);
const { findByIdOrName } = await import(pathToFileURL(resolve(ROOT, 'js/data/catalog.js')).href);
const { hohmannTransfer } = await import(pathToFileURL(resolve(ROOT, 'js/physics/kepler.js')).href);
const {
  solveTransferOrbit, solveMultiLegRoute, findNearestFeasibleTransfer, MIN_PERIHELION_AU,
} = await import(pathToFileURL(resolve(ROOT, 'js/physics/routing.js')).href);
const { AU, J2000 } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);
const { state } = await import(pathToFileURL(resolve(ROOT, 'js/state.js')).href);
const { buildPlanDossier } = await import(pathToFileURL(resolve(ROOT, 'js/ui/plan-dossier.js')).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ SCENARIO GATE AUDIT ━━━');

check('has scenarios', SCENARIOS.length >= 5);

for (const sc of SCENARIOS) {
  const expect = sc.plan_expect || 'mission_ready';
  // Freeze vehicle: abstract high budget so audit tests geometry gates, not product default SH.
  const veh = sc.auditVehicleId || 'abstract';
  state.vehicleId = veh;
  state.abstractBudget_m_s = sc.auditAbstractBudget_m_s ?? 50000;
  state.starshipArch = sc.auditStarshipArch || 'legacy-demo';
  state.cargoMass_kg = 0;
  state.costBasis = 'helio';
  state.classroomMode = false;
  state.planStrictVehicle = true;
  state.launchSiteId = 'any';
  state.fidelityLevel = 'L1';
  state.ephemerisBackend = 'approx';
  state.ascentLossBudget_m_s = 0;

  const origin = findByIdOrName(sc.origin);
  const dest = findByIdOrName(sc.destination);
  check(`${sc.id} bodies resolve`, !!(origin && dest));
  if (!origin || !dest) continue;

  const depSim = (sc.departureUTC - J2000) / 1000;
  let td;
  let dateAdjusted = false;
  let prevDep = depSim;
  if (sc.flybys?.length) {
    const waypoints = [
      { body: origin, simTime: depSim },
      ...sc.flybys.map((f) => ({
        body: findByIdOrName(f.bodyName || f.bodyId),
        simTime: (f.dateUTC - J2000) / 1000,
      })),
      { body: dest, simTime: 0 },
    ];
    const last = waypoints[waypoints.length - 2];
    if (last?.body) {
      const tail = hohmannTransfer(last.body, dest, last.simTime);
      waypoints[waypoints.length - 1].simTime = tail.arrivalSimTime;
    }
    td = solveMultiLegRoute(waypoints);
  } else {
    td = hohmannTransfer(origin, dest, depSim);
    td.ephemerisBackend = 'approx';
    solveTransferOrbit(td);
    // Mirror computeRoute recovery for pathological seeds
    const orb = td.orbitPhysical;
    const periAU = orb ? (orb.a * (1 - orb.e)) / AU : Infinity;
    const totalDv = td.dvTotal_lambert ?? td.dvTotal;
    const pathological = !isFinite(periAU) || periAU < MIN_PERIHELION_AU || totalDv > 30000;
    if (pathological) {
      const fix = findNearestFeasibleTransfer(origin, dest, depSim, td.transferTime, {
        backend: 'approx',
      });
      if (fix) {
        prevDep = depSim;
        td = hohmannTransfer(origin, dest, fix.departureSimTime);
        td.ephemerisBackend = 'approx';
        td.transferTime = fix.transferTime;
        td.arrivalSimTime = fix.arrivalSimTime;
        solveTransferOrbit(td);
        dateAdjusted = true;
      }
    }
  }

  const dossier = buildPlanDossier(td, {
    dateAdjusted,
    prevDepartureSimTime: dateAdjusted ? prevDep : null,
  });
  const ready = !!dossier?.mission_ready;
  const status = dossier?.status;

  if (expect === 'mission_ready') {
    check(`${sc.id} mission_ready`, ready, `status=${status} veh=${veh} dv=${((td.dvTotal_lambert || td.dvTotal || 0) / 1000).toFixed(1)}`);
  } else if (expect === 'demo_unsafe') {
    check(`${sc.id} demo_unsafe (not ready)`, !ready, `status=${status}`);
  } else if (expect === 'warn_ok') {
    check(`${sc.id} warn_ok (has dossier)`, !!dossier && ['pass', 'pass_with_warnings', 'fail'].includes(status),
      `status=${status} ready=${ready}`);
  }
}

if (failed) {
  console.error(`\n${failed} scenario audit check(s) failed`);
  process.exit(1);
}
console.log('\nAll scenario gate audit checks passed');
