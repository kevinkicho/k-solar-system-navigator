/**
 * Copy HELIOS SPA assets into web/public for Next.js / Firebase App Hosting.
 *
 * Source resolution (first hit wins):
 *  1. HELIOS_SPA_ROOT env
 *  2. Repo root parent of web/ (local monorepo: ../js ../css ../assets)
 *  3. web/spa-source/ (committed or CI-synced fallback when rootDir=web only)
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync,
} from 'fs';
import { createHash } from 'crypto';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(__dirname, '..');
const PUBLIC = join(WEB, 'public');

function resolveSpaRoot() {
  if (process.env.HELIOS_SPA_ROOT && existsSync(process.env.HELIOS_SPA_ROOT)) {
    return resolve(process.env.HELIOS_SPA_ROOT);
  }
  const parent = resolve(WEB, '..');
  if (existsSync(join(parent, 'js', 'main.js'))) return parent;
  const bundled = join(WEB, 'spa-source');
  if (existsSync(join(bundled, 'js', 'main.js'))) return bundled;
  return null;
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function copyDir(src, dest) {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  ensureDir(dirname(dest));
  cpSync(src, dest, { recursive: true });
}

const SPA_ROOT = resolveSpaRoot();
console.log('[prepare-spa] HELIOS → web/public');
console.log(`[prepare-spa] SPA root: ${SPA_ROOT || '(MISSING)'}`);

if (!SPA_ROOT) {
  console.error(`
[prepare-spa] ERROR: cannot find HELIOS SPA sources.
  Expected one of:
    - monorepo parent with js/main.js (../js)
    - web/spa-source/js/main.js
    - HELIOS_SPA_ROOT env pointing at HELIOS repo root
`);
  process.exit(1);
}

ensureDir(PUBLIC);

for (const name of ['js', 'css', 'assets']) {
  const src = join(SPA_ROOT, name);
  const dest = join(PUBLIC, name);
  if (!existsSync(src)) {
    console.warn(`[prepare-spa] skip missing ${name}/`);
    continue;
  }
  copyDir(src, dest);
  const n = existsSync(dest) ? 'ok' : 'FAIL';
  console.log(`  copied ${name}/ → public/${name}/  [${n}]`);
}

// Never ship SPICE kernels in the static SPA surface (bake scripts only).
const kernelsDest = join(PUBLIC, 'assets', 'kernels');
if (existsSync(kernelsDest)) {
  rmSync(kernelsDest, { recursive: true, force: true });
  console.log('  stripped public/assets/kernels/ (not served)');
}

const indexPath = join(SPA_ROOT, 'index.html');
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  writeFileSync(join(PUBLIC, 'spa.html'), html, 'utf8');
  // Classic Hosting serves web/public as document root — needs index.html
  writeFileSync(join(PUBLIC, 'index.html'), html, 'utf8');
  console.log('  wrote public/spa.html + public/index.html');

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    let body = bodyMatch[1];
    body = body
      .replace(/<script type="importmap">[\s\S]*?<\/script>/gi, '')
      .replace(/<script type="module"[^>]*src=["'][^"']*js\/main\.js["'][^>]*><\/script>/gi, '');
    writeFileSync(join(PUBLIC, 'helios-body.html'), body, 'utf8');
    console.log('  wrote public/helios-body.html');
  }

  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    writeFileSync(join(PUBLIC, 'helios-base.css'), styleMatch[1], 'utf8');
    console.log('  wrote public/helios-base.css');
  }
}

// Minimal favicon (1x1 PNG) so /favicon.ico is not 404
const faviconPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
writeFileSync(join(PUBLIC, 'favicon.ico'), faviconPng);

// Required-file gate (fail cloud build if public SPA incomplete)
const required = [
  'js/main.js',
  'css/app.css',
  'index.html',
  'helios-base.css',
  'helios-body.html',
  'assets/ephemeris-samples-v1.json',
  'assets/ephemeris-moons-v1.json',
  // Dense SPICE packs (optional but preferred for App Hosting API proxy)
  // Checked softly — missing Tier B packs should not fail prepare
];
let missing = 0;
for (const rel of required) {
  const p = join(PUBLIC, rel);
  if (!existsSync(p) || statSync(p).size < 10) {
    console.error(`[prepare-spa] REQUIRED MISSING: public/${rel}`);
    missing++;
  }
}
if (missing) {
  process.exit(1);
}

// Soft: dense SPICE packs for App Hosting /api/ephemeris/dense-spk proxy
const denseReg = join(PUBLIC, 'assets/dense-spk/registry.json');
if (existsSync(denseReg)) {
  console.log('  dense-spk registry present (Tier A/B packs available to API)');
} else {
  console.warn('  [prepare-spa] soft: assets/dense-spk/registry.json missing — API proxy limited');
}

// Build + dense pack version stamp (industrial release identity)
let gitSha = process.env.GITHUB_SHA || process.env.COMMIT_SHA || null;
if (!gitSha) {
  try {
    const g = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: SPA_ROOT, encoding: 'utf8',
    });
    if (g.status === 0) gitSha = String(g.stdout || '').trim() || null;
  } catch { /* */ }
}
let pkgVersion = null;
try {
  const pkg = JSON.parse(readFileSync(join(SPA_ROOT, 'package.json'), 'utf8'));
  pkgVersion = pkg.version || null;
} catch { /* */ }

let denseRegistryVersion = null;
let densePackCount = 0;
let densePackIds = [];
if (existsSync(denseReg)) {
  try {
    const reg = JSON.parse(readFileSync(denseReg, 'utf8'));
    denseRegistryVersion = reg.version ?? 1;
    densePackCount = Array.isArray(reg.packs) ? reg.packs.length : 0;
    densePackIds = (reg.packs || []).map((p) => p.pack_id).filter(Boolean);
  } catch { /* */ }
}

let mainHash = null;
try {
  const mainJs = readFileSync(join(PUBLIC, 'js/main.js'));
  mainHash = createHash('sha256').update(mainJs).digest('hex').slice(0, 12);
} catch { /* */ }

const buildMeta = {
  prepared_at: new Date().toISOString(),
  spa_root: SPA_ROOT,
  product: 'HELIOS Mission Design',
  host: 'firebase-app-hosting',
  class: 'preliminary-not-flight-certified',
  product_grade: 'industrial-preliminary',
  git_sha: gitSha,
  package_version: pkgVersion,
  spa_main_sha256_12: mainHash,
  dense_spk: {
    registry_version: denseRegistryVersion,
    pack_count: densePackCount,
    pack_ids: densePackIds,
  },
  primary_url: 'https://helios--k-solar-system-navigator.us-central1.hosted.app',
  fallback_hosting_url: 'https://k-solar-system-navigator.web.app',
};
writeFileSync(join(PUBLIC, 'helios-build.json'), JSON.stringify(buildMeta, null, 2), 'utf8');
console.log(`  helios-build.json sha=${gitSha || 'n/a'} packs=${densePackCount} main=${mainHash || 'n/a'}`);

console.log('[prepare-spa] done — required assets verified');
