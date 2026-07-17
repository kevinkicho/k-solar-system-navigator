// Server API: health, chat validation (no live Ollama), agent C2 bus + auth.

import http from 'http';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Ensure T0 path for most tests (no token)
const savedToken = process.env.HELIOS_API_TOKEN;
delete process.env.HELIOS_API_TOKEN;
process.env.NODE_ENV = 'test';
process.env.HELIOS_DISABLE_RATE_LIMIT = '1';

const { createServer, isLoopbackBind, assertAuth, normalizeC2Action } = await import(
  pathToFileURL(resolve(ROOT, 'server.js')).href
);

let passed = 0, failed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

function request(port, method, reqPath, body, headers = {}) {
  return new Promise((resolveP, reject) => {
    const payload = body != null ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: {
        Host: '127.0.0.1',
        ...(payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {}),
        ...headers,
      },
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

check('isLoopbackBind 127.0.0.1', isLoopbackBind('127.0.0.1'));
check('normalizeC2Action alias get_state', normalizeC2Action('get_state') === 'get_mission_state');
check('normalizeC2Action rejects evil', normalizeC2Action('rm_rf') === null);

const server = createServer();
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const port = server.address().port;
check('listen host is loopback', server.address().address === '127.0.0.1');

const health = await request(port, 'GET', '/api/health');
check('GET /api/health → 200', health.status === 200);
check('health.ok', health.json?.ok === true);
check('health has model', typeof health.json?.model === 'string');
check('health has ollamaConfigured bool', typeof health.json?.ollamaConfigured === 'boolean');
check('health.tokenConfigured false', health.json?.tokenConfigured === false);

const badChat = await request(port, 'POST', '/api/chat', { messages: [] });
check('POST /api/chat empty messages → 400', badChat.status === 400);

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

const badAct = await request(port, 'POST', '/api/agent/command', {
  action: 'delete_everything',
  args: {},
});
check('unknown action → 400', badAct.status === 400);

const queued = await request(port, 'POST', '/api/agent/command', {
  action: 'notify',
  args: { message: 'test' },
  source: 'test',
});
check('POST /api/agent/command → 202', queued.status === 202);
check('command id returned', typeof queued.json?.id === 'string');

const legacy = await request(port, 'GET', '/api/agent/commands');
check('legacy drain disabled → 410', legacy.status === 410);

const claim = await request(port, 'POST', '/api/agent/claim', {
  agentId: 'test',
  limit: 8,
});
check('POST /api/agent/claim → 200', claim.status === 200);
check('claim has notify', claim.json?.commands?.some((c) => c.action === 'notify'));
const claimed = claim.json.commands[0];
check('claim has leaseToken', typeof claimed?.leaseToken === 'string');

const spoof = await request(port, 'POST', '/api/agent/result', {
  id: claimed.id,
  ok: true,
  result: { hacked: true },
  leaseToken: 'wrong',
});
check('spoof result → 403', spoof.status === 403);

await request(port, 'POST', '/api/agent/result', {
  id: claimed.id,
  ok: true,
  result: { notified: true },
  leaseToken: claimed.leaseToken,
});
const done = await request(port, 'GET', `/api/agent/result?id=${claimed.id}`);
check('result status done', done.json?.status === 'done' && done.json?.ok === true);

await request(port, 'POST', '/api/agent/state', {
  snapshot: { origin: 'Earth', destination: 'Mars' },
});
const st = await request(port, 'GET', '/api/agent/state');
check('agent state onboard', st.json?.onboard === true);
check('agent snapshot origin', st.json?.snapshot?.origin === 'Earth');

const root = await request(port, 'GET', '/');
check('GET / still 200', root.status === 200);

const unk = await request(port, 'GET', '/api/nope');
check('unknown /api → 404 json', unk.status === 404 && unk.json?.error);

// T1: token required
process.env.HELIOS_API_TOKEN = 'test-secret-token';
const noAuth = await request(port, 'POST', '/api/agent/command', {
  action: 'notify',
  args: { message: 'x' },
});
check('T1 without token → 401', noAuth.status === 401);

const withAuth = await request(port, 'POST', '/api/agent/command', {
  action: 'notify',
  args: { message: 'ok' },
}, { Authorization: 'Bearer test-secret-token' });
check('T1 with Bearer → 202', withAuth.status === 202);

// cleanup token for process
delete process.env.HELIOS_API_TOKEN;
if (savedToken !== undefined) process.env.HELIOS_API_TOKEN = savedToken;

server.close();

console.log(`\nAgent API: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
