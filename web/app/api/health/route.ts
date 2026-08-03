import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * App Hosting health + build / dense-pack identity probe.
 * Used for ops checks; does not expose secrets.
 */
function loadBuildMeta() {
  try {
    const p = join(process.cwd(), 'public', 'helios-build.json');
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export async function GET() {
  const build = loadBuildMeta();
  return NextResponse.json({
    ok: true,
    service: 'helios-mission-design',
    host: 'firebase-app-hosting',
    product_class: 'preliminary-not-flight-certified',
    product_grade: 'industrial-preliminary',
    timestamp: new Date().toISOString(),
    build: build
      ? {
          prepared_at: build.prepared_at,
          git_sha: build.git_sha,
          package_version: build.package_version,
          spa_main_sha256_12: build.spa_main_sha256_12,
          dense_spk: build.dense_spk,
        }
      : null,
    features: {
      spa: true,
      ssr_shell: true,
      dense_spk_api: true,
      window_shortlist_api: true,
      ai_chat: true,
      ai_models: true,
      note: 'Planning physics runs in the browser; App Hosting provides SSR shell, dense-SPK API, AI chat proxy, and plan jobs. Not flight-certified.',
    },
    ollamaConfigured: Boolean(process.env.OLLAMA_API_KEY),
    ai: {
      core: true,
      ollamaConfigured: Boolean(process.env.OLLAMA_API_KEY),
      defaultModel: process.env.OLLAMA_MODEL || 'gemma4:31b-cloud',
      modelsEndpoint: '/api/models',
      chatEndpoint: '/api/chat',
    },
  });
}
