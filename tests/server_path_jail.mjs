// Verifies the local-dev static server path jail and basic happy paths.

import http from 'http';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const { createServer, resolveSafePath } = await import(
  pathToFileURL(resolve(ROOT, 'server.js')).href
);

let passed = 0, failed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n━━━ SERVER PATH JAIL ━━━');

// Unit: resolveSafePath
check('root maps to index.html',
  resolveSafePath('/')?.endsWith('index.html'));
check('js/main.js under root',
  resolveSafePath('/js/main.js')?.includes('js') && resolveSafePath('/js/main.js')?.endsWith('main.js'));
check('traversal ../package.json rejected',
  resolveSafePath('/../package.json') === null);
check('traversal encoded rejected',
  resolveSafePath('/%2e%2e/package.json') === null);
check('null byte rejected',
  resolveSafePath('/js/main.js%00.txt') === null || resolveSafePath('/js/\0main.js') === null);

// Integration: real HTTP
const server = createServer();
await new Promise((res) => server.listen(0, res));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

function get(reqPath) {
  // Use raw ClientRequest so the path is not normalized by WHATWG URL parsing
  // (which collapses ".." before the request is sent).
  return new Promise((resolveP, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method: 'GET',
    }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolveP({ status: r.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const root = await get('/');
check('GET / → 200', root.status === 200);

const main = await get('/js/main.js');
check('GET /js/main.js → 200', main.status === 200);

// Browsers/http.get normalize unencoded ".." — use percent-encoding to exercise the jail.
const trav = await get('/%2e%2e/package.json');
check('GET /%2e%2e/package.json → 404', trav.status === 404);

const trav2 = await get('/js/%2e%2e/%2e%2e/package.json');
check('GET /js/%2e%2e/%2e%2e/package.json → 404', trav2.status === 404);

// Legitimately serve root package.json is OK for local-dev; ensure jail doesn't block in-root files.
const pkg = await get('/package.json');
check('GET /package.json → 200 (in-root allowed)', pkg.status === 200);

const missing = await get('/no-such-file-xyz.js');
check('GET missing → 404', missing.status === 404);

server.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
