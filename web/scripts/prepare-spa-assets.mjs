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
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

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

const indexPath = join(SPA_ROOT, 'index.html');
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  writeFileSync(join(PUBLIC, 'spa.html'), html, 'utf8');
  console.log('  wrote public/spa.html');

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
  'helios-base.css',
  'helios-body.html',
  'assets/ephemeris-samples-v1.json',
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

writeFileSync(
  join(PUBLIC, 'helios-build.json'),
  JSON.stringify({
    prepared_at: new Date().toISOString(),
    spa_root: SPA_ROOT,
    product: 'HELIOS Mission Design',
    host: 'firebase-app-hosting',
    class: 'preliminary-not-flight-certified',
  }, null, 2),
  'utf8',
);

console.log('[prepare-spa] done — required assets verified');
