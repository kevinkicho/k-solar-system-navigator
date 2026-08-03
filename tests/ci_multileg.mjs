/**
 * CI multi-leg smoke: Earth → Mars flyby → Jupiter compute + structure.
 * Uses self-hosted server + firebase=0 (hermetic).
 */
import { chromium } from 'playwright';
import { createServer } from '../server.js';

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
}
function section(s) { console.log('\n━━━ ' + s + ' ━━━'); }

let server = null;
let appUrl = process.env.HELIOS_URL || null;
if (!appUrl) {
  server = createServer();
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  appUrl = `http://127.0.0.1:${server.address().port}/`;
}
const bootUrl = (() => {
  try {
    const u = new URL(appUrl);
    if (!u.searchParams.has('firebase')) u.searchParams.set('firebase', '0');
    return u.toString();
  } catch {
    return appUrl.includes('?') ? `${appUrl}&firebase=0` : `${appUrl}?firebase=0`;
  }
})();

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  section('MULTI-LEG BOOT');
  await page.goto(bootUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.__HELIOS?.scene && (window.__HELIOS.bodyPositions?.size ?? 0) >= 8,
    null,
    { timeout: 60000 },
  );
  check('boot ok', true);

  section('EARTH → MARS FLYBY → JUPITER');
  await page.locator('.body-item', { hasText: 'Earth' }).first().click({ button: 'right' });
  await page.locator('.body-item', { hasText: 'Jupiter' }).first().click({ button: 'right' });
  await page.locator('.rail-tab[data-tab="plan"]').click().catch(() => {});
  await page.locator('#btn-add-flyby').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const dep = document.getElementById('depart-date');
    if (dep) {
      dep.value = '2026-01-15T00:00:00';
      dep.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const sel = document.querySelector('.flyby-row .flyby-body, #flyby-list select');
    if (sel) {
      // pick Mars if present
      const opt = [...sel.options].find((o) => /mars/i.test(o.textContent || o.value));
      if (opt) sel.value = opt.value;
      else sel.value = 'Mars';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const input = document.querySelector('.flyby-row .flyby-date, .flyby-date');
    if (input) {
      const d = new Date(Date.UTC(2028, 1, 15));
      const pad = (n) => String(n).padStart(2, '0');
      input.value = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T00:00:00`;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.locator('#calc-route').click();
  await page.waitForFunction(
    () => {
      const td = window.__HELIOS?.transferData;
      return td && (td.isMultiLeg || td.lambertOk);
    },
    null,
    { timeout: 30000 },
  );
  const info = await page.evaluate(() => {
    const td = window.__HELIOS?.transferData;
    if (!td) return null;
    return {
      isMultiLeg: !!td.isMultiLeg,
      allLegsOk: !!td.allLegsOk,
      legCount: td.legs?.length ?? 0,
      flybys: (window.__HELIOS?.state?.flybys || []).length,
      hasResults: (document.getElementById('transfer-results')?.textContent || '').length > 40,
      ready: !!td.dossier?.mission_ready || td.dossier?.status === 'pass'
        || td.dossier?.status === 'pass_with_warnings' || td.dossier?.status === 'fail',
    };
  });
  check('transferData present', !!info);
  check('is multi-leg', !!info?.isMultiLeg, JSON.stringify(info));
  check('all legs ok', !!info?.allLegsOk, `legs=${info?.legCount}`);
  check('≥2 legs', (info?.legCount || 0) >= 2, `n=${info?.legCount}`);
  check('results panel populated', !!info?.hasResults);
  check('dossier status recorded', !!info?.ready);

  section('HYGIENE');
  const real = errors.filter((e) => !/favicon|404|CORS|net::ERR|firebase/i.test(e));
  check('no critical page errors', real.length === 0, real.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  if (server) await new Promise((r) => server.close(r));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed · ${failed} failed · ${results.length} checks`);
if (failed) process.exit(1);
console.log('CI multi-leg smoke passed');
