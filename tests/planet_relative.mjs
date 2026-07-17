/**
 * Planet-relative (parent-centered) routing: Europa→Io, Earth→Moon, etc.
 */
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function check(name, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const { MOONS } = await import(pathToFileURL(resolve(ROOT, 'js/data/moons.js')).href);
const { BODIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/bodies.js')).href);
const {
  isPlanetRelativeRoute,
  resolvePlanetRelativeCentral,
  planetRelativeTransferSeed,
  bodyOrbitalRadius_m,
} = await import(pathToFileURL(resolve(ROOT, 'js/physics/planet-relative.js')).href);
const { hohmannTransfer } = await import(pathToFileURL(resolve(ROOT, 'js/physics/kepler.js')).href);
const { solveTransferOrbit } = await import(pathToFileURL(resolve(ROOT, 'js/physics/routing.js')).href);
const { computeMissionBudget } = await import(pathToFileURL(resolve(ROOT, 'js/physics/mission-budget.js')).href);
const { runQualityGates } = await import(pathToFileURL(resolve(ROOT, 'js/physics/plan-quality.js')).href);
const { DAY } = await import(pathToFileURL(resolve(ROOT, 'js/constants.js')).href);

const Earth = BODIES.find((b) => b.name === 'Earth');
const Mars = BODIES.find((b) => b.name === 'Mars');
const Jupiter = BODIES.find((b) => b.name === 'Jupiter');
const Moon = MOONS.find((m) => m.name === 'Moon');
const Io = MOONS.find((m) => m.name === 'Io');
const Europa = MOONS.find((m) => m.name === 'Europa');
const Phobos = MOONS.find((m) => m.name === 'Phobos');
const Deimos = MOONS.find((m) => m.name === 'Deimos');

check('Earth→Mars not planet-relative', !isPlanetRelativeRoute(Earth, Mars));
check('Europa→Io is planet-relative', isPlanetRelativeRoute(Europa, Io));
check('Earth→Moon is planet-relative', isPlanetRelativeRoute(Earth, Moon));
check('Moon→Earth is planet-relative', isPlanetRelativeRoute(Moon, Earth));
check('Phobos→Deimos is planet-relative', isPlanetRelativeRoute(Phobos, Deimos));
check('Europa→Io central is Jupiter', resolvePlanetRelativeCentral(Europa, Io)?.name === 'Jupiter');
check('Earth→Moon central is Earth', resolvePlanetRelativeCentral(Earth, Moon)?.name === 'Earth');

// Seed TOF: Io/Europa Hohmann class is days, not half a Jupiter year
const seed = planetRelativeTransferSeed(Europa, Io, 0);
check('Europa→Io seed planetRelative flag', seed.planetRelative === true);
check('Europa→Io seed central Jupiter', seed.centralBodyName === 'Jupiter');
const tofDays = seed.transferTime / DAY;
check(
  'Europa→Io TOF is days-scale (not ~half Jupiter year)',
  tofDays > 0.2 && tofDays < 30,
  `tof=${tofDays.toFixed(2)} d`,
);

// hohmannTransfer routes through planet-relative seed
const h = hohmannTransfer(Europa, Io, 0);
check('hohmannTransfer Europa→Io is planet-relative', h.planetRelative === true);
check('hohmannTransfer TOF matches seed class', h.transferTime / DAY < 30);

// Full Lambert solve
const td = { ...h };
solveTransferOrbit(td);
check('Europa→Io Lambert OK', !!td.lambertOk, td.lambertOk ? '' : 'solve failed');
check('orbit frame planetocentric', td.orbitFrame === 'planetocentric');
check('Δv finite and positive', isFinite(td.dvTotal_lambert) && td.dvTotal_lambert > 0,
  `dv=${(td.dvTotal_lambert / 1000).toFixed(2)} km/s`);
// Co-orbital Galilean transfers are typically a few km/s class (not 20+ helio nonsense)
check(
  'Europa→Io transfer Δv under 15 km/s',
  td.dvTotal_lambert < 15000,
  `dv=${(td.dvTotal_lambert / 1000).toFixed(2)} km/s`,
);

const budget = computeMissionBudget(td);
check('mission budget available', !!budget);
check('mission budget planetRelative', budget?.planetRelative === true);
check('mission total finite', isFinite(budget?.totalMission) && budget.totalMission > 0,
  budget ? `mission=${(budget.totalMission / 1000).toFixed(2)} km/s` : '');

const gates = runQualityGates(td, null, {});
const periGate = gates.gates.find((g) => g.code === 'G_PERIHELION');
check('quality gates status not fail on peri for good PR route',
  periGate && periGate.level !== 'fail',
  periGate ? periGate.message : 'no peri gate');
check('G_ORIGIN_DEST ok', gates.gates.find((g) => g.code === 'G_ORIGIN_DEST')?.level === 'ok');

// Earth → Moon
const tdEM = { ...hohmannTransfer(Earth, Moon, 0) };
solveTransferOrbit(tdEM);
check('Earth→Moon Lambert OK', !!tdEM.lambertOk);
check(
  'Earth→Moon TOF ~1–10 days class',
  tdEM.transferTime / DAY > 0.5 && tdEM.transferTime / DAY < 15,
  `tof=${(tdEM.transferTime / DAY).toFixed(2)} d`,
);
check(
  'Earth→Moon Δv under 20 km/s',
  tdEM.lambertOk && tdEM.dvTotal_lambert < 20000,
  tdEM.lambertOk ? `dv=${(tdEM.dvTotal_lambert / 1000).toFixed(2)} km/s` : 'no solve',
);

// Moon → Earth reverse
const tdME = { ...hohmannTransfer(Moon, Earth, 0) };
solveTransferOrbit(tdME);
check('Moon→Earth Lambert OK', !!tdME.lambertOk);

// Radii sanity
check('Io orbital radius ~4.2e8 m', Math.abs(bodyOrbitalRadius_m(Io, Jupiter) - 421700e3) < 1e6);
check('Earth parking > Earth radius', bodyOrbitalRadius_m(Earth, Earth) > Earth.radius);

// Heliocentric Earth→Mars still works
const tdHelio = { ...hohmannTransfer(Earth, Mars, 0) };
solveTransferOrbit(tdHelio);
check('Earth→Mars not planet-relative after solve', !tdHelio.planetRelative);
check('Earth→Mars Lambert OK', !!tdHelio.lambertOk);

if (process.exitCode) {
  console.error('\nplanet_relative.mjs: FAILED');
  process.exit(1);
}
console.log('\nplanet_relative.mjs: all checks passed');
