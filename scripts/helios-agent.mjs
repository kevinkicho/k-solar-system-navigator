#!/usr/bin/env node
/**
 * HELIOS agentic CLI — chat with Ollama Cloud and command & control the
 * browser planner via the onboard agent (server C2 bus).
 *
 * Usage:
 *   npm run agent -- help
 *   npm run agent -- chat "Explain Earth–Mars Hohmann Δv"
 *   npm run agent -- agent "Set Earth to Mars and compute the route"
 *   npm run agent -- cmd set_route --origin Earth --destination Mars
 *   npm run agent -- cmd compute_route
 *   npm run agent -- status
 *   npm run agent -- state
 *
 * Requires:
 *   - .env with OLLAMA_API_KEY (gitignored)
 *   - `npm start` + browser open for C2 (onboard agent)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_MODEL = 'gemma4:31b-cloud';
const DEFAULT_BASE = 'http://127.0.0.1:8080';

function loadEnvFile(filePath = path.join(ROOT, '.env')) {
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
  } catch {
    /* optional */
  }
}

loadEnvFile();

const BASE = (process.env.HELIOS_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
const MODEL = process.env.OLLAMA_MODEL || DEFAULT_MODEL;

function usage() {
  console.log(`
HELIOS agentic CLI  (model default: ${MODEL})

Commands:
  help                         Show this help
  status                       Server health + agent bus
  state                        Latest onboard browser snapshot
  chat <text...>               One-shot chat (no tools)
  agent <text...>              Agentic loop with C2 tools
  repl                         Interactive agent REPL
  cmd <action> [--k v...]      Queue a C2 command and wait for result
  tools                        List tool definitions

C2 actions:
  get_mission_state | list_bodies | set_route | compute_route
  clear_route | set_vehicle | set_departure | notify

Examples:
  npm run agent -- chat "What is concept-grade fidelity L1?"
  npm run agent -- agent "Plan Earth to Mars with Starship unrefueled"
  npm run agent -- cmd set_route --origin Earth --destination Mars
  npm run agent -- cmd compute_route
  npm run agent -- cmd notify --message "CLI linked"
`.trim());
}

function heliosHeaders(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  const tok = process.env.HELIOS_API_TOKEN;
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

async function fetchJson(urlPath, opts = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    ...opts,
    headers: {
      ...heliosHeaders(),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status} ${urlPath}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function chatOllama(messages, { tools } = {}) {
  // Prefer server proxy so key stays in one place; fall back to direct cloud.
  const body = { model: MODEL, messages, stream: false };
  if (tools) body.tools = tools;

  try {
    return await fetchJson('/api/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e.status === 503 || e.status === 502 || e.code === 'ECONNREFUSED') {
      // Direct cloud if server missing
      const key = process.env.OLLAMA_API_KEY;
      if (!key) throw e;
      const res = await fetch('https://ollama.com/api/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ollama ${res.status}`);
      return data;
    }
    throw e;
  }
}

async function queueCommand(action, args = {}, { waitMs = 15000 } = {}) {
  const { id } = await fetchJson('/api/agent/command', {
    method: 'POST',
    body: JSON.stringify({ action, args, source: 'cli' }),
  });

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const r = await fetchJson(`/api/agent/result?id=${encodeURIComponent(id)}`);
    if (r.status === 'done') {
      if (!r.ok) throw new Error(r.error || 'command failed');
      return r.result;
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(
    `Timeout waiting for onboard agent (id=${id}). Is the browser open on ${BASE}?`,
  );
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_mission_state',
      description: 'Read current HELIOS planner state from the browser.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_route',
      description: 'Set origin and/or destination body by name.',
      parameters: {
        type: 'object',
        properties: {
          origin: { type: 'string' },
          destination: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compute_route',
      description: 'Compute Lambert / multi-leg transfer for current route.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_route',
      description: 'Clear the current route.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_vehicle',
      description: 'Set vehicle / cargo / Starship architecture.',
      parameters: {
        type: 'object',
        properties: {
          vehicleId: { type: 'string' },
          cargoMass_kg: { type: 'number' },
          starshipArch: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_departure',
      description: 'Set departure date (YYYY-MM-DD or ISO).',
      parameters: {
        type: 'object',
        properties: { date: { type: 'string' } },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_bodies',
      description: 'List available body names.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'notify',
      description: 'Show a toast in the HELIOS UI.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    },
  },
];

async function runTool(name, args) {
  switch (name) {
    case 'get_mission_state':
      return queueCommand('get_mission_state', args);
    case 'set_route':
      return queueCommand('set_route', args);
    case 'compute_route':
      return queueCommand('compute_route', args);
    case 'clear_route':
      return queueCommand('clear_route', args);
    case 'set_vehicle':
      return queueCommand('set_vehicle', args);
    case 'set_departure':
      return queueCommand('set_departure', args);
    case 'list_bodies':
      return queueCommand('list_bodies', args);
    case 'notify':
      return queueCommand('notify', args);
    default:
      return { error: `Unknown tool ${name}` };
  }
}

const AGENT_SYSTEM = `You are the HELIOS agentic co-pilot (CLI). You control the browser planner via tools.

Rules:
- Concept-grade educational planner only — not flight ops.
- Prefer get_mission_state before major changes.
- For route requests: set_route → set_departure (if given) → set_vehicle (if given) → compute_route → report state.
- Keep final answers concise with Δv / margin when available.
- If tools fail because the browser is closed, tell the user to open HELIOS at ${BASE}.`;

async function agentLoop(userText, { maxRounds = 8 } = {}) {
  const messages = [
    { role: 'system', content: AGENT_SYSTEM },
    { role: 'user', content: userText },
  ];

  for (let round = 0; round < maxRounds; round++) {
    const data = await chatOllama(messages, { tools: TOOLS });
    const msg = data.message || {};
    const toolCalls = msg.tool_calls || [];

    if (toolCalls.length) {
      // Keep assistant message with tool_calls for protocol fidelity
      messages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: toolCalls,
      });
      for (const tc of toolCalls) {
        const fn = tc.function || tc;
        const name = fn.name;
        let args = fn.arguments ?? {};
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            args = {};
          }
        }
        process.stderr.write(`  → tool ${name}(${JSON.stringify(args)})\n`);
        let result;
        try {
          result = await runTool(name, args);
          process.stderr.write(`  ← ${JSON.stringify(result).slice(0, 200)}\n`);
        } catch (e) {
          result = { error: e.message };
          process.stderr.write(`  ← error: ${e.message}\n`);
        }
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    const content = msg.content || '(no content)';
    return content;
  }
  return 'Agent stopped: max tool rounds reached.';
}

function parseCmdArgs(argv) {
  // argv after action name: --origin Earth --destination Mars --message "hi"
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-/g, '_');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        const num = Number(next);
        args[key] = Number.isFinite(num) && next.trim() !== '' && !/^0\d/.test(next)
          ? num
          : next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || 'help';

  if (cmd === 'help' || cmd === '-h' || cmd === '--help') {
    usage();
    return;
  }

  if (cmd === 'status') {
    try {
      const h = await fetchJson('/api/health');
      console.log(JSON.stringify(h, null, 2));
    } catch (e) {
      console.error(`Server unreachable at ${BASE}: ${e.message}`);
      console.error('Start with: npm start');
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === 'state') {
    try {
      const s = await fetchJson('/api/agent/state');
      console.log(JSON.stringify(s, null, 2));
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === 'tools') {
    try {
      const t = await fetchJson('/api/agent/tools');
      console.log(JSON.stringify(t, null, 2));
    } catch {
      console.log(JSON.stringify({ model: MODEL, tools: TOOLS }, null, 2));
    }
    return;
  }

  if (cmd === 'chat') {
    const text = argv.slice(1).join(' ').trim();
    if (!text) {
      console.error('Usage: agent chat <message>');
      process.exitCode = 1;
      return;
    }
    const data = await chatOllama([
      {
        role: 'system',
        content:
          'You are HELIOS Assistant for a concept-grade interplanetary trip planner. Be concise and honest about limitations.',
      },
      { role: 'user', content: text },
    ]);
    console.log(data?.message?.content || JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === 'agent') {
    const text = argv.slice(1).join(' ').trim();
    if (!text) {
      console.error('Usage: agent agent <goal text>');
      process.exitCode = 1;
      return;
    }
    const out = await agentLoop(text);
    console.log(out);
    return;
  }

  if (cmd === 'repl') {
    console.log(`HELIOS agent REPL → ${BASE}  model=${MODEL}`);
    console.log('Type a goal; empty line or "exit" to quit.\n');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const ask = () =>
      new Promise((resolve) => rl.question('helios> ', resolve));
    for (;;) {
      const line = (await ask()).trim();
      if (!line || line === 'exit' || line === 'quit') break;
      try {
        const out = await agentLoop(line);
        console.log(out + '\n');
      } catch (e) {
        console.error('Error:', e.message, '\n');
      }
    }
    rl.close();
    return;
  }

  if (cmd === 'cmd') {
    const action = argv[1];
    if (!action) {
      console.error('Usage: agent cmd <action> [--key value ...]');
      process.exitCode = 1;
      return;
    }
    const args = parseCmdArgs(argv.slice(2));
    try {
      const result = await queueCommand(action, args);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    }
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  usage();
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
