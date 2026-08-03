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
  const be = fidelity.ephemerisBackend || dossier?.fidelity?.ephemerisBackend || 'sample-de';
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
      <div class="result-subtitle">TRUST & PRELIMINARY DESIGN SUMMARY</div>
      <div class="info-row"><span class="key">Product class</span><span class="val amber">Industrial preliminary mission design — <strong>not flight-certified</strong>, not range safety, not operational OD</span></div>
      <div class="info-row"><span class="key">Ephemeris</span><span class="val">${fid} · backend ${be} — offline tables / dense SPK; not live SPICE runtime</span></div>
      <div class="info-row"><span class="key">Dynamics</span><span class="val">2-body Lambert / patched-conic (+ optional n-body residual) — not certified OD</span></div>
      <div class="info-row"><span class="key">Vehicles</span><span class="val">Engineering models (SH / Starship / F9) — not SpaceX performance warranty</span></div>
      <div class="info-row"><span class="key">Geographic sites</span><span class="val" style="font-size:9px">${geoNote} — IAU-class tables, not survey / not full SPICE PCK</span></div>
      <div class="info-row"><span class="key">Asymptotes / launch</span><span class="val" style="font-size:9px">Ecliptic + Earth-eq DLA · site plane/dogleg — not range safety products</span></div>
      <div class="info-row"><span class="key">Multi-leg windows</span><span class="val" style="font-size:9px">Local neighborhood seed / refine — not global multi-leg optimum</span></div>
      <div class="info-row"><span class="key">Plan status</span><span class="val">${status}${ready === true ? ' · mission_ready YES' : ready === false ? ' · mission_ready NO' : ''}</span></div>
      <div class="info-row"><span class="key">Confidence</span><span class="val">${conf != null ? `${conf} (${dossier?.confidence_label || '—'})` : '—'} · analysis completeness only, not navigation covariance</span></div>
      <div class="info-row"><span class="key">Ascent losses</span><span class="val" style="font-size:9px">Optional class budget — not integrated 6DOF ascent</span></div>
      <div class="info-row"><span class="key">L3-plan / dense SPK</span><span class="val" style="font-size:9px">DE440s-baked sample table + dense Float32 packs — not live .bsp</span></div>
    </div>`;
}
