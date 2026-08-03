/**
 * Dual-surface build identity smoke.
 * Compares git_sha / spa_main hash across classic Hosting and App Hosting when available.
 *
 *   node scripts/build-sha-smoke.mjs
 */
const HOSTING = process.env.HELIOS_HOSTING_URL || 'https://k-solar-system-navigator.web.app';
const APPHOST = process.env.HELIOS_APPHOST_URL
  || 'https://helios--k-solar-system-navigator.us-central1.hosted.app';

let failed = 0;
function ok(label, pass, detail = '') {
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!pass) failed++;
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return { ok: false, status: res.status };
    const j = await res.json();
    return { ok: true, status: res.status, j };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, bytes: text.length };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

console.log('\n━━━ BUILD-SHA DUAL SMOKE ━━━');
console.log(`Hosting: ${HOSTING}`);
console.log(`App Hosting: ${APPHOST}\n`);

const hHome = await fetchText(HOSTING + '/');
ok('Hosting home 200', hHome.ok, hHome.status || hHome.error);
ok('Hosting has SPA shell', /helios|mission|__HELIOS|js\/main/i.test(hHome.text || ''));

const aHome = await fetchText(APPHOST + '/');
ok('App Hosting home 200', aHome.ok, aHome.status || aHome.error);

const hBuild = await fetchJson(HOSTING + '/helios-build.json');
const aBuild = await fetchJson(APPHOST + '/helios-build.json');
// App Hosting may expose build via /helios-build.json in public or via prepare
const aBuildAlt = aBuild.ok ? aBuild : await fetchJson(APPHOST + '/api/health');

ok('Hosting helios-build.json', hBuild.ok, hBuild.status || hBuild.error);

let hSha = hBuild.j?.git_sha || null;
let hMain = hBuild.j?.spa_main_sha256_12 || null;
let aSha = aBuild.j?.git_sha || aBuildAlt.j?.git_sha || aBuildAlt.j?.build?.git_sha || null;
let aMain = aBuild.j?.spa_main_sha256_12 || aBuildAlt.j?.spa_main_sha256_12 || null;

if (aBuild.ok) {
  ok('App Hosting helios-build.json', true);
} else if (aBuildAlt.ok) {
  ok('App Hosting health/build identity', true, 'via /api/health');
} else {
  ok('App Hosting build identity endpoint', false, aBuild.error || aBuild.status);
}

if (hSha && aSha) {
  ok('git_sha matches across surfaces', hSha === aSha, `host=${hSha} app=${aSha}`);
} else {
  ok('git_sha present on at least one surface', !!(hSha || aSha), `host=${hSha} app=${aSha}`);
  if (hSha && !aSha) {
    console.log('  · note: App Hosting may lag prepare stamp; Hosting sha recorded');
  }
}

if (hMain && aMain) {
  ok('spa main hash matches', hMain === aMain, `host=${hMain} app=${aMain}`);
} else if (hMain) {
  ok('Hosting spa main hash present', true, hMain);
}

const hMainJs = await fetchText(HOSTING + '/js/main.js');
ok('Hosting js/main.js 200', hMainJs.ok && (hMainJs.bytes || 0) > 500, `bytes=${hMainJs.bytes}`);

const hReg = await fetchJson(HOSTING + '/assets/dense-spk/registry.json');
ok('Hosting dense registry', hReg.ok && (hReg.j?.packs?.length || 0) >= 6,
  `packs=${hReg.j?.packs?.length}`);

// Kernels must not be public on Hosting SPA surface
const kernels = await fetchText(HOSTING + '/assets/kernels/de440s.bsp');
ok('Hosting does not serve kernels (404/deny)', !kernels.ok || kernels.status === 404,
  `status=${kernels.status}`);

if (failed) {
  console.error(`\nbuild-sha-smoke: ${failed} failed`);
  process.exit(1);
}
console.log('\nbuild-sha-smoke: ok');
