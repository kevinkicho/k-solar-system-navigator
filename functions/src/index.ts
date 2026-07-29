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
    timestamp: new Date().toISOString(),
  });
});

type Candidate = {
  rank?: number;
  dep_iso?: string;
  tof_days?: number;
  dv_m_s?: number;
  c3_m2_s2?: number | null;
  revolutions?: number;
};

/**
 * Re-rank client window shortlist on the server (auth optional for read rank;
 * RTDB write requires auth).
 */
export const refineWindowShortlist = onCall(async (request) => {
  const data = request.data as {
    origin?: string;
    dest?: string;
    candidates?: Candidate[];
    fidelity?: string;
    save?: boolean;
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

  const ranked = [...candidates]
    .filter((c) => Number.isFinite(Number(c.dv_m_s)))
    .sort((a, b) => Number(a.dv_m_s) - Number(b.dv_m_s))
    .slice(0, 12)
    .map((c, i) => ({...c, rank: i + 1}));

  logger.info("refineWindowShortlist", {
    origin,
    dest,
    n: ranked.length,
    uid: request.auth?.uid || null,
  });

  let campaignId: string | null = null;
  if (data.save && request.auth?.uid) {
    const db = getDatabase();
    const ref = db.ref(`users/${request.auth.uid}/windowCampaigns`).push();
    await ref.set({
      origin,
      dest,
      fidelity: data.fidelity || "server-rank",
      backend: "client-candidates",
      shortlist: ranked,
      product_class: "preliminary-not-flight-certified",
      at: Date.now(),
      label: `${origin} → ${dest}`,
      source: "cloud-function",
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
    note: "Server re-ranked client candidates — not global optimization, not certified.",
  };
});
