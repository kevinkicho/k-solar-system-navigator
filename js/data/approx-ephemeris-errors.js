/**
 * Nominal accuracy of JPL "Approximate Positions of Major Planets" (1800–2050).
 * Source: https://ssd.jpl.nasa.gov/planets/approx_pos.html
 * These are published *nominal* errors — not formal 1σ covariances, not DE440 accuracy.
 *
 * λ = heliocentric longitude (arcsec)
 * φ = heliocentric latitude (arcsec)
 * rho_1000km = heliocentric distance (units of 1000 km)
 */

export const APPROX_EPHEMERIS_ERROR_SOURCE =
  'JPL SSD Approximate Positions of the Planets (1800 AD – 2050 AD nominal errors)';

export const APPROX_EPHEMERIS_ERROR_URL =
  'https://ssd.jpl.nasa.gov/planets/approx_pos.html';

/** @type {Record<string, { lambda_arcsec: number, phi_arcsec: number, rho_1000km: number, label: string }>} */
export const APPROX_ERRORS_1800_2050 = {
  mercury: { lambda_arcsec: 15, phi_arcsec: 1, rho_1000km: 1, label: 'Mercury' },
  venus: { lambda_arcsec: 20, phi_arcsec: 1, rho_1000km: 4, label: 'Venus' },
  earth: { lambda_arcsec: 20, phi_arcsec: 8, rho_1000km: 6, label: 'Earth (EM bary class)' },
  em_bary: { lambda_arcsec: 20, phi_arcsec: 8, rho_1000km: 6, label: 'EM barycenter' },
  mars: { lambda_arcsec: 40, phi_arcsec: 2, rho_1000km: 25, label: 'Mars' },
  jupiter: { lambda_arcsec: 400, phi_arcsec: 10, rho_1000km: 600, label: 'Jupiter' },
  saturn: { lambda_arcsec: 600, phi_arcsec: 25, rho_1000km: 1500, label: 'Saturn' },
  uranus: { lambda_arcsec: 50, phi_arcsec: 2, rho_1000km: 1000, label: 'Uranus' },
  neptune: { lambda_arcsec: 10, phi_arcsec: 1, rho_1000km: 200, label: 'Neptune' },
};

/**
 * Resolve a HELIOS body to an error entry.
 * @param {{ id?: string, name?: string }|string|null} body
 * @returns {{ lambda_arcsec: number, phi_arcsec: number, rho_1000km: number, label: string }|null}
 */
export function approxErrorForBody(body) {
  if (body == null) return null;
  const raw = typeof body === 'string'
    ? body
    : (body.id || body.name || '');
  const key = String(raw).toLowerCase().trim().replace(/\s+/g, '_');
  if (APPROX_ERRORS_1800_2050[key]) return APPROX_ERRORS_1800_2050[key];
  // Common aliases
  if (key === 'terra') return APPROX_ERRORS_1800_2050.earth;
  return null;
}

/**
 * Compact human-readable error summary for UI.
 * @param {{ id?: string, name?: string }|string|null} body
 * @returns {string}
 */
export function formatApproxErrorSummary(body) {
  const e = approxErrorForBody(body);
  if (!e) return 'n/a (no JPL approx error class for this body)';
  const rhoKm = e.rho_1000km * 1000;
  const rhoStr = rhoKm >= 1e6
    ? `${(rhoKm / 1e6).toFixed(1)} M km`
    : rhoKm >= 1000
      ? `${(rhoKm / 1000).toFixed(0)} ×10³ km`
      : `${rhoKm} km`;
  return `${e.label}: λ≈${e.lambda_arcsec}″ · φ≈${e.phi_arcsec}″ · ρ≈${rhoStr} (nominal)`;
}
