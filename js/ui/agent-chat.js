/**
 * Floating action button + chat panel — AI at the core of HELIOS.
 * Model selection via GET /api/models (Ollama Cloud tags); chat via POST /api/chat.
 * API key never leaves the local Node server (.env OLLAMA_API_KEY).
 * Docs: https://docs.ollama.com/cloud · https://docs.ollama.com/api/tags · https://docs.ollama.com/api/usage
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
import {
  loadModelCatalog,
  getSelectedModel,
  setStoredModel,
  formatUsageMetrics,
  FALLBACK_DEFAULT_MODEL,
} from '../agent/models.js';
import { getMissionAiBundle, selectModel as coreSelectModel } from '../agent/ai-core.js';
import { appendMemoryTurn, memorySummaryForPrompt, loadMemoryFromCloud } from '../agent/memory.js';
import { formatUsageSession, getUsageSession } from '../agent/usage-session.js';
import { parseCampaignHint } from '../agent/campaign-parse.js';
import { syncAiModelChip } from './ai-chrome.js';
import { state } from '../state.js';

const SYSTEM_PROMPT_BASE = `You are HELIOS Assistant — core co-pilot for the HELIOS Mission Design workstation (browser launch-planning analysis).

Scope and honesty:
- Live planning pipeline workstation (DE440s sample table + optional live Horizons inject). NOT flight-certified, NOT range safety, NOT operational SPICE OD, NOT SpaceX-certified performance.
- Physics: sample-DE / L3 DE440s-baked table for planning (product), L1 Approximate Positions for scene animation only, Lambert transfers, Need/Capability/Margin vehicle triad, READY/NO-GO Plan Dossier (analysis completeness).
- Prefer unrefueled Starship or Falcon 9 C₃ table for vehicle models.
- Intelligent itineraries / SUGGEST GA are local multi-leg seeds — not global tour optima.
- If asked for operational flight design or certification, say clearly that HELIOS is preliminary analysis only.

You can explain routes, Δv, porkchops, itineraries, vehicles, fidelity badges, and plan quality gates.
When the user wants the UI changed (set Earth→Mars, compute route, suggest itinerary), enable Tools or use the CLI agent.

Keep answers concise, technical when needed, and label uncertainties.`;

function systemPrompt() {
  const p = state.ai?.personality || 'industrial';
  if (p === 'coach') {
    return `${SYSTEM_PROMPT_BASE}\nTone: coaching — teach why recommendations matter in short plain language.`;
  }
  return `${SYSTEM_PROMPT_BASE}\nTone: industrial — terse bullets and numbers first.`;
}

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
  position: fixed; right: 20px; bottom: calc(64px + 12px); z-index: 40;
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
  position: fixed; right: 20px; bottom: calc(64px + 12px + 64px); z-index: 40;
  width: min(380px, calc(100vw - 24px));
  height: min(520px, calc(100vh - 160px));
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
.hc-model-row {
  display: flex; flex-direction: column; gap: 4px;
  padding: 8px 10px; border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(0,60,90,0.35), transparent);
}
.hc-model-row label {
  font-family: var(--font-display, Orbitron, monospace);
  font-size: 9px; letter-spacing: 1px; color: var(--amber, #ff9800);
}
#helios-model-select {
  width: 100%; background: rgba(0,0,0,0.45); border: 1px solid var(--border-bright, rgba(0,200,255,0.45));
  color: var(--cyan, #00d4ff); font-family: var(--font-mono, monospace); font-size: 11px;
  padding: 6px 8px; border-radius: 4px; outline: none; cursor: pointer;
}
#helios-model-select:focus { border-color: var(--cyan); }
.hc-model-meta { font-size: 9px; color: var(--text-dim); line-height: 1.3; }
.hc-usage {
  font-size: 9px; color: var(--text-dim); opacity: 0.9; margin-top: 4px;
  font-family: var(--font-mono, monospace);
}
.hc-voice-row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
#helios-voice-btn {
  font-size: 9px; letter-spacing: 0.5px; padding: 4px 8px;
  border: 1px solid var(--border); background: rgba(0,0,0,0.35);
  color: var(--text-dim); border-radius: 4px; cursor: pointer;
  font-family: var(--font-display, Orbitron, monospace);
}
#helios-voice-btn.listening { color: var(--amber); border-color: rgba(255,152,0,0.5); }
@media (max-width: 768px) {
  #helios-fab { right: 12px; bottom: calc(56px + 52px); width: 50px; height: 50px; }
  #helios-chat-panel {
    right: 8px; bottom: calc(56px + 52px + 58px);
    width: calc(100vw - 16px); height: min(50vh, 420px);
  }
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
    placeholder: 'Ask AI to plan, explain Δv, pick windows…',
    'aria-label': 'Chat message',
  });
  const sendBtn = el('button', {
    id: 'helios-chat-send',
    type: 'submit',
    text: 'SEND',
  });
  const form = el('form', { id: 'helios-chat-form' }, [input, sendBtn]);

  // ── Model selection (core AI control) ─────────────────────────────
  const modelSelect = el('select', {
    id: 'helios-model-select',
    'aria-label': 'AI model',
    title: 'Ollama Cloud model (from /api/models → ollama.com/api/tags)',
  });
  modelSelect.appendChild(el('option', { value: FALLBACK_DEFAULT_MODEL, text: FALLBACK_DEFAULT_MODEL }));
  const modelMeta = el('div', { className: 'hc-model-meta', text: 'Loading models from Ollama Cloud…' });
  const modelRow = el('div', { className: 'hc-model-row' }, [
    el('label', { text: 'AI MODEL · OLLAMA CLOUD' }),
    modelSelect,
    modelMeta,
  ]);

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
  toolsCb.checked = !!state.ai?.toolsEnabled;
  const personalitySel = el('select', {
    id: 'helios-personality',
    'aria-label': 'AI personality',
    title: 'industrial = terse · coach = teaching',
  });
  for (const [val, label] of [['industrial', 'Industrial'], ['coach', 'Coach']]) {
    const o = el('option', { value: val, text: label });
    if ((state.ai?.personality || localStorage.getItem('helios-ai-personality') || 'industrial') === val) {
      o.selected = true;
    }
    personalitySel.appendChild(o);
  }
  try {
    const storedP = localStorage.getItem('helios-ai-personality');
    if (storedP && state.ai) state.ai.personality = storedP;
  } catch { /* */ }
  personalitySel.addEventListener('change', () => {
    if (state.ai) state.ai.personality = personalitySel.value;
    try { localStorage.setItem('helios-ai-personality', personalitySel.value); } catch { /* */ }
    appendMsg('system', `Personality → ${personalitySel.value}`);
  });
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
  const refreshModelsBtn = el('button', {
    type: 'button',
    className: 'hc-close',
    text: 'REFRESH MODELS',
    onClick: () => refreshModels({ force: true }),
  });
  const usageHud = el('div', {
    id: 'helios-usage-hud',
    className: 'hc-model-meta',
    text: formatUsageSession(),
  });
  const voiceBtn = el('button', {
    type: 'button',
    id: 'helios-voice-btn',
    text: 'MIC',
    title: 'Speech-to-text (Web Speech API)',
  });
  const speakCb = el('input', { type: 'checkbox', id: 'helios-speak-out' });
  const settings = el('div', {
    style: 'display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-bottom:1px solid var(--border);font-size:9px;color:var(--text-dim)',
  }, [
    el('div', { text: 'AI core · model picker · Tools drive campaign/recovery. Session usage below.' }),
    usageHud,
    el('div', { style: 'display:flex;gap:4px;align-items:center;flex-wrap:wrap' }, [
      tokenInput,
      saveTok,
      clearTok,
      refreshModelsBtn,
    ]),
    el('div', { className: 'hc-voice-row' }, [
      voiceBtn,
      el('label', { style: 'display:flex;gap:4px;align-items:center;cursor:pointer' }, [
        speakCb,
        el('span', { text: 'Speak replies' }),
      ]),
    ]),
    el('label', { style: 'display:flex;gap:4px;align-items:center;cursor:pointer' }, [
      persistCb,
      el('span', { text: 'Persist token on this machine (localStorage)' }),
    ]),
    el('label', { style: 'display:flex;gap:4px;align-items:center;cursor:pointer' }, [
      toolsCb,
      el('span', { text: 'Tools — campaign, recovery, itinerary, route, compute…' }),
    ]),
    el('label', { style: 'display:flex;gap:6px;align-items:center' }, [
      el('span', { text: 'Personality' }),
      personalitySel,
    ]),
  ]);

  // Voice input (optional Web Speech API)
  let recognition = null;
  try {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (ev) => {
        const t = ev.results?.[0]?.[0]?.transcript || '';
        if (t) {
          input.value = (input.value ? `${input.value} ` : '') + t;
        }
        voiceBtn.classList.remove('listening');
      };
      recognition.onerror = () => voiceBtn.classList.remove('listening');
      recognition.onend = () => voiceBtn.classList.remove('listening');
    }
  } catch { /* no speech */ }
  if (!recognition) {
    voiceBtn.disabled = true;
    voiceBtn.title = 'Speech recognition not available in this browser';
  }
  voiceBtn.onclick = () => {
    if (!recognition) return;
    try {
      voiceBtn.classList.add('listening');
      recognition.start();
    } catch {
      voiceBtn.classList.remove('listening');
    }
  };
  window.addEventListener('helios-ai-usage', () => {
    usageHud.textContent = formatUsageSession(getUsageSession());
  });
  loadMemoryFromCloud().catch(() => {});

  const headSub = el('div', { className: 'hc-sub', text: `model ${getSelectedModel()} · AI core` });
  const head = el('div', { className: 'hc-head' }, [
    el('div', {}, [
      el('div', { className: 'hc-title', text: 'HELIOS // AI CORE' }),
      headSub,
    ]),
    el('button', {
      type: 'button',
      className: 'hc-close',
      text: 'CLOSE',
      onClick: () => setOpen(false),
    }),
  ]);

  panel.appendChild(head);
  panel.appendChild(modelRow);
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
      refreshModels();
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

  function appendUsageNote(parentEl, usage, modelName) {
    const line = formatUsageMetrics(usage);
    if (!line && !modelName) return;
    const u = el('div', {
      className: 'hc-usage',
      text: [modelName, line].filter(Boolean).join(' · '),
    });
    parentEl.appendChild(u);
  }

  function syncHeadModel() {
    const m = getSelectedModel();
    headSub.textContent = `model ${m} · AI core`;
    fab.title = `HELIOS AI (${m})`;
  }

  async function refreshModels() {
    modelMeta.textContent = 'Loading Ollama Cloud models…';
    const cat = await loadModelCatalog();
    const selected = getSelectedModel();
    modelSelect.innerHTML = '';
    const names = new Set();
    for (const m of cat.models) {
      if (!m.name || names.has(m.name)) continue;
      names.add(m.name);
      const opt = el('option', { value: m.name, text: m.name });
      if (m.source && m.source !== 'ollama-cloud-tags') {
        opt.textContent = `${m.name} (${m.source})`;
      }
      modelSelect.appendChild(opt);
    }
    if (!names.has(selected)) {
      modelSelect.appendChild(el('option', { value: selected, text: selected }));
    }
    modelSelect.value = selected;
    const live = cat.live ? 'live tags' : 'fallback catalog';
    const err = cat.error ? ` · ${cat.error}` : '';
    modelMeta.textContent = `${cat.models.length} models · ${live} · default ${cat.defaultModel}${err}`;
    syncHeadModel();
  }

  modelSelect.addEventListener('change', () => {
    const v = modelSelect.value;
    coreSelectModel(v);
    setStoredModel(v);
    if (state.ai) state.ai.toolsEnabled = !!toolsCb.checked;
    syncHeadModel();
    try { syncAiModelChip(); } catch { /* */ }
    appendMsg('system', `Model → ${v}`);
  });
  toolsCb.addEventListener('change', () => {
    if (!state.ai) state.ai = {};
    state.ai.toolsEnabled = !!toolsCb.checked;
  });

  appendMsg(
    'system',
    'AI is core to HELIOS. Choose a cloud model, then ask or enable Tools to drive the planner. Key stays on the server (npm start + .env).',
  );
  refreshModels();

  fab.addEventListener('click', () => setOpen(!open));

  function activeModel() {
    return modelSelect.value || getSelectedModel() || FALLBACK_DEFAULT_MODEL;
  }

  /** Non-streaming chat (tools + agent loop). Returns full Ollama JSON. */
  async function chatApi(body) {
    const res = await heliosFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        model: activeModel(),
        stream: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Chat failed (${res.status})`);
    return data;
  }

  /**
   * Stream NDJSON chat from /api/chat (Ollama cloud via proxy).
   * @param {object} body
   * @param {(full: string, delta: string) => void} onDelta
   * @returns {Promise<{ text: string, usage: object|null, model: string }>}
   */
  async function chatApiStream(body, onDelta) {
    const model = activeModel();
    const res = await heliosFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        model,
        stream: true,
        tools: undefined, // force no tools on stream path
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Chat failed (${res.status})`);
    }
    if (!res.body || !res.body.getReader) {
      const data = await res.json().catch(() => ({}));
      const text = data?.message?.content || data?.response || '';
      onDelta?.(text, text);
      return {
        text,
        usage: data?.helios?.usage || {
          total_duration: data.total_duration,
          eval_count: data.eval_count,
          prompt_eval_count: data.prompt_eval_count,
          eval_duration: data.eval_duration,
        },
        model: data.model || model,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let full = '';
    let lastUsage = null;
    let lastModel = model;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        let j;
        try {
          j = JSON.parse(t);
        } catch {
          continue;
        }
        if (j.error) throw new Error(j.error);
        if (j.model) lastModel = j.model;
        // Final chunk includes usage (docs.ollama.com/api/usage)
        if (j.done) {
          lastUsage = {
            total_duration: j.total_duration,
            load_duration: j.load_duration,
            prompt_eval_count: j.prompt_eval_count,
            prompt_eval_duration: j.prompt_eval_duration,
            eval_count: j.eval_count,
            eval_duration: j.eval_duration,
          };
        }
        const delta = j.message?.content || j.response || '';
        if (delta) {
          full += delta;
          onDelta?.(full, delta);
        }
      }
    }
    if (buf.trim()) {
      try {
        const j = JSON.parse(buf.trim());
        if (j.done) {
          lastUsage = {
            total_duration: j.total_duration,
            load_duration: j.load_duration,
            prompt_eval_count: j.prompt_eval_count,
            prompt_eval_duration: j.prompt_eval_duration,
            eval_count: j.eval_count,
            eval_duration: j.eval_duration,
          };
        }
        const delta = j.message?.content || '';
        if (delta) {
          full += delta;
          onDelta?.(full, delta);
        }
      } catch {
        /* ignore */
      }
    }
    return {
      text: full || '(empty model response)',
      usage: lastUsage,
      model: lastModel,
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    appendMsg('user', text);
    history.push({ role: 'user', content: text });
    appendMemoryTurn('user', text);
    busy = true;
    sendBtn.disabled = true;
    const thinking = appendMsg('assistant', '…');

    try {
      let contextNote = '';
      try {
        const bundle = getMissionAiBundle();
        contextNote = bundle.promptContext
          || `\n\n[Live planner snapshot: ${JSON.stringify(snapshotState())}]`;
        if (bundle.next?.length) {
          contextNote += `\n[Rule-based next actions: ${bundle.next.map((a) => a.label).join(' | ')}]`;
        }
        contextNote += memorySummaryForPrompt(6);
        // NL campaign hint for tools path
        const hint = parseCampaignHint(text);
        if (hint.origin || hint.destination) {
          contextNote += `\n[Parsed campaign hint: ${JSON.stringify(hint)}]`;
        }
      } catch {
        try {
          contextNote = `\n\n[Live planner snapshot: ${JSON.stringify(snapshotState())}]`;
        } catch { /* ignore */ }
      }

      // Auto-enable tools for campaign-like requests
      const looksLikeCampaign = /\b(set|go|plan|campaign|earth|mars|jupiter|compute|flyby|cargo|itinerary|tour)\b/i.test(text)
        && (toolsCb.checked || parseCampaignHint(text).destination || /\bitinerary\b/i.test(text));
      const useTools = !!toolsCb.checked || looksLikeCampaign;
      if (looksLikeCampaign && !toolsCb.checked) {
        appendMsg('system', 'Auto-enabling Tools for campaign-style request…');
      }
      let reply;

      if (useTools) {
        const messages = [
          { role: 'system', content: AGENT_SYSTEM_WITH_TOOLS + contextNote },
          ...history.slice(-12),
        ];
        let lastData = null;
        reply = await runToolAgentLoop({
          messages,
          chatFn: async (b) => {
            lastData = await chatApi(b);
            return lastData;
          },
          executeFn: async (name, args) => executeCommand({ action: name, args }),
          maxRounds: 10,
          onTool: (name, args) => {
            thinking.textContent = `tool → ${name}(${JSON.stringify(args).slice(0, 80)})…`;
          },
        });
        thinking.textContent = reply;
        appendUsageNote(
          thinking,
          lastData?.helios?.usage || lastData,
          lastData?.model || activeModel(),
        );
      } else {
        const messages = [
          { role: 'system', content: systemPrompt() + contextNote },
          ...history.slice(-16),
        ];
        thinking.textContent = '';
        const streamed = await chatApiStream({ messages }, (full) => {
          thinking.textContent = full || '…';
          messagesEl.scrollTop = messagesEl.scrollHeight;
        });
        reply = streamed.text;
        if (!thinking.textContent) thinking.textContent = reply;
        appendUsageNote(thinking, streamed.usage, streamed.model);
      }

      history.push({ role: 'assistant', content: reply });
      appendMemoryTurn('assistant', reply, { model: activeModel() });
      if (speakCb.checked && reply && window.speechSynthesis) {
        try {
          const u = new SpeechSynthesisUtterance(reply.slice(0, 500));
          u.rate = 1.05;
          window.speechSynthesis.speak(u);
        } catch { /* */ }
      }
      usageHud.textContent = formatUsageSession(getUsageSession());
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
