/**
 * HELIOS Cloud Functions — planning helpers (educational).
 * Not flight-certified OD / not range safety.
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
    ],
    timestamp: new Date().toISOString(),
  });
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
