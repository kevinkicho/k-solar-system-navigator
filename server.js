// Local-dev server (ESM): static files + Ollama chat proxy + agent C2 bus.
// API key stays server-side (loaded from .env). Prefer static hosting for
// production static assets; chat/C2 require this Node process.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID, timingSafeEqual } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname);

const OLLAMA_CHAT_URL = 'https://ollama.com/api/chat';
const DEFAULT_MODEL = 'gemma4:31b-cloud';
const MAX_BODY = 2 * 1024 * 1024; // 2 MiB
const COMMAND_TTL_MS = 5 * 60 * 1000;
const RESULT_TTL_MS = 10 * 60 * 1000;
const LEASE_TTL_MS = 60 * 1000;
const ONBOARD_STALE_MS = 15_000;
const CHAT_RATE_LIMIT = 30;
const CHAT_RATE_WINDOW_MS = 60_000;
const MAX_MESSAGES = 40;
const MAX_MSG_CHARS = 200_000;
const DEFAULT_C2_MAX_QUEUE = 64;

/** Canonical C2 actions + aliases (aliases allowlist/executor only). */
export const C2_ALIASES = { get_state: 'get_mission_state' };
export const C2_ACTIONS = new Set([
  'get_mission_state',
  'get_state',
  'list_bodies',
  'set_route',
  'compute_route',
  'clear_route',
  'set_vehicle',
  'set_departure',
  'notify',
]);

function c2MaxQueue() {
  const n = Number(process.env.HELIOS_C2_MAX_QUEUE);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_C2_MAX_QUEUE;
}

/** Load KEY=VAL lines from .env into process.env (does not override existing). */
export function loadEnvFile(filePath = path.join(ROOT, '.env')) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
    return true;
  } catch {
    return false;
  }
}

loadEnvFile();

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function resolveSafePath(urlPath) {
  let raw = urlPath.split('?')[0].split('#')[0];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (raw.includes('\0')) return null;
  if (raw === '/' || raw === '') return path.join(ROOT, 'index.html');

  const rel = raw.replace(/^\/+/, '');
  const candidate = path.resolve(ROOT, rel);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (candidate !== ROOT && !candidate.startsWith(rootWithSep)) {
    return null;
  }
  return candidate;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** Apply CORS — never `*` when token configured; include Authorization when enabled. */
export function applyCors(req, res) {
  const tokenOn = Boolean(process.env.HELIOS_API_TOKEN);
  const allow = process.env.HELIOS_CORS_ORIGIN || '';
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', allow);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-HELIOS-Token',
    );
    res.setHeader('Vary', 'Origin');
  } else if (!tokenOn) {
    // Same-origin default: no CORS headers (browser FAB is same-origin).
    // Legacy open CORS only when no token — still not `*` for credentialed safety;
    // omit for same-origin. Cross-port without HELIOS_CORS_ORIGIN is unsupported.
  }
}

function tokensEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function extractClientToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const x = req.headers['x-helios-token'];
  if (typeof x === 'string' && x.trim()) return x.trim();
  return '';
}

/**
 * T0: loopback Host + no token env → open.
 * T1/T2: token set (or non-loopback) → require Bearer / X-HELIOS-Token.
 * Returns null if ok, or { status, error }.
 */
export function assertAuth(req) {
  const configured = process.env.HELIOS_API_TOKEN || '';
  const hostOk = isLoopbackHostHeader(req.headers.host);
  if (!configured) {
    // T0 only if request Host is loopback; otherwise refuse (no token to enforce).
    if (!hostOk) {
      return {
        status: 403,
        error: 'Non-loopback Host requires HELIOS_API_TOKEN on server and client',
      };
    }
    return null;
  }
  const provided = extractClientToken(req);
  if (!provided || !tokensEqual(provided, configured)) {
    return { status: 401, error: 'Unauthorized — provide Authorization: Bearer <HELIOS_API_TOKEN>' };
  }
  return null;
}

// Chat rate limit (sliding window per IP)
const chatBuckets = new Map(); // ip → number[]

