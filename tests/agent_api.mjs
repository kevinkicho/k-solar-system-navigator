// Server API: health, chat validation (no live Ollama), agent C2 bus.

import http from 'http';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const { createServer } = await import(
  pathToFileURL(resolve(ROOT, 'server.js')).href
);

let passed = 0, failed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

function request(port, method, reqPath, body) {
  return new Promise((resolveP, reject) => {
    const payload = body != null ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {},
    }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch { /* */ }
        resolveP({ status: r.statusCode, raw, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

console.log('\n━━━ AGENT / CHAT API ━━━');

const server = createServer();
await new Promise((res) => server.listen(0, res));
const port = server.address().port;

const health = await request(port, 'GET', '/api/health');
check('GET /api/health → 200', health.status === 200);
check('health.ok', health.json?.ok === true);
check('health has model', typeof health.json?.model === 'string');
check('health has ollamaConfigured bool', typeof health.json?.ollamaConfigured === 'boolean');

const badChat = await request(port, 'POST', '/api/chat', { messages: [] });
check('POST /api/chat empty messages → 400', badChat.status === 400);

// Force missing-key path without depending on whether .env is present.
const savedKey = process.env.OLLAMA_API_KEY;
delete process.env.OLLAMA_API_KEY;
const noKey = await request(port, 'POST', '/api/chat', {
  messages: [{ role: 'user', content: 'hi' }],
});
check('POST /api/chat without key → 503', noKey.status === 503);
if (savedKey !== undefined) process.env.OLLAMA_API_KEY = savedKey;
else delete process.env.OLLAMA_API_KEY;

const tools = await request(port, 'GET', '/api/agent/tools');
check('GET /api/agent/tools → 200', tools.status === 200);
check('tools array present', Array.isArray(tools.json?.tools) && tools.json.tools.length > 0);

const queued = await request(port, 'POST', '/api/agent/command', {
  action: 'notify',
  args: { message: 'test' },
  source: 'test',
});
check('POST /api/agent/command → 202', queued.status === 202);
check('command id returned', typeof queued.json?.id === 'string');

const batch = await request(port, 'GET', '/api/agent/commands');
check('GET /api/agent/commands drains queue', batch.status === 200);
check('commands batch has notify', batch.json?.commands?.some((c) => c.action === 'notify'));

const id = queued.json.id;
await request(port, 'POST', '/api/agent/result', {
  id,
  ok: true,
  result: { notified: true },
});
const done = await request(port, 'GET', `/api/agent/result?id=${id}`);
check('result status done', done.json?.status === 'done' && done.json?.ok === true);

await request(port, 'POST', '/api/agent/state', {
  snapshot: { origin: 'Earth', destination: 'Mars' },
});
const st = await request(port, 'GET', '/api/agent/state');
check('agent state onboard', st.json?.onboard === true);
check('agent snapshot origin', st.json?.snapshot?.origin === 'Earth');

// Static still works
const root = await request(port, 'GET', '/');
check('GET / still 200', root.status === 200);

// Unknown API
const unk = await request(port, 'GET', '/api/nope');
check('unknown /api → 404 json', unk.status === 404 && unk.json?.error);

server.close();

console.log(`\nAgent API: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
