// Illustrative Falcon 9 payload vs C3 table (concept-grade, not SpaceX certified).
// C3 in km²/s²; payload in kg. Interplanetary path uses C3 ≥ 0 only (K20).
// Source note: educational knots shaped after public order-of-magnitude performance
// discussions — not a User's Guide extract and not a performance guarantee.

export const F9_DISCLAIMER =
  'Illustrative Falcon 9 payload-vs-C3 model for education only — not SpaceX performance data or warranty.';

/** ASDS / recovery derate on max payload (K4). */
export const F9_ASDS_DERATE = 0.65;

/**
 * Expendable-class knots: C3 (km²/s²) → max payload (kg).
 * LEO-ish negative C3 excluded from interplanetary evaluation.
 */
export const F9_C3_PAYLOAD_KG = [
  { c3_km2_s2: 0, payload_kg: 5500 },
  { c3_km2_s2: 10, payload_kg: 4200 },
  { c3_km2_s2: 20, payload_kg: 3100 },
  { c3_km2_s2: 30, payload_kg: 2200 },
  { c3_km2_s2: 40, payload_kg: 1500 },
  { c3_km2_s2: 50, payload_kg: 950 },
  { c3_km2_s2: 60, payload_kg: 550 },
  { c3_km2_s2: 80, payload_kg: 200 },
  { c3_km2_s2: 100, payload_kg: 50 },
];

/**
 * Linear interpolation of payload for C3 ≥ 0.
 * @param {number} c3_m2_s2 C3 in m²/s²
 * @param {'expendable'|'asds'} variant
 * @returns {number|null} max payload kg
 */
export function falcon9MaxPayloadKg(c3_m2_s2, variant = 'expendable') {
  if (c3_m2_s2 == null || !isFinite(c3_m2_s2)) return null;
  // m²/s² → km²/s²
  const c3 = c3_m2_s2 / 1e6;
  if (c3 < 0) return null; // interplanetary path ignores LEO-only knots

  const knots = F9_C3_PAYLOAD_KG;
  if (c3 <= knots[0].c3_km2_s2) {
    return applyVariant(knots[0].payload_kg, variant);
  }
  if (c3 >= knots[knots.length - 1].c3_km2_s2) {
    return applyVariant(knots[knots.length - 1].payload_kg, variant);
  }
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i], b = knots[i + 1];
    if (c3 >= a.c3_km2_s2 && c3 <= b.c3_km2_s2) {
      const t = (c3 - a.c3_km2_s2) / (b.c3_km2_s2 - a.c3_km2_s2);
      const p = a.payload_kg + t * (b.payload_kg - a.payload_kg);
      return applyVariant(p, variant);
    }
  }
  return null;
}

function applyVariant(payload, variant) {
  if (variant === 'asds') return payload * F9_ASDS_DERATE;
  return payload;
}

export function falcon9EarthDepartureOnly(originBody) {
  if (!originBody) return false;
  if (originBody.parent) return false; // moon
  const n = (originBody.name || '').toLowerCase();
  const id = (originBody.id || '').toLowerCase();
  return n === 'earth' || id === 'earth';
}
