/**
 * CI hygiene: firebase.json hosting.ignore must block secrets & kernels.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8'));
const ignore = cfg?.hosting?.ignore || [];
const joined = ignore.join('\n');

const required = [
  { re: /firebase-adminsdk|\*firebase-adminsdk/i, label: 'admin SDK JSON' },
  { re: /\.env/, label: '.env patterns' },
  { re: /kernels/, label: 'SPICE kernels path' },
  { re: /node_modules/, label: 'node_modules' },
  { re: /\.pem|\.p12/, label: 'cert/key patterns' },
];

let failed = 0;
for (const r of required) {
  const ok = r.re.test(joined);
  console.log(`  ${ok ? '✓' : '✗'} hosting.ignore covers ${r.label}`);
  if (!ok) failed++;
}

if (cfg?.hosting?.public === '.') {
  console.log('  · note: hosting.public is monorepo root — prefer web/public long-term');
}

if (failed) {
  console.error(`check-hosting-ignore: ${failed} missing pattern(s)`);
  process.exit(1);
}
console.log('check-hosting-ignore: ok');
