/**
 * HELIOS Cloud Functions — planning helpers + AI proxy (classic Hosting fallback).
 * Not flight-certified OD / not range safety.
 * AI key: functions config / defineSecret OLLAMA_API_KEY when deployed.
 */
import {setGlobalOptions} from "firebase-functions/v2";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {initializeApp, getApps} from "firebase-admin/app";
import {getDatabase} from "firebase-admin/database";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {rankShortlistScored, type WindowCandidate} from "./window-score";

if (!getApps().length) {
  initializeApp();
}

setGlobalOptions({maxInstances: 10, region: "us-central1"});

const OLLAMA_TAGS = "https://ollama.com/api/tags";
const OLLAMA_CHAT = "https://ollama.com/api/chat";
const DEFAULT_AI_MODEL = process.env.OLLAMA_MODEL || "gemma4:31b-cloud";
const CURATED_MODELS = [
  "gemma4:31b-cloud",
  "gemma4:26b-cloud",
  "gpt-oss:120b-cloud",
  "gpt-oss:20b-cloud",
  "qwen3-coder:480b-cloud",
];

function cors(res: {set: (k: string, v: string) => void}): void {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function ollamaKey(): string | null {
  return process.env.OLLAMA_API_KEY || null;
}

/** Health probe for ops. */
export const heliosHealth = onRequest((_req, res) => {
  res.json({
    ok: true,
    service: "helios-functions",
    product_class: "preliminary-not-flight-certified",
    features: [
      "refineWindowShortlist-scored",
      "heliosHealth",
      "denseSpkCatalog",
      "heliosAiModels",
      "heliosAiChat",
    ],
    ollamaConfigured: Boolean(ollamaKey()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * List Ollama Cloud models for classic Hosting SPA fallback.
 * Set OLLAMA_API_KEY on the function runtime.
 */
export const heliosAiModels = onRequest(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ok: false, error: "GET only"});
    return;
  }
  const key = ollamaKey();
  let liveModels: object[] = [];
  let live = false;
  let error: string | null = null;
  if (key) {
    try {
      const upstream = await fetch(OLLAMA_TAGS, {
        headers: {Authorization: `Bearer ${key}`, Accept: "application/json"},
      });
      const data = await upstream.json() as {models?: {name?: string; model?: string; size?: number; details?: unknown}[]; error?: string};
      if (!upstream.ok) {
        error = data.error || `tags HTTP ${upstream.status}`;
      } else {
        live = true;
        liveModels = (data.models || []).map((m) => ({
          name: m.name || m.model,
          model: m.model || m.name,
          size: m.size ?? null,
          details: m.details ?? null,
          source: "ollama-cloud-tags",
        }));
      }
    } catch (err) {
      error = String(err);
    }
  } else {
    error = "OLLAMA_API_KEY not set on Cloud Functions";
  }
  const by = new Map<string, object>();
  for (const m of liveModels as {name?: string}[]) {
    if (m?.name) by.set(m.name, m);
  }
  for (const name of CURATED_MODELS) {
    if (!by.has(name)) by.set(name, {name, model: name, source: "curated-fallback"});
  }
  if (!by.has(DEFAULT_AI_MODEL)) {
    by.set(DEFAULT_AI_MODEL, {name: DEFAULT_AI_MODEL, model: DEFAULT_AI_MODEL, source: "env-default"});
  }
  res.json({
    ok: true,
    defaultModel: DEFAULT_AI_MODEL,
    live,
    error,
    count: by.size,
    models: [...by.values()],
    host: "cloud-functions",
  });
});

/**
 * Ollama Cloud chat proxy for classic Hosting SPA fallback.
 */
export const heliosAiChat = onRequest(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ok: false, error: "POST only"});
    return;
  }
  const key = ollamaKey();
  if (!key) {
    res.status(503).json({error: "OLLAMA_API_KEY not set on Cloud Functions"});
    return;
  }
  const body = req.body || {};
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({error: "messages[] required"});
    return;
  }
  const model = typeof body.model === "string" && body.model.length < 128
    ? body.model
    : DEFAULT_AI_MODEL;
  const stream = body.stream === true && !body.tools;
  const payload: Record<string, unknown> = {model, messages, stream};
  if (body.tools) payload.tools = body.tools;

  try {
    const upstream = await fetch(OLLAMA_CHAT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (stream) {
      if (!upstream.ok) {
        const t = await upstream.text();
        res.status(upstream.status).json({error: t.slice(0, 500)});
        return;
      }
      res.set("Content-Type", "application/x-ndjson; charset=utf-8");
      res.set("Cache-Control", "no-store");
      const reader = upstream.body?.getReader();
      if (!reader) {
        res.status(502).json({error: "no stream body"});
        return;
      }
      const decoder = new TextDecoder();
      // Node 18+ ReadableStream from fetch
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, {stream: true}));
      }
      res.end();
      return;
    }

    const text = await upstream.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      data = {raw: text};
    }
    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: (data.error as string) || (data.message as string) || `Ollama ${upstream.status}`,
      });
      return;
    }
    data.helios = {
      model,
      host: "cloud-functions",
      usage: {
        total_duration: data.total_duration ?? null,
        load_duration: data.load_duration ?? null,
        prompt_eval_count: data.prompt_eval_count ?? null,
        prompt_eval_duration: data.prompt_eval_duration ?? null,
        eval_count: data.eval_count ?? null,
        eval_duration: data.eval_duration ?? null,
      },
    };
    res.json(data);
  } catch (err) {
    logger.error("heliosAiChat", err);
    res.status(502).json({error: String(err)});
  }
});

