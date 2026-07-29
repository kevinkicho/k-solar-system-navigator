/**
 * Copy HELIOS SPA assets from repo root into web/public for Next.js App Hosting.
 * Run automatically on next build / next dev.
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(__dirname, '..');
const ROOT = resolve(WEB, '..');
const PUBLIC = join(WEB, 'public');

const COPIES = [
  ['js', 'js'],
  ['css', 'css'],
  ['assets', 'assets'],
];

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

console.log('[prepare-spa] HELIOS → web/public');

ensureDir(PUBLIC);

for (const [from, to] of COPIES) {
  const src = join(ROOT, from);
  const dest = join(PUBLIC, to);
  if (!existsSync(src)) {
    console.warn(`[prepare-spa] skip missing ${from}`);
    continue;
  }
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  cpSync(src, dest, { recursive: true });
  console.log(`  copied ${from}/ → public/${to}/`);
}

// Extract body + critical head styles from index.html for SSR injection meta
const indexPath = join(ROOT, 'index.html');
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  // Full static fallback entry (classic SPA) for deep-link / offline-style load
  writeFileSync(join(PUBLIC, 'spa.html'), html, 'utf8');
  console.log('  wrote public/spa.html (static SPA fallback)');

  // Body-only fragment for SSR shell (between <body> and scripts)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    let body = bodyMatch[1];
    // Strip importmap + main module — Next injects them
    body = body
      .replace(/<script type="importmap">[\s\S]*?<\/script>/gi, '')
      .replace(/<script type="module"[^>]*src=["']\.\/js\/main\.js["'][^>]*><\/script>/gi, '')
      .replace(/<script type="module" src="\.\/js\/main\.js"><\/script>/gi, '');
    writeFileSync(join(PUBLIC, 'helios-body.html'), body, 'utf8');
    console.log('  wrote public/helios-body.html');
  }

  // Inline <style> block from head (base chrome tokens)
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    writeFileSync(join(PUBLIC, 'helios-base.css'), styleMatch[1], 'utf8');
    console.log('  wrote public/helios-base.css');
  }
}

// Marker for deploy diagnostics
writeFileSync(
  join(PUBLIC, 'helios-build.json'),
  JSON.stringify({
    prepared_at: new Date().toISOString(),
    product: 'HELIOS Mission Design',
    host: 'firebase-app-hosting',
    class: 'preliminary-not-flight-certified',
  }, null, 2),
  'utf8',
);

console.log('[prepare-spa] done');
