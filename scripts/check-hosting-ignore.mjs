/**
 * CI hygiene: classic Hosting must serve only the prepared SPA (web/public)
 * and ignore secrets / kernels.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8'));
const hosting = cfg?.hosting || {};
const ignore = hosting.ignore || [];
const joined = ignore.join('\n');
const publicDir = hosting.public || '';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

check('hosting.public is web/public (prepared SPA only)', publicDir === 'web/public', `got=${publicDir}`);

const required = [
  { re: /firebase-adminsdk|\*firebase-adminsdk/i, label: 'admin SDK JSON' },
  { re: /\.env/, label: '.env patterns' },
  { re: /kernels/, label: 'SPICE kernels path' },
  { re: /node_modules/, label: 'node_modules' },
  { re: /\.pem|\.p12/, label: 'cert/key patterns' },
];
for (const r of required) {
  check(`hosting.ignore covers ${r.label}`, r.re.test(joined));
}

// After prepare, web/public must not ship kernels
const kernels = resolve(root, 'web/public/assets/kernels');
if (existsSync(kernels)) {
  check('web/public has no kernels/ tree (run web:prepare)', false, 'kernels present — strip on prepare');
} else {
  check('web/public has no kernels/ tree', true);
}

if (failed) {
  console.error(`check-hosting-ignore: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('check-hosting-ignore: ok');
