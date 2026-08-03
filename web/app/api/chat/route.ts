/**
 * App Hosting: Ollama Cloud chat proxy (POST https://ollama.com/api/chat).
 * Secret: OLLAMA_API_KEY (runtime). Key never ships to the browser.
 * Docs: https://docs.ollama.com/api/chat · https://docs.ollama.com/api/usage
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLLAMA_CHAT = 'https://ollama.com/api/chat';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud';
const MAX_MESSAGES = 40;
const MAX_CHARS = 200_000;

function allowModel(name: string): boolean {
  const n = String(name || '').trim();
  if (!n || n.length > 128) return false;
  if (!/^[\w.:@/-]+$/i.test(n)) return false;
  if (n === DEFAULT_MODEL) return true;
  if (/cloud|gemma|gpt|qwen|deepseek|kimi|minimax|llama|mistral/i.test(n)) return true;
  const extra = (process.env.OLLAMA_ALLOWED_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.includes(n);
}

export async function POST(req: NextRequest) {
  const key = process.env.OLLAMA_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'OLLAMA_API_KEY not configured on App Hosting (set secret OLLAMA_API_KEY)' },
      { status: 503 },
    );
  }

  let body: {
    model?: string;
    messages?: { role?: string; content?: string }[];
    stream?: boolean;
    tools?: unknown;
    options?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'messages[] required' }, { status: 400 });
  }
  if (body.messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: `messages max ${MAX_MESSAGES}` }, { status: 400 });
  }
  let chars = 0;
  for (const m of body.messages) chars += String(m?.content || '').length;
  if (chars > MAX_CHARS) {
    return NextResponse.json({ error: 'messages content too large' }, { status: 400 });
  }

  const model = body.model && allowModel(body.model) ? body.model : DEFAULT_MODEL;
  const stream = body.stream === true && !body.tools;

  const payload: Record<string, unknown> = {
    model,
    messages: body.messages,
    stream,
  };
  if (body.tools) payload.tools = body.tools;
  if (body.options) payload.options = body.options;

  const upstream = await fetch(OLLAMA_CHAT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (stream) {
    if (!upstream.ok) {
      const text = await upstream.text();
      let err = text;
      try { err = JSON.parse(text).error || text; } catch { /* */ }
      return NextResponse.json({ error: err || `Ollama ${upstream.status}` }, { status: upstream.status });
    }
    // Pass through NDJSON stream
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  const text = await upstream.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!upstream.ok) {
    return NextResponse.json(
      { error: (data.error as string) || (data.message as string) || `Ollama ${upstream.status}` },
      { status: upstream.status },
    );
  }
  data.helios = {
    model,
    host: 'firebase-app-hosting',
    usage: {
      total_duration: data.total_duration ?? null,
      load_duration: data.load_duration ?? null,
      prompt_eval_count: data.prompt_eval_count ?? null,
      prompt_eval_duration: data.prompt_eval_duration ?? null,
      eval_count: data.eval_count ?? null,
      eval_duration: data.eval_duration ?? null,
    },
  };
  return NextResponse.json(data);
}