export function rateLimitChat(req) {
  if (process.env.NODE_ENV === 'test' || process.env.HELIOS_DISABLE_RATE_LIMIT === '1') {
    return { ok: true };
  }
  const ip = req.socket?.remoteAddress || 'local';
  const now = Date.now();
  let arr = chatBuckets.get(ip) || [];
  arr = arr.filter((t) => now - t < CHAT_RATE_WINDOW_MS);
  if (arr.length >= CHAT_RATE_LIMIT) {
    const retryAfterMs = CHAT_RATE_WINDOW_MS - (now - arr[0]);
    return { ok: false, retryAfterMs: Math.max(1000, retryAfterMs) };
  }
  arr.push(now);
  chatBuckets.set(ip, arr);
  return { ok: true };
}

// ── Agent C2 bus (in-memory) ──────────────────────────────────────────
const pendingCommands = []; // { id, action, args, createdAt, source, lease?, leaseUntil?, leaseToken? }
const inFlight = new Map(); // id → command
const results = new Map(); // id → { id, ok, result, error, finishedAt, leaseToken? }
let browserState = {
  updatedAt: null,
  onboard: false,
  snapshot: null,
};

function effectiveOnboard() {
  if (!browserState.updatedAt) return false;
  if (Date.now() - browserState.updatedAt > ONBOARD_STALE_MS) return false;
  return browserState.onboard;
}

function pruneC2() {
  const now = Date.now();
  while (pendingCommands.length && now - pendingCommands[0].createdAt > COMMAND_TTL_MS) {
    const stale = pendingCommands.shift();
    if (!results.has(stale.id)) {
      results.set(stale.id, {
        id: stale.id,
        ok: false,
        error: 'expired before onboard agent executed',
        finishedAt: now,
      });
    }
  }
  // Requeue expired leases
  for (const [id, cmd] of inFlight) {
    if (cmd.leaseUntil && now > cmd.leaseUntil) {
      inFlight.delete(id);
      delete cmd.leaseToken;
      delete cmd.leaseUntil;
      delete cmd.agentId;
      pendingCommands.push(cmd);
    }
  }
  for (const [id, r] of results) {
    if (now - r.finishedAt > RESULT_TTL_MS) results.delete(id);
  }
}

export function normalizeC2Action(action) {
  if (!action || typeof action !== 'string') return null;
  const a = action.trim();
  if (C2_ALIASES[a]) return C2_ALIASES[a];
  if (C2_ACTIONS.has(a)) return a;
  return null;
}

function defaultModel() {
  return process.env.OLLAMA_MODEL || DEFAULT_MODEL;
}

function buildOllamaChatPayload(body, { stream }) {
  const payload = {
    model: body.model || defaultModel(),
    messages: body.messages || [],
    stream: !!stream,
  };
  if (body.tools) payload.tools = body.tools;
  if (body.options) payload.options = body.options;
  if (body.format !== undefined) payload.format = body.format;
  if (body.think !== undefined) payload.think = body.think;
  if (body.keep_alive !== undefined) payload.keep_alive = body.keep_alive;
  return payload;
}

function requireOllamaKey() {
  const key = process.env.OLLAMA_API_KEY;
  if (!key) {
    const err = new Error(
      'OLLAMA_API_KEY not set. Add it to .env (see .env.example) or export it.',
    );
    err.statusCode = 503;
    throw err;
  }
  return key;
}

async function proxyOllamaChat(body) {
  const key = requireOllamaKey();
  const payload = buildOllamaChatPayload(body, { stream: false });

  const upstream = await fetch(OLLAMA_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!upstream.ok) {
    const err = new Error(
      (data && (data.error || data.message)) || `Ollama HTTP ${upstream.status}`,
    );
    err.statusCode = upstream.status;
    err.payload = data;
    throw err;
  }
  return data;
}

/**
 * Stream Ollama NDJSON chat response through the Node response (SSE-friendly NDJSON).
 * @returns {Promise<void>}
 */
async function proxyOllamaChatStream(body, res) {
  const key = requireOllamaKey();
  const payload = buildOllamaChatPayload(body, { stream: true });

  const upstream = await fetch(OLLAMA_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
    sendJson(res, upstream.status, {
      error: data.error || data.message || `Ollama HTTP ${upstream.status}`,
    });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Helios-Stream': '1',
  });

  if (!upstream.body) {
    res.end();
    return;
  }

  // Node 18+ fetch body is a web ReadableStream
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
  } catch (e) {
    try {
      res.write(`${JSON.stringify({ error: e.message || 'stream error', done: true })}\n`);
    } catch {
      /* */
    }
  } finally {
    res.end();
  }
}

