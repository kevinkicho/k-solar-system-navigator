/**
 * HELIOS AI core client — models, chat, mission brief, next actions.
 * Works with local Node (npm start) or App Hosting /api/* proxy.
 */

import { heliosFetch } from './api-auth.js';
import {
  getSelectedModel,
  setStoredModel,
  loadModelCatalog,
  formatUsageMetrics,
  FALLBACK_DEFAULT_MODEL,
} from './models.js';
import {
  buildRichMissionContext,
  formatContextForPrompt,
  ruleBasedNextActions,
  missionBriefSystemPrompt,
} from './mission-context.js';
import { recordUsage } from './usage-session.js';
import { state } from '../state.js';
import { dateToInputValue } from '../ui/format.js';
import { timeState } from '../ui/time-system.js';

/** Cloud Functions fallback when same-origin /api/chat is unavailable (classic Hosting). */
const FN_BASE = 'https://us-central1-k-solar-system-navigator.cloudfunctions.net';

async function fetchAi(path, opts = {}) {
  try {
    return await heliosFetch(path, opts);
  } catch (e) {
    if (e.code === 'HELIOS_AUTH') throw e;
    // network
    throw e;
  }
}

/**
 * Try same-origin first; on 404/HTML fallback to Cloud Functions AI proxy.
 */
async function fetchAiWithFallback(path, opts = {}) {
  const res = await fetchAi(path, opts);
  if (res.status !== 404) return res;
  // Classic Hosting may rewrite to index.html — detect and fallback
  const ct = res.headers.get('content-type') || '';
  if (path.startsWith('/api/') && (ct.includes('text/html') || res.status === 404)) {
    const fnPath = path.includes('models')
      ? `${FN_BASE}/heliosAiModels`
      : `${FN_BASE}/heliosAiChat`;
    return fetch(fnPath, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
      body: opts.body,
    });
  }
  return res;
}

/**
 * Detect AI backend readiness (local or App Hosting).
 */
export async function probeAiBackend() {
  try {
    const res = await fetch('/api/health', { method: 'GET' });
    const j = await res.json().catch(() => ({}));
    const ollama = j.ollamaConfigured === true
      || j.ai?.ollamaConfigured === true
      || j.features?.ai_chat === true;
    return {
      ok: res.ok,
      host: j.host || j.service || 'unknown',
      ollamaConfigured: ollama,
      defaultModel: j.model || j.ai?.defaultModel || FALLBACK_DEFAULT_MODEL,
      ai: j.ai || null,
    };
  } catch (e) {
    return { ok: false, ollamaConfigured: false, error: e.message };
  }
}

export function currentModel() {
  return getSelectedModel() || state.ai?.model || FALLBACK_DEFAULT_MODEL;
}

export function selectModel(name) {
  setStoredModel(name);
  if (!state.ai) state.ai = {};
  state.ai.model = name;
  try {
    window.dispatchEvent(new CustomEvent('helios-ai-model', { detail: { model: name } }));
  } catch { /* */ }
}

export async function refreshCatalog() {
  return loadModelCatalog();
}

/**
 * Non-streaming chat.
 * @returns {Promise<{ text: string, usage: object|null, model: string, raw: object }>}
 */
export async function chatComplete({ messages, tools, model } = {}) {
  const m = model || currentModel();
  let res = await fetchAiWithFallback('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: m,
      messages,
      tools,
      stream: false,
    }),
  });
  // Hosting SPA rewrite may return 200 HTML
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    res = await fetch(`${FN_BASE}/heliosAiChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: m, messages, tools, stream: false }),
    });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Chat ${res.status}`);
  const text = data.message?.content || data.response || '';
  const usage = data.helios?.usage || {
    total_duration: data.total_duration,
    eval_count: data.eval_count,
    prompt_eval_count: data.prompt_eval_count,
    eval_duration: data.eval_duration,
    load_duration: data.load_duration,
    prompt_eval_duration: data.prompt_eval_duration,
  };
  recordUsage(usage, data.model || m);
  return { text, usage, model: data.model || m, raw: data };
}

/**
 * Streaming chat; onDelta(full, delta).
 */
export async function chatStream({ messages, model, onDelta } = {}) {
  const m = model || currentModel();
  let res = await fetchAiWithFallback('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: m,
      messages,
      stream: true,
    }),
  });
  const ct0 = res.headers.get('content-type') || '';
  if (ct0.includes('text/html')) {
    res = await fetch(`${FN_BASE}/heliosAiChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: m, messages, stream: true }),
    });
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Chat ${res.status}`);
  }
  if (!res.body?.getReader) {
    const data = await res.json().catch(() => ({}));
    const text = data.message?.content || '';
    onDelta?.(text, text);
    return {
      text,
      usage: data.helios?.usage || null,
      model: data.model || m,
    };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let usage = null;
  let modelName = m;
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
      try { j = JSON.parse(t); } catch { continue; }
      if (j.error) throw new Error(j.error);
      if (j.model) modelName = j.model;
      if (j.done) {
        usage = {
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
  recordUsage(usage, modelName);
  return { text: full || '(empty)', usage, model: modelName };
}

/**
 * Live context + rule next actions for UI panels.
 */
export function getMissionAiBundle() {
  let departure;
  try {
    departure = dateToInputValue(timeState.getDate());
  } catch { /* */ }
  const ctx = buildRichMissionContext(state, { departure });
  const next = ruleBasedNextActions(ctx);
  return { ctx, next, promptContext: formatContextForPrompt(ctx) };
}

/**
 * Generate a mission brief from live plan state.
 */
export async function generateMissionBrief() {
  const { ctx, promptContext } = getMissionAiBundle();
  const result = await chatComplete({
    messages: [
      { role: 'system', content: missionBriefSystemPrompt() },
      {
        role: 'user',
        content: `Write the mission brief for this live plan:\n${promptContext}`,
      },
    ],
  });
  return {
    brief: result.text,
    usage: result.usage,
    model: result.model,
    ctx,
  };
}

/**
 * Ask AI about current plan (Results "Ask AI").
 */
export async function askAboutPlan(question) {
  const { promptContext } = getMissionAiBundle();
  return chatStream({
    messages: [
      {
        role: 'system',
        content:
          'You are HELIOS AI core co-pilot. Answer using the live mission context. Preliminary only — not flight-certified.'
          + promptContext,
      },
      { role: 'user', content: question || 'Summarize this plan and top risks.' },
    ],
  });
}

export { formatUsageMetrics, buildRichMissionContext, ruleBasedNextActions };
