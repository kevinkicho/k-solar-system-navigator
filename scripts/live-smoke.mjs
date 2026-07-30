/**
 * Production smoke checks for HELIOS (Hosting + App Hosting + Functions + Storage).
 *
 *   node scripts/live-smoke.mjs
 *   node scripts/live-smoke.mjs --base https://k-solar-system-navigator.web.app
 */
const HOSTING = 'https://k-solar-system-navigator.web.app';
const APPHOST = 'https://helios--k-solar-system-navigator.us-central1.hosted.app';
const FN = 'https://us-central1-k-solar-system-navigator.cloudfunctions.net';

let failed = 0;
function ok(label, pass, detail = '') {
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!pass) failed++;
}

async function get(url, opts = {}) {
  const res = await fetch(url, { redirect: 'follow', ...opts });
  const buf = await res.arrayBuffer();
  const text = new TextDecoder().decode(buf.slice(0, Math.min(buf.byteLength, 200000)));
  return { res, buf, text, bytes: buf.byteLength };
}

async function main() {
  console.log('\n━━━ HELIOS LIVE SMOKE ━━━');
  console.log('Primary surface: App Hosting\n');

  // App Hosting (primary production)
  {
    console.log('App Hosting (primary)');
    const home = await get(APPHOST + '/');
    ok('home 200', home.res.status === 200);
    ok('home industrial framing', /mission|helios|preliminary|not flight/i.test(home.text));
    const api = await get(APPHOST + '/api/ephemeris/dense-spk');
    ok('dense-spk API 200', api.res.status === 200);
    let localPacks = 0;
    let regVer = null;
    try {
      const j = JSON.parse(api.text);
      localPacks = j.local_registry?.packs?.length || j.pack_count || 0;
      regVer = j.registry_version ?? j.local_registry?.version ?? null;
      ok('API ok flag', j.ok === true);
      ok('API industrial grade field', j.product_grade === 'industrial-preliminary' || j.product_class === 'preliminary-not-flight-certified');
    } catch {
      ok('API JSON', false);
    }
    ok('API local packs ≥6', localPacks >= 6, `n=${localPacks} ver=${regVer}`);
    const meta = await get(APPHOST + '/api/ephemeris/dense-spk/galilean.meta.json');
    ok('API galilean meta', meta.res.status === 200 && /galilean|io/i.test(meta.text));
    const bin = await get(APPHOST + '/api/ephemeris/dense-spk/galilean.bin');
    ok('API galilean.bin ~8 MiB', bin.res.status === 200 && bin.bytes > 8e6, `bytes=${bin.bytes}`);
    const health = await get(APPHOST + '/api/health');
    ok('api/health', health.res.status === 200);
    try {
      const h = JSON.parse(health.text);
      ok('health industrial grade', h.product_grade === 'industrial-preliminary' || h.product_class === 'preliminary-not-flight-certified');
    } catch {
      ok('health JSON', false);
    }
  }

  // Classic Hosting (static fallback)
  {
    console.log('\nClassic Hosting (fallback)');
    const home = await get(HOSTING + '/');
    ok('home 200', home.res.status === 200);
    ok('home mentions HELIOS/mission', /helios|mission|solar/i.test(home.text));
    const mainJs = await get(HOSTING + '/js/main.js');
    ok('main.js 200', mainJs.res.status === 200 && mainJs.bytes > 500);
    ok('no classroom mode activation', !/mode === 'classroom'|mode===\"classroom\"/.test(mainJs.text)
      || !/classroomMode = true/.test(mainJs.text));
    const reg = await get(HOSTING + '/assets/dense-spk/registry.json');
    ok('dense registry 200', reg.res.status === 200);
    let packs = 0;
    try {
      packs = JSON.parse(reg.text).packs?.length || 0;
    } catch { /* */ }
    ok('dense registry ≥6 packs', packs >= 6, `packs=${packs}`);
    const gal = await get(HOSTING + '/assets/dense-spk/galilean.bin');
    ok('galilean.bin ~8 MiB', gal.res.status === 200 && gal.bytes > 8e6, `bytes=${gal.bytes}`);
    const ops = await get(HOSTING + '/js/ui/flight-ops-ui.js');
    ok('OPS prefetch UI present', /prefetch-galilean|prefetchDensePacks/i.test(ops.text));
    const cloud = await get(HOSTING + '/js/firebase/dense-spk-cloud.js');
    ok('dense-spk-cloud client', /getDenseSpkStorageUrl|fetchDensePackFromStorage/i.test(cloud.text));
  }

  // Functions + Storage catalog
  {
    console.log('\nCloud Functions + Storage');
    const health = await get(FN + '/heliosHealth');
    ok('heliosHealth', health.res.status === 200 && /helios-functions/i.test(health.text));
    const cat = await get(FN + '/denseSpkCatalog');
    ok('denseSpkCatalog 200', cat.res.status === 200);
    try {
      const j = JSON.parse(cat.text);
      ok('catalog ok', j.ok === true);
      ok('Storage files ≥10', (j.storage_files?.length || 0) >= 10, `n=${j.storage_files?.length}`);
      ok('RTDB registry packs ≥6', (j.registry?.packs?.length || 0) >= 6,
        `n=${j.registry?.packs?.length} src=${j.registry?.source}`);
    } catch {
      ok('catalog JSON', false);
    }
  }

  console.log(`\n━━━ ${failed ? failed + ' FAILED' : 'ALL PASSED'} ━━━\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