function requireAuth(req, res) {
  const denied = assertAuth(req);
  if (denied) {
    sendJson(res, denied.status, { error: denied.error });
    return false;
  }
  return true;
}

async function handleApi(req, res, pathname) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Health (no secrets; no auth)
  if (pathname === '/api/health' && req.method === 'GET') {
    const ageMs = browserState.updatedAt ? Date.now() - browserState.updatedAt : null;
    sendJson(res, 200, {
      ok: true,
      service: 'helios',
      model: defaultModel(),
      ollamaConfigured: Boolean(process.env.OLLAMA_API_KEY),
      tokenConfigured: Boolean(process.env.HELIOS_API_TOKEN),
      agent: {
        pending: pendingCommands.length,
        inFlight: inFlight.size,
        onboard: effectiveOnboard(),
        stateAgeMs: ageMs,
      },
    });
    return true;
  }

  // All other /api/* require auth per T0/T1/T2
  if (!requireAuth(req, res)) return true;

  // Chat proxy → Ollama Cloud
  if (pathname === '/api/chat' && req.method === 'POST') {
    const rl = rateLimitChat(req);
    if (!rl.ok) {
      res.setHeader('Retry-After', String(Math.ceil(rl.retryAfterMs / 1000)));
      sendJson(res, 429, { error: 'rate limit exceeded', retryAfterMs: rl.retryAfterMs });
      return true;
    }
    try {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        sendJson(res, 400, { error: 'messages[] required' });
        return true;
      }
      if (body.messages.length > MAX_MESSAGES) {
        sendJson(res, 400, { error: `messages max ${MAX_MESSAGES}` });
        return true;
      }
      let chars = 0;
      for (const m of body.messages) {
        chars += String(m?.content || '').length;
      }
      if (chars > MAX_MSG_CHARS) {
        sendJson(res, 400, { error: 'messages content too large' });
        return true;
      }
      // Only allow configured default model
      if (body.model && body.model !== defaultModel()) {
        body.model = defaultModel();
      }
      // Streaming NDJSON when client requests stream:true (tools stay non-stream)
      if (body.stream === true && !body.tools) {
        await proxyOllamaChatStream(body, res);
        return true;
      }
      body.stream = false;
      const data = await proxyOllamaChat(body);
      sendJson(res, 200, data);
    } catch (e) {
      if (!res.headersSent) {
        sendJson(res, e.statusCode || 502, {
          error: e.message || 'chat failed',
        });
      }
    }
    return true;
  }

  // ── Agent C2 ──────────────────────────────────────────────────────
  pruneC2();

  if (pathname === '/api/agent/command' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const action = normalizeC2Action(body.action);
      if (!action) {
        sendJson(res, 400, {
          error: 'unknown or missing action',
          allowed: [...C2_ACTIONS],
        });
        return true;
      }
      if (pendingCommands.length + inFlight.size >= c2MaxQueue()) {
        sendJson(res, 503, { error: 'C2 queue full' });
        return true;
      }
      const id = body.id || randomUUID();
      const leaseToken = randomUUID();
      const cmd = {
        id,
        action,
        args: body.args && typeof body.args === 'object' ? body.args : {},
        createdAt: Date.now(),
        source: body.source || 'cli',
        resultToken: leaseToken, // capability to post result
      };
      pendingCommands.push(cmd);
      sendJson(res, 202, { id, status: 'queued', action: cmd.action });
    } catch (e) {
      sendJson(res, e.statusCode || 400, { error: e.message });
    }
    return true;
  }

  // Claim/lease — preferred onboard path
  if (pathname === '/api/agent/claim' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const agentId = body.agentId || 'onboard';
      const limit = Math.min(32, Math.max(1, Number(body.limit) || 8));
      const batch = [];
      while (batch.length < limit && pendingCommands.length) {
        const cmd = pendingCommands.shift();
        const leaseToken = cmd.resultToken || randomUUID();
        cmd.leaseToken = leaseToken;
        cmd.leaseUntil = Date.now() + LEASE_TTL_MS;
        cmd.agentId = agentId;
        inFlight.set(cmd.id, cmd);
        batch.push({
          id: cmd.id,
          action: cmd.action,
          args: cmd.args,
          leaseToken,
          createdAt: cmd.createdAt,
        });
      }
      sendJson(res, 200, { commands: batch });
    } catch (e) {
      sendJson(res, e.statusCode || 400, { error: e.message });
    }
    return true;
  }

  // Legacy drain — disabled by default; enable with HELIOS_C2_LEGACY_DRAIN=1
  if (pathname === '/api/agent/commands' && req.method === 'GET') {
    if (process.env.HELIOS_C2_LEGACY_DRAIN !== '1') {
      sendJson(res, 410, {
        error: 'legacy drain disabled; use POST /api/agent/claim',
      });
      return true;
    }
    const batch = pendingCommands.splice(0, 32).map((cmd) => {
      const leaseToken = cmd.resultToken || randomUUID();
      cmd.leaseToken = leaseToken;
      cmd.leaseUntil = Date.now() + LEASE_TTL_MS;
      inFlight.set(cmd.id, cmd);
      return {
        id: cmd.id,
        action: cmd.action,
        args: cmd.args,
        leaseToken,
        createdAt: cmd.createdAt,
      };
    });
    sendJson(res, 200, { commands: batch });
    return true;
  }

  if (pathname === '/api/agent/result' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (!body.id) {
        sendJson(res, 400, { error: 'id required' });
        return true;
      }
      const inflight = inFlight.get(body.id);
      const pending = pendingCommands.find((c) => c.id === body.id);
      const expected =
        inflight?.leaseToken ||
        inflight?.resultToken ||
        pending?.resultToken ||
        null;
      if (expected) {
        if (!body.leaseToken || !tokensEqual(String(body.leaseToken), String(expected))) {
          sendJson(res, 403, { error: 'invalid or missing leaseToken' });
          return true;
        }
      } else if (inflight || pending) {
        // should not happen without token
        sendJson(res, 403, { error: 'lease required' });
        return true;
      } else if (!results.has(body.id) && !inflight) {
        // unknown id after completion already recorded is ok; reject spoof of unknown
        // Allow completing only if was in flight — unknown without lease rejected
        sendJson(res, 404, { error: 'unknown command id' });
        return true;
      }
      inFlight.delete(body.id);
      results.set(body.id, {
        id: body.id,
        ok: body.ok !== false,
        result: body.result ?? null,
        error: body.error || null,
        finishedAt: Date.now(),
      });
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, e.statusCode || 400, { error: e.message });
    }
    return true;
  }

  if (pathname === '/api/agent/result' && req.method === 'GET') {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    const id = u.searchParams.get('id');
    if (!id) {
      sendJson(res, 400, { error: 'id query required' });
      return true;
    }
    const r = results.get(id);
    if (!r) {
      const pending =
        pendingCommands.some((c) => c.id === id) || inFlight.has(id);
      sendJson(res, 200, {
        id,
        status: pending ? 'pending' : 'unknown',
      });
      return true;
    }
    sendJson(res, 200, { status: 'done', ...r });
    return true;
  }

  if (pathname === '/api/agent/state' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      browserState = {
        updatedAt: Date.now(),
        onboard: true,
        snapshot: body.snapshot ?? body,
      };
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, e.statusCode || 400, { error: e.message });
    }
    return true;
  }

  if (pathname === '/api/agent/state' && req.method === 'GET') {
    const ageMs = browserState.updatedAt ? Date.now() - browserState.updatedAt : null;
    sendJson(res, 200, {
      onboard: effectiveOnboard(),
      updatedAt: browserState.updatedAt,
      ageMs,
      snapshot: browserState.snapshot,
      pending: pendingCommands.length,
      inFlight: inFlight.size,
    });
    return true;
  }

  if (pathname === '/api/agent/tools' && req.method === 'GET') {
    sendJson(res, 200, {
      model: defaultModel(),
      tools: AGENT_TOOL_DEFS,
    });
    return true;
  }

  return false;
}

