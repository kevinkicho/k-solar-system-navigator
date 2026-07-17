/**
 * CLI sample trip planner — five diverse routes from "now" departure.
 * Usage: node scripts/sample-routes-cli.mjs
 */
import { DAY, AU, J2000 } from '../js/constants.js';
import { listRouteable } from '../js/data/catalog.js';
import { hohmannTransfer } from '../js/physics/kepler.js';
import {
  solveTransferOrbit, findNearestFeasibleTransfer,
} from '../js/physics/routing.js';
import { computeMissionBudget } from '../js/physics/mission-budget.js';
import { runQualityGates } from '../js/physics/plan-quality.js';
import { computeNeed } from '../js/physics/need.js';
import { isPlanetRelativeRoute } from '../js/physics/planet-relative.js';

const now = new Date();
const depSim = (now.getTime() - J2000) / 1000;
const catalog = listRouteable();

function kindOf(b) {
  return b.kind || (b.parent ? 'moon' : 'planet');
}

function find(name) {
  return catalog.find((b) => b.name === name) || null;
}

// Diverse sample pairs (moons, dwarfs, NEOs, ice giants — not only terrestrial)
const PAIRS = [
  ['Titan', 'Enceladus'],       // Saturn system moons
  ['Ceres', 'Haumea'],          // main-belt dwarf → outer dwarf
  ['Earth', 'Bennu'],           // planet → NEO
  ['Europa', 'Callisto'],       // Galilean moons
  ['Neptune', 'Triton'],        // ice giant → moon
];

console.log('================================================================');
console.log(' HELIOS sample routes — CLI trip planning');
console.log(' Departure (now):', now.toISOString());
console.log(' simTime from J2000 (s):', depSim.toFixed(0));
console.log('================================================================');

const results = [];

for (let i = 0; i < PAIRS.length; i++) {
  const [a, b] = PAIRS[i];
  const o = find(a);
  const d = find(b);
  if (!o || !d) {
    console.log(`\n--- ${i + 1}. ${a} → ${b} --- MISSING BODY`);
    continue;
  }

  const label = `${i + 1}. ${o.name} → ${d.name}`;
  const pr = isPlanetRelativeRoute(o, d);
  console.log(`\n--- ${label} ---`);
  console.log(
    '  kinds:', kindOf(o), '→', kindOf(d),
    pr ? '(planet-relative / same SOI)' : '(heliocentric)',
  );

  let seed = hohmannTransfer(o, d, depSim);
  let td = { ...seed };
  solveTransferOrbit(td);

  let recovered = false;
  let pathNote = '';
  const periAU = td.orbitPhysical && !td.planetRelative
    ? (td.orbitPhysical.a * (1 - td.orbitPhysical.e)) / AU
    : null;
  const dv0 = td.dvTotal_lambert ?? td.dvTotal ?? Infinity;
  const patho = !td.lambertOk
    || (periAU != null && periAU < 0.3)
    || (Number.isFinite(dv0) && dv0 > 50000);

  if (patho && !td.planetRelative) {
    const fix = findNearestFeasibleTransfer(o, d, depSim, seed.transferTime, {
      backend: 'approx',
    });
    if (fix) {
      seed = hohmannTransfer(o, d, fix.departureSimTime);
      td = { ...seed };
      td.transferTime = fix.transferTime;
      td.arrivalSimTime = fix.arrivalSimTime;
      td.departureSimTime = fix.departureSimTime;
      solveTransferOrbit(td);
      recovered = true;
      pathNote = 'nearest-feasible window search';
    } else {
      pathNote = 'pathological; no recovery window';
    }
  } else if (td.phaseSnapped) {
    pathNote = 'Hohmann phase window snap';
  }

  const tofD = td.transferTime / DAY;
  const depDate = new Date(J2000 + td.departureSimTime * 1000);
  const arrDate = new Date(J2000 + td.arrivalSimTime * 1000);
  const dv = td.dvTotal_lambert ?? td.dvTotal;
  const budget = td.lambertOk ? computeMissionBudget(td) : null;
  const need = computeNeed(td, {
    vehicleId: 'abstract',
    costBasis: 'helio',
    starshipArch: 'legacy-demo',
  });
  const gates = runQualityGates(td, {
    need,
    capability: { applicable: true, capability_dv_m_s: 1e6 },
    margin: { feasible: true, kind: 'dv', margin_dv_m_s: 1e6 },
  }, { dateAdjusted: recovered || !!td.phaseSnapped });

  const dv1 = (td.dv1_lambert ?? td.dv1 ?? 0) / 1000;
  const dv2 = (td.dv2_lambert ?? td.dv2 ?? 0) / 1000;

  console.log(
    '  lambertOk:', !!td.lambertOk,
    td.planetRelative ? `frame=${td.centralBodyName}-centered` : 'frame=heliocentric',
    td.analyticHohmann ? '(analytic Hohmann)' : '',
  );
  console.log(
    '  departure:', depDate.toISOString(),
    recovered || td.phaseSnapped ? '(adjusted)' : '(as requested now)',
  );
  console.log('  arrival:  ', arrDate.toISOString());
  console.log(
    '  transit:  ', tofD.toFixed(3), 'days (', (tofD / 365.25).toFixed(3), 'yr )',
  );
  console.log('  Δv1/Δv2:  ', dv1.toFixed(3), '/', dv2.toFixed(3), 'km/s');
  console.log('  total Δv: ', (dv / 1000).toFixed(3), 'km/s (transfer-frame)');
  if (periAU != null) console.log('  perihelion:', periAU.toFixed(4), 'AU');
  if (td.planetRelative && td.orbitPhysical) {
    const peri_m = td.orbitPhysical.a * (1 - td.orbitPhysical.e);
    const apo_m = td.orbitPhysical.a * (1 + td.orbitPhysical.e);
    console.log(
      '  peri/apo about', `${td.centralBodyName}:`,
      (peri_m / 1000).toFixed(0), '/', (apo_m / 1000).toFixed(0), 'km',
    );
  }
  if (budget) {
    console.log('  mission parking total:', (budget.totalMission / 1000).toFixed(3), 'km/s');
  }
  console.log(
    '  need (helio/abstract):',
    need.applicable ? `${(need.need_dv_m_s / 1000).toFixed(3)} km/s` : need.reason,
  );
  console.log('  plan status:', gates.status, '| mission_ready:', gates.mission_ready);
  console.log(
    '  gates:',
    gates.gates.map((g) => `${g.level[0].toUpperCase()}:${g.code.replace('G_', '')}`).join(' '),
  );
  if (pathNote) console.log('  note:', pathNote);
  if (td.hohmannNote) console.log('  note:', td.hohmannNote);

  results.push({
    route: label,
    kinds: `${kindOf(o)}→${kindOf(d)}`,
    frame: td.planetRelative ? `${td.centralBodyName}-centered` : 'heliocentric',
    lambertOk: !!td.lambertOk,
    dep: depDate.toISOString().slice(0, 19) + 'Z',
    arr: arrDate.toISOString().slice(0, 19) + 'Z',
    tof_d: +tofD.toFixed(2),
    dv_km_s: +(dv / 1000).toFixed(2),
    mission_km_s: budget ? +(budget.totalMission / 1000).toFixed(2) : null,
    status: gates.status,
    ready: gates.mission_ready,
  });
}

console.log('\n================================================================');
console.log(' SUMMARY');
console.log('================================================================');
console.table(results);
const ok = results.filter((r) => r.lambertOk).length;
console.log(`Solved ${ok}/${results.length} Lambert transfers.`);
if (ok < results.length) process.exitCode = 1;
