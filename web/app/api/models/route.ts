/**
 * App Hosting: list Ollama Cloud models (GET https://ollama.com/api/tags).
 * Requires OLLAMA_API_KEY secret at runtime.
 * Docs: https://docs.ollama.com/cloud · https://docs.ollama.com/api/tags
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLLAMA_TAGS = 'https://ollama.com/api/tags';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud';
const CURATED = [
  'gemma4:31b-cloud',
  'gemma4:26b-cloud',
  'gpt-oss:120b-cloud',
  'gpt-oss:20b-cloud',
  'qwen3-coder:480b-cloud',
  'deepseek-v3.2-cloud',
  'minimax-m2.5-cloud',
  'kimi-k2.5-cloud',
];

function mergeCatalog(live: { name: string; model?: string; size?: number | null; details?: unknown; source?: string }[]) {
  const by = new Map<string, object>();
  for (const m of live) {
    if (m?.name) by.set(m.name, { ...m, source: m.source || 'ollama-cloud-tags' });
  }
  for (const name of CURATED) {
    if (!by.has(name)) by.set(name, { name, model: name, size: null, details: null, source: 'curated-fallback' });
  }
  if (!by.has(DEFAULT_MODEL)) {
    by.set(DEFAULT_MODEL, { name: DEFAULT_MODEL, model: DEFAULT_MODEL, size: null, details: null, source: 'env-default' });
  }
  return [...by.values()].sort((a: { name?: string }, b: { name?: string }) =>
    String(a.name).localeCompare(String(b.name)));
}

export async function GET() {
  const key = process.env.OLLAMA_API_KEY;
  let liveModels: { name: string; model: string; size: number | null; details: unknown; source: string }[] = [];
  let live = false;
  let error: string | null = null;

  if (key) {
    try {
      const res = await fetch(OLLAMA_TAGS, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error = data.error || data.message || `tags HTTP ${res.status}`;
      } else {
        live = true;
        const list = Array.isArray(data.models) ? data.models : [];
        liveModels = list.map((m: { name?: string; model?: string; size?: number; details?: unknown }) => ({
          name: m.name || m.model || '',
          model: m.model || m.name || '',
          size: m.size ?? null,
          details: m.details ?? null,
          source: 'ollama-cloud-tags',
        })).filter((m: { name: string }) => m.name);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  } else {
    error = 'OLLAMA_API_KEY not set on App Hosting';
  }

  const models = mergeCatalog(liveModels);
  return NextResponse.json({
    ok: true,
    defaultModel: DEFAULT_MODEL,
    live,
    error,
    count: models.length,
    models,
    host: 'firebase-app-hosting',
    usageFields: [
      'total_duration', 'load_duration', 'prompt_eval_count',
      'prompt_eval_duration', 'eval_count', 'eval_duration',
    ],
  });
}