/**
 * Dense SPICE pack catalog for clients (educational ephemeris CDN index).
 * Prefers RTDB public/denseSpk/registry, then Firestore helios/denseSpkCatalog.
 * Optionally lists Storage objects under ephemeris/dense-spk/.
 */
export const denseSpkCatalog = onRequest(async (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "public, max-age=300");
  try {
    let registry: Record<string, unknown> | null = null;
    try {
      const snap = await getDatabase().ref("public/denseSpk/registry").get();
      if (snap.exists()) {
        registry = snap.val() as Record<string, unknown>;
        registry.source = "rtdb";
      }
    } catch (err) {
      logger.warn("denseSpkCatalog RTDB", err);
    }
    if (!registry) {
      try {
        const doc = await getFirestore().doc("helios/denseSpkCatalog").get();
        if (doc.exists) {
          registry = doc.data() as Record<string, unknown>;
          registry.source = "firestore";
        }
      } catch (err) {
        logger.warn("denseSpkCatalog Firestore", err);
      }
    }

    let storageFiles: string[] = [];
    try {
      const bucket = getStorage().bucket();
      const [files] = await bucket.getFiles({prefix: "ephemeris/dense-spk/"});
      storageFiles = files.map((f) => f.name.replace("ephemeris/dense-spk/", ""));
    } catch (err) {
      logger.warn("denseSpkCatalog Storage list", err);
    }

    res.json({
      ok: true,
      product_class: "preliminary-not-flight-certified",
      storage_prefix: "ephemeris/dense-spk",
      registry,
      storage_files: storageFiles,
      note:
        "Dense SPICE packs are educational sample tables (Float32). "
        + "Not flight-certified OD. Clients may also use Hosting fallback.",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("denseSpkCatalog", err);
    res.status(500).json({ok: false, error: String(err)});
  }
});

/**
 * Re-rank / score client window shortlist on the server.
 * Accepts already neighborhood-refined client candidates; applies multi-objective
 * score (Δv + mild C3 + TOF mid preference + multi-rev penalty) and dep-day diversity.
 * RTDB write requires auth when save=true.
 */
export const refineWindowShortlist = onCall(async (request) => {
  const data = request.data as {
    origin?: string;
    dest?: string;
    candidates?: WindowCandidate[];
    fidelity?: string;
    save?: boolean;
    minDepDayGap?: number;
    topN?: number;
  };
  const origin = data?.origin;
  const dest = data?.dest;
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  if (!origin || !dest || candidates.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "Need origin, dest, candidates[]",
    );
  }

  const ranked = rankShortlistScored(candidates, {
    topN: data.topN ?? 12,
    minDepDayGap: data.minDepDayGap ?? 5,
  });

  logger.info("refineWindowShortlist", {
    origin,
    dest,
    n: ranked.length,
    uid: request.auth?.uid || null,
    best_dv: ranked[0]?.dv_m_s ?? null,
    best_score: ranked[0]?.score ?? null,
  });

  let campaignId: string | null = null;
  if (data.save && request.auth?.uid) {
    const db = getDatabase();
    const ref = db.ref(`users/${request.auth.uid}/windowCampaigns`).push();
    await ref.set({
      origin,
      dest,
      fidelity: data.fidelity || "server-score",
      backend: "client-candidates-scored",
      shortlist: ranked,
      product_class: "preliminary-not-flight-certified",
      at: Date.now(),
      label: `${origin} → ${dest}`,
      source: "cloud-function-scored",
    });
    campaignId = ref.key;
  }

  return {
    ok: true,
    origin,
    dest,
    shortlist: ranked,
    campaignId,
    product_class: "preliminary-not-flight-certified",
    refine_mode: "multi-objective-score+diversity",
    note:
      "Server scored client candidates (Δv/C3/TOF/diversity) — not global optimization, not certified. "
      + "Client neighborhood Lambert refine is the physics recompute path.",
  };
});
