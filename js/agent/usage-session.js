/**
 * Session AI usage HUD (from Ollama usage fields — docs.ollama.com/api/usage).
 */

const KEY = 'helios_ai_usage_session';

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function save(s) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* */ }
}

export function recordUsage(usage, model) {
  if (!usage) return getUsageSession();
  const s = load();
  s.calls = (s.calls || 0) + 1;
  s.prompt_tokens = (s.prompt_tokens || 0) + (Number(usage.prompt_eval_count) || 0);
  s.eval_tokens = (s.eval_tokens || 0) + (Number(usage.eval_count) || 0);
  s.total_ns = (s.total_ns || 0) + (Number(usage.total_duration) || 0);
  s.last_model = model || s.last_model || null;
  s.updated_at = Date.now();
  save(s);
  try {
    window.dispatchEvent(new CustomEvent('helios-ai-usage', { detail: s }));
  } catch { /* */ }
  return s;
}

export function getUsageSession() {
  const s = load();
  return {
    calls: s.calls || 0,
    prompt_tokens: s.prompt_tokens || 0,
    eval_tokens: s.eval_tokens || 0,
    total_ms: s.total_ns ? s.total_ns / 1e6 : 0,
    last_model: s.last_model || null,
  };
}

export function formatUsageSession(s = getUsageSession()) {
  if (!s.calls) return '0 calls';
  const ms = s.total_ms;
  const t = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(0)}ms`;
  return `${s.calls} calls · ${s.prompt_tokens + s.eval_tokens} tok · ${t}`;
}

export function resetUsageSession() {
  save({});
  return getUsageSession();
}
