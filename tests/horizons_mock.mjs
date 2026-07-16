// Optional Horizons educational adapter — mocked fetch only (no live network).
// Proves parse works, compare math works, and opt-in off never calls fetch.

import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const importMod = (rel) => import(pathToFileURL(resolve(ROOT, rel)).href);

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}
function section(s) { console.log('\n━━━ ' + s + ' ━━━'); }

const hz = await importMod('js/physics/ephemeris-horizons.js');

// Representative Horizons VECTORS text (heliocentric ecliptic, AU-D, labeled).
// Values are educational placeholders, not a live snapshot.
const SAMPLE_VECTORS_TEXT = `
API VERSION: 1.2
API SOURCE: NASA/JPL Horizons API

*******************************************************************************
Ephemeris / WWW_USER Mon Jan  1 12:00:00 2024 Pasadena, USA      / Horizons
*******************************************************************************
Target body name: Mars (499)
Center body name: Solar System Barycenter (0)
*******************************************************************************
Start time      : A.D. 2000-Jan-01 12:00:00.0000 TDB
Stop  time      : A.D. 2000-Jan-01 13:00:00.0000 TDB
Step-size       : 60 minutes
*******************************************************************************
Output units    : AU-D
Reference frame : ICRF/J2000.0
Output type     : GEOMETRIC cartesian states
Output format   : 2 (position and velocity)
*******************************************************************************
$$SOE
2451545.000000000 = A.D. 2000-Jan-01 12:00:00.0000 TDB
 X = 1.390370444000000E+00 Y =-2.106729390000000E-02 Z =-3.461357800000000E-02
 VX= 7.644758900000000E-04 VY= 1.518247610000000E-02 VZ= 2.728931000000000E-04
$$EOE
*******************************************************************************
`;

const SAMPLE_JSON_WRAP = JSON.stringify({
  signature: { source: 'NASA/JPL Horizons API', version: '1.2' },
  result: SAMPLE_VECTORS_TEXT,
});

section('1. parseHorizonsVectors (labeled sample)');
{
  const p = hz.parseHorizonsVectors(SAMPLE_VECTORS_TEXT);
  check('parses X', Math.abs(p.x - 1.390370444) < 1e-12, `x=${p.x}`);
  check('parses Y', Math.abs(p.y - (-0.0210672939)) < 1e-12, `y=${p.y}`);
  check('parses Z', Math.abs(p.z - (-0.034613578)) < 1e-12, `z=${p.z}`);
  check('parses VX', Math.abs(p.vx - 7.6447589e-4) < 1e-15);
  check('parses VY', Number.isFinite(p.vy));
  check('parses VZ', Number.isFinite(p.vz));
  check('parses JD', p.jd === 2451545.0, `jd=${p.jd}`);
}

section('2. parseHorizonsVectors (JSON wrapper)');
{
  const p = hz.parseHorizonsVectors(SAMPLE_JSON_WRAP);
  check('JSON.result X', Math.abs(p.x - 1.390370444) < 1e-12);
  check('JSON.result Y', Math.abs(p.y - (-0.0210672939)) < 1e-12);
}

section('3. parseHorizonsVectors (unlabeled row)');
{
  const unlabeled = `
$$SOE
2451545.000000000 1.0 -0.5 0.25 0.001 0.002 0.003
$$EOE
`;
  const p = hz.parseHorizonsVectors(unlabeled);
  check('unlabeled x', p.x === 1.0);
  check('unlabeled y', p.y === -0.5);
  check('unlabeled z', p.z === 0.25);
  check('unlabeled vx', p.vx === 0.001);
}

section('4. fetchHorizonsState with mocked fetch');
{
  let fetchCalls = 0;
  const mockFetch = async (url) => {
    fetchCalls++;
    check('mock URL hits Horizons host', String(url).includes('ssd.jpl.nasa.gov'));
    check('mock URL is VECTORS', String(url).includes('VECTORS') || String(url).includes('EPHEM_TYPE'));
    return {
      ok: true,
      status: 200,
      text: async () => SAMPLE_VECTORS_TEXT,
    };
  };
  const state = await hz.fetchHorizonsState({
    body: 'mars',
    epoch: new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
    fetchImpl: mockFetch,
  });
  check('mock fetch called once', fetchCalls === 1, `calls=${fetchCalls}`);
  check('fetched state x', Math.abs(state.x - 1.390370444) < 1e-12);
  check('url attached', typeof state.url === 'string' && state.url.includes('horizons'));
}

