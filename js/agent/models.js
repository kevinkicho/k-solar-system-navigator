/**
 * Client-side AI model selection for HELIOS assistant (Ollama Cloud).
 * Catalog comes from GET /api/models → proxies https://ollama.com/api/tags
 * (see https://docs.ollama.com/cloud and https://docs.ollama.com/api/tags).
 */

import { heliosFetch } from './api-auth.js';
import { state } from '../state.js';

const STORAGE_KEY = 'helios_ai_model';
export const FALLBACK_DEFAULT_MODEL = 'gemma4:31b-cloud';

/** @type {{ models: object[], defaultModel: string, live: boolean, error: string|null }|null} */
let _catalog = null;

export function getStoredModel() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && v.length < 128) return v;
  } catch { /* */ }
  return null;
}

export function setStoredModel(name) {
  const n = String(name || '').trim();
  if (!n) return;
  try {
    localStorage.setItem(STORAGE_KEY, n);
  } catch { /* */ }
  if (state.ai) state.ai.model = n;
}

export function getSelectedModel() {
  return state.ai?.model || getStoredModel() || FALLBACK_DEFAULT_MODEL;
}

/**
 * Format Ollama usage fields (nanoseconds) for UI.
 * @param {object|null} usage
 * @returns {string}
 */
export function formatUsageMetrics(usage) {
  if (!usage || typeof usage !== 'object') return '';
  const parts = [];
  if (usage.eval_count != null) parts.push(`${usage.eval_count} tok out`);
  if (usage.prompt_eval_count != null) parts.push(`${usage.prompt_eval_count} tok in`);
  if (usage.total_duration != null && usage.total_duration > 0) {
    const ms = usage.total_duration / 1e6;
    parts.push(ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(0)} ms`);
  }
  if (usage.eval_count != null && usage.eval_duration > 0) {
    const tps = usage.eval_count / (usage.eval_duration / 1e9);
    if (isFinite(tps) && tps > 0) parts.push(`${tps.toFixed(1)} tok/s`);
  }
  return parts.join(' · ');
}

/**
 * Load model catalog from local server proxy.
 * @returns {Promise<{ models: object[], defaultModel: string, live: boolean, error: string|null }>}
 */
export async function loadModelCatalog() {
  try {
    const res = await heliosFetch('/api/models', { method: 'GET' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `models ${res.status}`);
    }
    const models = Array.isArray(data.models) ? data.models : [];
    const defaultModel = data.defaultModel || FALLBACK_DEFAULT_MODEL;
    _catalog = {
      models,
      defaultModel,
      live: !!data.live,
      error: data.error || null,
    };
    // Initialize selection if unset
    if (!state.ai) state.ai = {};
    if (!state.ai.model) {
      const stored = getStoredModel();
      const names = new Set(models.map((m) => m.name));
      if (stored && (names.has(stored) || stored === defaultModel)) {
        state.ai.model = stored;
      } else {
        state.ai.model = defaultModel;
        setStoredModel(defaultModel);
      }
    }
    return _catalog;
  } catch (e) {
    _catalog = {
      models: [{ name: FALLBACK_DEFAULT_MODEL, model: FALLBACK_DEFAULT_MODEL, source: 'offline' }],
      defaultModel: FALLBACK_DEFAULT_MODEL,
      live: false,
      error: e.message || String(e),
    };
    if (!state.ai) state.ai = {};
    if (!state.ai.model) state.ai.model = getStoredModel() || FALLBACK_DEFAULT_MODEL;
    return _catalog;
  }
}

export function getCachedCatalog() {
  return _catalog;
}
