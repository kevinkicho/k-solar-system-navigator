// Prebake HYG catalog to a compact mag≤7.5 JSON for faster cold load.
// Usage: node scripts/build-stars.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const src = path.join(ROOT, 'hyg_v42.csv');
const outDir = path.join(ROOT, 'assets');
const out = path.join(outDir, 'stars-mag75.json');

if (!fs.existsSync(src)) {
  console.error('Missing hyg_v42.csv');
  process.exit(1);
}

const text = fs.readFileSync(src, 'utf8');
const lines = text.split(/\r?\n/);
const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
const iX = header.indexOf('x');
const iY = header.indexOf('y');
const iZ = header.indexOf('z');
const iMag = header.indexOf('mag');
const iCI = header.indexOf('ci');

const stars = [];
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  // HYG numeric fields have no embedded commas — plain split is correct and fast.
  const cols = lines[i].split(',');
  if (cols.length <= Math.max(iX, iY, iZ, iMag)) continue;
  const clean = col => (col || '').replace(/^"|"$/g, '').trim();
  const x = parseFloat(clean(cols[iX]));
  const y = parseFloat(clean(cols[iY]));
  const z = parseFloat(clean(cols[iZ]));
  const mag = parseFloat(clean(cols[iMag]));
  const ci = parseFloat(clean(cols[iCI]));
  if (isNaN(x) || isNaN(y) || isNaN(z) || isNaN(mag)) continue;
  if (mag > 7.5) continue;
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 0.001) continue;
  stars.push([
    +x.toFixed(5), +y.toFixed(5), +z.toFixed(5),
    +mag.toFixed(2),
    isNaN(ci) ? 0.65 : +ci.toFixed(3),
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
const payload = { magLimit: 7.5, count: stars.length, stars };
fs.writeFileSync(out, JSON.stringify(payload));
const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`Wrote ${stars.length} stars → ${out} (${kb} KB)`);
