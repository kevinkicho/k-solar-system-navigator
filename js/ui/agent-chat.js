/**
 * Floating action button + chat panel for HELIOS assistant (Ollama Cloud).
 * Calls local /api/chat proxy — API key never leaves the server.
 * Default model: gemma4:31b-cloud
 */

import { startOnboardAgent, snapshotState, executeCommand } from '../agent/onboard.js';
import {
  heliosFetch,
  getStoredHeliosToken,
  setStoredHeliosToken,
  clearStoredHeliosToken,
} from '../agent/api-auth.js';
import {
  AGENT_SYSTEM_WITH_TOOLS,
  runToolAgentLoop,
} from '../agent/tools.js';

const DEFAULT_MODEL = 'gemma4:31b-cloud';
const SYSTEM_PROMPT = `You are HELIOS Assistant — co-pilot for the HELIOS Solar System Navigator, a browser interplanetary trip planner.

Scope and honesty:
- Concept-grade educational tool, NOT flight operations, NOT SPICE navigation, NOT SpaceX-certified.
- Physics: JPL Approximate Positions (L1) by default, Lambert transfers, Need/Capability/Margin vehicle triad.
- If asked for operational flight design, say so clearly and stay educational.

You can explain routes, Δv, porkchops, vehicles (Falcon 9 / Starship arches), fidelity badges, and plan quality gates.
When the user wants the UI changed (set Earth→Mars, compute route), enable **Tools** in settings or use the CLI agent.

Keep answers concise, technical when needed, and label uncertainties.`;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function injectStyles() {
  if (document.getElementById('helios-agent-chat-styles')) return;
  const style = document.createElement('style');
  style.id = 'helios-agent-chat-styles';
  style.textContent = `
#helios-fab {
  position: fixed; right: 20px; bottom: 20px; z-index: 40;
  width: 56px; height: 56px; border-radius: 50%;
  border: 1px solid var(--border-bright, rgba(0,200,255,0.45));
  background: linear-gradient(145deg, rgba(0,40,70,0.95), rgba(0,20,40,0.98));
  color: var(--cyan, #00d4ff); cursor: pointer;
  font-family: var(--font-display, Orbitron, monospace);
  font-size: 11px; font-weight: 700; letter-spacing: 1px;
  box-shadow: 0 0 24px rgba(0,212,255,0.25), 0 8px 24px rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
}
#helios-fab:hover {
  transform: scale(1.06);
  box-shadow: 0 0 32px rgba(0,212,255,0.4), 0 8px 28px rgba(0,0,0,0.55);
}
#helios-fab[aria-expanded="true"] {
  border-color: var(--amber, #ff9800);
  color: var(--amber, #ff9800);
}
#helios-chat-panel {
  position: fixed; right: 20px; bottom: 88px; z-index: 40;
  width: min(380px, calc(100vw - 24px));
  height: min(520px, calc(100vh - 120px));
  display: none; flex-direction: column;
  background: var(--bg-panel, rgba(6,14,28,0.96));
  border: 1px solid var(--border, rgba(0,160,220,0.2));
  border-radius: 10px;
  box-shadow: 0 12px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,212,255,0.08);
  overflow: hidden;
  backdrop-filter: blur(10px);
}
#helios-chat-panel.open { display: flex; }
#helios-chat-panel .hc-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-bottom: 1px solid var(--border, rgba(0,160,220,0.2));
  background: linear-gradient(180deg, rgba(0,40,70,0.5), transparent);
}
#helios-chat-panel .hc-title {
  font-family: var(--font-display, Orbitron, monospace);
  font-size: 11px; letter-spacing: 2px; color: var(--cyan, #00d4ff);
}
#helios-chat-panel .hc-sub {
  font-size: 9px; color: var(--text-dim, #5a7a90); letter-spacing: 0.5px; margin-top: 2px;
}
#helios-chat-panel .hc-close {
  background: transparent; border: 1px solid var(--border); color: var(--text-dim);
  font-family: inherit; font-size: 10px; padding: 4px 8px; border-radius: 4px; cursor: pointer;
}
#helios-chat-panel .hc-close:hover { color: var(--cyan); border-color: var(--cyan-dim); }
#helios-chat-messages {
  flex: 1; overflow-y: auto; padding: 12px;
  display: flex; flex-direction: column; gap: 10px;
  user-select: text;
}
.hc-msg {
  max-width: 92%; padding: 8px 10px; border-radius: 8px;
  font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word;
}
.hc-msg.user {
  align-self: flex-end;
  background: rgba(0,100,140,0.35);
  border: 1px solid rgba(0,180,220,0.3);
  color: var(--text, #b8d4e8);
}
.hc-msg.assistant {
  align-self: flex-start;
  background: rgba(0,0,0,0.35);
  border: 1px solid var(--border);
  color: var(--text, #b8d4e8);
}
.hc-msg.system {
  align-self: center; font-size: 10px; color: var(--text-dim);
  border: none; background: transparent; max-width: 100%; text-align: center;
}
.hc-msg.error {
  align-self: stretch; color: var(--red, #ff2d55);
  border-color: rgba(255,45,85,0.35); background: rgba(80,0,20,0.25);
}
#helios-chat-form {
  display: flex; gap: 6px; padding: 10px;
  border-top: 1px solid var(--border);
  background: rgba(0,0,0,0.25);
}
#helios-chat-input {
  flex: 1; resize: none; min-height: 40px; max-height: 100px;
  background: rgba(0,0,0,0.4); border: 1px solid var(--border);
  color: var(--text); font-family: var(--font-mono, monospace);
  font-size: 12px; padding: 8px; border-radius: 6px; outline: none;
  user-select: text;
}
#helios-chat-input:focus { border-color: var(--cyan-dim, rgba(0,212,255,0.25)); }
#helios-chat-send {
  font-family: var(--font-display, Orbitron, monospace);
  font-size: 10px; letter-spacing: 1px; padding: 0 12px;
  background: rgba(0,80,120,0.5); border: 1px solid var(--border-bright);
  color: var(--cyan); border-radius: 6px; cursor: pointer;
}
#helios-chat-send:disabled { opacity: 0.45; cursor: not-allowed; }
#helios-chat-send:not(:disabled):hover { background: rgba(0,120,160,0.45); }
@media (max-width: 768px) {
  #helios-fab { right: 12px; bottom: 12px; width: 50px; height: 50px; }
  #helios-chat-panel { right: 8px; bottom: 72px; width: calc(100vw - 16px); height: min(60vh, 480px); }
}
@media (prefers-reduced-motion: reduce) {
  #helios-fab { transition: none; }
}
`;
  document.head.appendChild(style);
}