section('5. compareToApprox distance error');
{
  const horizons = { x: 1.0, y: 0.0, z: 0.0 };
  const kepler = { x: 1.0, y: 0.0, z: 0.0 };
  const zero = hz.compareToApprox(horizons, kepler);
  check('|Δr|=0 when identical', zero.distanceAU === 0 && zero.distanceKm === 0);

  const err = hz.compareToApprox({ x: 1.0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  check('|Δr|=1 AU offset', Math.abs(err.distanceAU - 1) < 1e-15, `au=${err.distanceAU}`);
  check('distanceKm ~ 1.496e8', Math.abs(err.distanceKm - 1.495978707e8) < 1);

  const scene = { x: 1.2, y: 0.05, z: -0.3 }; // HELIOS scene (Y↔Z vs ecliptic)
  const ecl = hz.scenePosToEcliptic(scene);
  check('scene→ecliptic swap', ecl.x === 1.2 && ecl.y === -0.3 && ecl.z === 0.05);
}

section('6. Opt-in off → zero network');
{
  let fetchCalls = 0;
  const mockFetch = async () => {
    fetchCalls++;
    return { ok: true, status: 200, text: async () => SAMPLE_VECTORS_TEXT };
  };
  const result = await hz.compareBodyIfOptedIn({
    optedIn: false,
    body: 'mars',
    epoch: new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
    keplerPos: { x: 1.39, y: -0.03, z: -0.02 },
    fetchImpl: mockFetch,
  });
  check('opt-in off skips', result.skipped === true && result.reason === 'opt-in off');
  check('opt-in off never calls fetch', fetchCalls === 0, `calls=${fetchCalls}`);
}

section('7. Opt-in on → mocked fetch + comparison');
{
  let fetchCalls = 0;
  const mockFetch = async () => {
    fetchCalls++;
    return { ok: true, status: 200, text: async () => SAMPLE_VECTORS_TEXT };
  };
  // Kepler pos already in ecliptic (sceneCoords: false)
  const keplerEcl = { x: 1.390370444, y: -0.0210672939, z: -0.034613578 };
  const result = await hz.compareBodyIfOptedIn({
    optedIn: true,
    body: { id: 'mars', name: 'Mars' },
    epoch: new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
    keplerPos: keplerEcl,
    fetchImpl: mockFetch,
    sceneCoords: false,
  });
  check('opt-in on does not skip', result.skipped === false);
  check('opt-in on calls fetch once', fetchCalls === 1, `calls=${fetchCalls}`);
  check('comparison near zero when matched', result.comparison.distanceAU < 1e-12,
    `au=${result.comparison?.distanceAU}`);
}

section('8. Body support + URL builder');
{
  check('mars command 499', hz.resolveHorizonsCommand('mars') === '499');
  check('earth command 399', hz.resolveHorizonsCommand({ id: 'earth' }) === '399');
  check('moon unsupported', hz.resolveHorizonsCommand('moon') === null);
  check('neo unsupported', hz.resolveHorizonsCommand('apophis') === null);

  const url = hz.buildHorizonsVectorsUrl({
    body: 'earth',
    epoch: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });
  check('URL has COMMAND earth', url.includes('399'));
  check('URL center SSB', url.includes('%40') || url.includes('@') || url.includes('CENTER'));
  check('URL ecliptic', url.includes('ECLIPTIC'));
}

section('9. Error paths');
{
  let threw = false;
  try { hz.parseHorizonsVectors('no markers here'); } catch { threw = true; }
  check('missing SOE throws', threw);

  threw = false;
  try {
    await hz.fetchHorizonsState({
      body: 'pluto',
      epoch: new Date(),
      fetchImpl: async () => ({ ok: true, text: async () => '' }),
    });
  } catch { threw = true; }
  check('unsupported body throws before fetch', threw);
}

console.log('\n━━━ SUMMARY ━━━\n');
if (failed) {
  console.error(`${failed} horizons_mock checks failed`);
  process.exit(1);
}
console.log('All horizons_mock checks passed');
process.exit(0);
