// Local-dev server (ESM): static files + Ollama chat proxy + agent C2 bus.
// API key stays server-side (loaded from .env). Prefer static hosting for
// production static assets; chat/C2 require this Node process.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname);

const OLLAMA_CHAT_URL = 'https://ollama.com/api/chat';
const DEFAULT_MODEL = 'gemma4:31b-cloud';
const MAX_BODY = 2 * 1024 * 1024; // 2 MiB
const COMMAND_TTL_MS = 5 * 60 * 1000;
const RESULT_TTL_MS = 10 * 60 * 1000;

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

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Agent C2 bus (in-memory) ──────────────────────────────────────────
const pendingCommands = []; // { id, action, args, createdAt, source }
const results = new Map(); // id → { id, ok, result, error, finishedAt }
let browserState = {
  updatedAt: null,
  onboard: false,
  snapshot: null,
};

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
  for (const [id, r] of results) {
    if (now - r.finishedAt > RESULT_TTL_MS) results.delete(id);
  }
}

function defaultModel() {
  return process.env.OLLAMA_MODEL || DEFAULT_MODEL;
}

async function proxyOllamaChat(body) {
  const key = process.env.OLLAMA_API_KEY;
  if (!key) {
    const err = new Error(
      'OLLAMA_API_KEY not set. Add it to .env (see .env.example) or export it.',
    );
    err.statusCode = 503;
    throw err;
  }

  const payload = {
    model: body.model || defaultModel(),
    messages: body.messages || [],
    stream: body.stream === true,
  };
  if (body.tools) payload.tools = body.tools;
  if (body.options) payload.options = body.options;
  if (body.format !== undefined) payload.format = body.format;
  if (body.think !== undefined) payload.think = body.think;
  if (body.keep_alive !== undefined) payload.keep_alive = body.keep_alive;

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

async function handleApi(req, res, pathname) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Health (no secrets)
  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      service: 'helios',
      model: defaultModel(),
      ollamaConfigured: Boolean(process.env.OLLAMA_API_KEY),
      agent: {
        pending: pendingCommands.length,
        onboard: browserState.onboard,
        stateAgeMs: browserState.updatedAt
          ? Date.now() - browserState.updatedAt
          : null,
      },
    });
    return true;
  }

  // Chat proxy → Ollama Cloud
  if (pathname === '/api/chat' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        sendJson(res, 400, { error: 'messages[] required' });
        return true;
      }
      // Never allow client to force streaming through this non-stream proxy.
      body.stream = false;
      const data = await proxyOllamaChat(body);
      sendJson(res, 200, data);
    } catch (e) {
      sendJson(res, e.statusCode || 502, {
        error: e.message || 'chat failed',
        detail: e.payload || undefined,
      });
    }
    return true;
  }

  // ── Agent C2 ──────────────────────────────────────────────────────
  pruneC2();

  if (pathname === '/api/agent/command' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (!body.action || typeof body.action !== 'string') {
        sendJson(res, 400, { error: 'action required' });
        return true;
      }
      const id = body.id || randomUUID();
      const cmd = {
        id,
        action: body.action,
        args: body.args && typeof body.args === 'object' ? body.args : {},
        createdAt: Date.now(),
        source: body.source || 'cli',
      };
      pendingCommands.push(cmd);
      sendJson(res, 202, { id, status: 'queued', action: cmd.action });
    } catch (e) {
      sendJson(res, e.statusCode || 400, { error: e.message });
    }
    return true;
  }

  if (pathname === '/api/agent/commands' && req.method === 'GET') {
    // Onboard browser polls and drains queue
    const batch = pendingCommands.splice(0, 32);
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
      // Still pending?
      const pending = pendingCommands.some((c) => c.id === id);
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
    sendJson(res, 200, {
      onboard: browserState.onboard,
      updatedAt: browserState.updatedAt,
      ageMs: browserState.updatedAt ? Date.now() - browserState.updatedAt : null,
      snapshot: browserState.snapshot,
      pending: pendingCommands.length,
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

// Allow importing createServer / resolveSafePath from tests without listening.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const portEnv = process.env.PORT;
  const PORT = portEnv === undefined || portEnv === '' ? 8080 : Number(portEnv);
  const server = createServer();
  server.listen(PORT, () => {
    const assigned = server.address().port;
    const keyOk = Boolean(process.env.OLLAMA_API_KEY);
    console.log(`HELIOS server running at http://localhost:${assigned}`);
    console.log(`  chat:  POST /api/chat  model=${defaultModel()}  key=${keyOk ? 'ok' : 'MISSING'}`);
    console.log(`  agent: GET/POST /api/agent/*  (onboard C2)`);
    console.log(`  CLI:   npm run agent -- help`);
  });
}

export { resolveSafePath, ROOT, defaultModel, proxyOllamaChat };
