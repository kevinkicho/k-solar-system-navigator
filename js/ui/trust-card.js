/**
 * Concept-grade Trust Card — single honesty surface for plan results.
 */

/**
 * @param {object|null} dossier
 * @param {object} fidelity { fidelityLevel, ephemerisBackend }
 * @returns {string} HTML
 */
export function trustCardHtml(dossier, fidelity = {}) {
  const fid = fidelity.fidelityLevel || dossier?.fidelity?.fidelityLevel || 'L1';
  const be = fidelity.ephemerisBackend || dossier?.fidelity?.ephemerisBackend || 'approx';
  const conf = dossier?.confidence_0_100;
  const ready = dossier?.mission_ready;
  const status = dossier?.status || '—';

  const geoCs = dossier?.inputs?.coordinate_system
    || dossier?.geometry?.coordinate_system
    || 'planetocentric+eastlon+h_above_ref';
  const geoO = dossier?.inputs?.geographic_origin?.active || dossier?.geometry?.geographic_origin?.active;
  const geoD = dossier?.inputs?.geographic_destination?.active || dossier?.geometry?.geographic_destination?.active;
  const geoNote = (geoO || geoD)
    ? `Sites active · CS ${geoCs}`
    : `Optional sites · CS ${geoCs} (body-center when off)`;

  return `
    <div class="trust-card" id="trust-card">
      <div class="result-subtitle">TRUST & CONCEPT-GRADE SUMMARY</div>
      <div class="info-row"><span class="key">Product class</span><span class="val amber">Educational / concept-grade — not flight operations</span></div>
      <div class="info-row"><span class="key">Ephemeris</span><span class="val">${fid} · backend ${be} — not SPICE navigation</span></div>
      <div class="info-row"><span class="key">Dynamics</span><span class="val">2-body Lambert / patched-conic — not n-body OD</span></div>
      <div class="info-row"><span class="key">Vehicles</span><span class="val">Illustrative SH / Starship / F9 — not SpaceX-certified</span></div>
      <div class="info-row"><span class="key">Geographic sites</span><span class="val" style="font-size:9px">${geoNote} — not survey / not SPICE body-fixed PCK</span></div>
      <div class="info-row"><span class="key">Asymptotes / launch</span><span class="val" style="font-size:9px">Ecliptic + Earth-eq DLA (mean obliquity) · edu site bands — not range safety</span></div>
      <div class="info-row"><span class="key">Multi-leg windows</span><span class="val" style="font-size:9px">Coarse or thorough local seed — not global mission optimization</span></div>
      <div class="info-row"><span class="key">Plan status</span><span class="val">${status}${ready === true ? ' · mission_ready YES' : ready === false ? ' · mission_ready NO' : ''}</span></div>
      <div class="info-row"><span class="key">Confidence</span><span class="val">${conf != null ? `${conf} (${dossier?.confidence_label || '—'})` : '—'} · completeness only, not covariance</span></div>
      <div class="info-row"><span class="key">Ascent losses</span><span class="val" style="font-size:9px">Optional class budget — not integrated 6DOF ascent</span></div>
      <div class="info-row"><span class="key">L3 path</span><span class="val" style="font-size:9px">SPICE/DE/OD not a mode — use L2-plan samples + Horizons compare for educational DE-class checks</span></div>
    </div>`;
}