/** Tool definitions for agentic CLI / chat (Ollama tools format). */
export const AGENT_TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'get_mission_state',
      description:
        'Read current HELIOS planner state (origin, destination, vehicle, transfer summary). Requires browser onboard agent.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_route',
      description: 'Set origin and/or destination body by name (e.g. Earth, Mars).',
      parameters: {
        type: 'object',
        properties: {
          origin: { type: 'string', description: 'Origin body name' },
          destination: { type: 'string', description: 'Destination body name' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compute_route',
      description: 'Run Lambert / multi-leg solve for the current route.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_route',
      description: 'Clear origin, destination, flybys, and transfer.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_vehicle',
      description: 'Set vehicle id: sh-starship, falcon9, fh-class, abstract, chem-medium, etc.',
      parameters: {
        type: 'object',
        properties: {
          vehicleId: { type: 'string' },
          cargoMass_kg: { type: 'number' },
          starshipArch: {
            type: 'string',
            enum: ['legacy-demo', 'unrefueled', 'tanker-n'],
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_departure',
      description: 'Set departure date (ISO date or datetime UTC).',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD or ISO datetime' },
        },
        required: ['date'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'notify',
      description: 'Show a toast notification in the HELIOS UI.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
        required: ['message'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_bodies',
      description: 'List major planets / catalog body names available for routing.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];

export function createServer() {
  return http.createServer(async (req, res) => {
    const urlPath = req.url || '/';
    let pathname = urlPath.split('?')[0];
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    if (pathname.startsWith('/api/')) {
      try {
        const handled = await handleApi(req, res, pathname);
        if (handled) return;
        sendJson(res, 404, { error: 'Unknown API route' });
        return;
      } catch (e) {
        sendJson(res, 500, { error: e.message || 'Internal error' });
        return;
      }
    }

    const filePath = resolveSafePath(urlPath);
    if (!filePath) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

/** True when bind host is loopback-only. */
export function isLoopbackBind(host) {
  const h = String(host || '').toLowerCase();
  return h === '127.0.0.1' || h === '::1' || h === 'localhost';
}

/** True when Host header is loopback. */
export function isLoopbackHostHeader(hostHeader) {
  if (!hostHeader) return false;
  const host = String(hostHeader).split(',')[0].trim().toLowerCase();
  // strip port
  const bare = host.startsWith('[')
    ? host.slice(1, host.indexOf(']'))
    : host.split(':')[0];
  return bare === '127.0.0.1' || bare === '::1' || bare === 'localhost';
}

// Allow importing createServer / resolveSafePath from tests without listening.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const portEnv = process.env.PORT;
  const PORT = portEnv === undefined || portEnv === '' ? 8080 : Number(portEnv);
  const BIND = process.env.HELIOS_BIND || '127.0.0.1';
  if (!isLoopbackBind(BIND) && !process.env.HELIOS_API_TOKEN) {
    console.error(
      'FATAL: non-loopback HELIOS_BIND requires HELIOS_API_TOKEN. ' +
        'Prefer HELIOS_BIND=127.0.0.1 (default). Never expose chat/C2 on a LAN without a token.',
    );
    process.exit(1);
  }
  if (!isLoopbackBind(BIND)) {
    console.warn(
      '⚠ WARNING: HELIOS is binding to non-loopback address. ' +
        'Chat proxy and agent C2 are reachable on the network. Token required.',
    );
  }
  const server = createServer();
  server.listen(PORT, BIND, () => {
    const assigned = server.address().port;
    const keyOk = Boolean(process.env.OLLAMA_API_KEY);
    const tokenOn = Boolean(process.env.HELIOS_API_TOKEN);
    const authTier = !isLoopbackBind(BIND)
      ? 'T2 (exposed bind — token required)'
      : tokenOn
        ? 'T1 (loopback + token — Bearer required)'
        : 'T0 (loopback open — recommended default)';
    console.log(`HELIOS server running at http://${BIND}:${assigned}`);
    console.log(`  bind:  ${BIND}  auth: ${authTier}`);
    console.log(`  chat:  POST /api/chat  model=${defaultModel()}  key=${keyOk ? 'ok' : 'MISSING'}`);
    console.log(`  agent: GET/POST /api/agent/*  (onboard C2)`);
    console.log(`  CLI:   npm run agent -- help`);
    if (isLoopbackBind(BIND) && !tokenOn) {
      console.log('  note:  never expose beyond loopback; set HELIOS_API_TOKEN for shared-lab mode');
    }
  });
}

export { resolveSafePath, ROOT, defaultModel, proxyOllamaChat };