export function wireAgentChat() {
  injectStyles();
  startOnboardAgent();

  const fab = el('button', {
    id: 'helios-fab',
    type: 'button',
    title: 'HELIOS Assistant (Ollama)',
    'aria-label': 'Open HELIOS chat assistant',
    'aria-expanded': 'false',
    'aria-controls': 'helios-chat-panel',
  }, ['AI']);

  const panel = el('div', {
    id: 'helios-chat-panel',
    role: 'dialog',
    'aria-label': 'HELIOS Assistant',
  });

  const messagesEl = el('div', { id: 'helios-chat-messages' });
  const input = el('textarea', {
    id: 'helios-chat-input',
    rows: '2',
    placeholder: 'Ask about transfers, Δv, vehicles…',
    'aria-label': 'Chat message',
  });
  const sendBtn = el('button', {
    id: 'helios-chat-send',
    type: 'submit',
    text: 'SEND',
  });
  const form = el('form', { id: 'helios-chat-form' }, [input, sendBtn]);

  const tokenInput = el('input', {
    type: 'password',
    id: 'helios-token-input',
    placeholder: 'HELIOS_API_TOKEN (shared lab)',
    'aria-label': 'API token',
    style: 'flex:1;background:rgba(0,0,0,0.4);border:1px solid var(--border);color:var(--text);font-size:10px;padding:4px 6px;border-radius:4px',
  });
  if (getStoredHeliosToken()) tokenInput.value = '••••••••';
  const persistCb = el('input', { type: 'checkbox', id: 'helios-token-persist' });
  const toolsCb = el('input', { type: 'checkbox', id: 'helios-tools-enabled' });
  toolsCb.title = 'Allow model to set route / compute via onboard tools (in-process)';
  const saveTok = el('button', {
    type: 'button',
    className: 'hc-close',
    text: 'SAVE',
    onClick: () => {
      const raw = tokenInput.value;
      if (!raw || raw.startsWith('••')) return;
      setStoredHeliosToken(raw, { persist: !!persistCb.checked });
      tokenInput.value = '••••••••';
      appendMsg('system', 'Token saved for this browser (not sent to Ollama — only local server).');
    },
  });
  const clearTok = el('button', {
    type: 'button',
    className: 'hc-close',
    text: 'CLEAR',
    onClick: () => {
      clearStoredHeliosToken();
      tokenInput.value = '';
      appendMsg('system', 'Token cleared.');
    },
  });
  const settings = el('div', {
    style: 'display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-bottom:1px solid var(--border);font-size:9px;color:var(--text-dim)',
  }, [
    el('div', { text: 'Settings · optional API token (T1 shared lab). XSS can read it — prefer unset on solo loopback.' }),
    el('div', { style: 'display:flex;gap:4px;align-items:center' }, [
      tokenInput,
      saveTok,
      clearTok,
    ]),
    el('label', { style: 'display:flex;gap:4px;align-items:center;cursor:pointer' }, [
      persistCb,
      el('span', { text: 'Persist on this machine (localStorage)' }),
    ]),
    el('label', { style: 'display:flex;gap:4px;align-items:center;cursor:pointer' }, [
      toolsCb,
      el('span', { text: 'Tools — allow AI to drive planner (set route, compute…)' }),
    ]),
  ]);

  const head = el('div', { className: 'hc-head' }, [
    el('div', {}, [
      el('div', { className: 'hc-title', text: 'HELIOS // ASSISTANT' }),
      el('div', { className: 'hc-sub', text: `model ${DEFAULT_MODEL} · concept-grade` }),
    ]),
    el('button', {
      type: 'button',
      className: 'hc-close',
      text: 'CLOSE',
      onClick: () => setOpen(false),
    }),
  ]);

  panel.appendChild(head);
  panel.appendChild(settings);
  panel.appendChild(messagesEl);
  panel.appendChild(form);
  document.body.appendChild(panel);
  document.body.appendChild(fab);

  /** @type {{role:string, content:string}[]} */
  const history = [];
  let busy = false;
  let open = false;

  function setOpen(v) {
    open = v;
    panel.classList.toggle('open', open);
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      input.focus();
    }
  }

  function appendMsg(role, content, extraClass = '') {
    const m = el('div', {
      className: `hc-msg ${role}${extraClass ? ' ' + extraClass : ''}`,
      text: content,
    });
    messagesEl.appendChild(m);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return m;
  }

  appendMsg(
    'system',
    'Concept-grade co-pilot. API key stays on the server. Enable Tools to drive the planner; CLI C2 also works when this tab is open.',
  );

  fab.addEventListener('click', () => setOpen(!open));

  async function chatApi(body) {
    const res = await heliosFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        stream: false,
        ...body,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Chat failed (${res.status})`);
    return data;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    appendMsg('user', text);
    history.push({ role: 'user', content: text });
    busy = true;
    sendBtn.disabled = true;
    const thinking = appendMsg('assistant', '…');

    try {
      let contextNote = '';
      try {
        const snap = snapshotState();
        contextNote = `\n\n[Live planner snapshot: ${JSON.stringify(snap)}]`;
      } catch {
        /* ignore */
      }

      const useTools = !!toolsCb.checked;
      let reply;

      if (useTools) {
        const messages = [
          { role: 'system', content: AGENT_SYSTEM_WITH_TOOLS + contextNote },
          ...history.slice(-12),
        ];
        reply = await runToolAgentLoop({
          messages,
          chatFn: chatApi,
          executeFn: async (name, args) => executeCommand({ action: name, args }),
          maxRounds: 6,
          onTool: (name, args) => {
            thinking.textContent = `tool → ${name}(${JSON.stringify(args).slice(0, 80)})…`;
          },
        });
      } else {
        const messages = [
          { role: 'system', content: SYSTEM_PROMPT + contextNote },
          ...history.slice(-16),
        ];
        const data = await chatApi({ messages });
        reply =
          data?.message?.content ||
          data?.response ||
          '(empty model response)';
      }

      thinking.textContent = reply;
      history.push({ role: 'assistant', content: reply });
    } catch (err) {
      thinking.classList.add('error');
      thinking.textContent =
        err.message ||
        'Chat unavailable. Start with `npm start` and ensure OLLAMA_API_KEY is in .env.';
      // Pop orphaned user turn on failure so retries stay balanced
      if (history.length && history[history.length - 1].role === 'user') {
        history.pop();
      }
    } finally {
      busy = false;
      sendBtn.disabled = false;
      messagesEl.scrollTop = messagesEl.scrollHeight;
      input.focus();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // Esc closes panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      setOpen(false);
    }
  });
}
