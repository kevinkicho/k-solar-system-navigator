/**
 * HTML block for vehicle engineering sheet (Measurement Card).
 */
import { formatVelocity } from './format.js';
import { buildVehicleEngineeringReport } from '../physics/vehicle-performance.js';

function fmtKg(kg) {
  if (kg == null || !isFinite(kg)) return '—';
  if (Math.abs(kg) >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}

function fmtG(g) {
  if (g == null || !isFinite(g)) return '—';
  return `${g.toFixed(2)} g`;
}

function fmtTw(t) {
  if (t == null || !isFinite(t)) return '—';
  return t.toFixed(2);
}

function stageRows(s) {
  return `
    <div class="info-row"><span class="key">Stage</span><span class="val green">${s.name}</span></div>
    <div class="info-row"><span class="key">Dry / prop / wet</span><span class="val">${fmtKg(s.dryMass_kg)} / ${fmtKg(s.propellantMass_kg)} / ${fmtKg(s.wetMass_kg)}</span></div>
    <div class="info-row"><span class="key">Payload on stage</span><span class="val">${fmtKg(s.payload_kg)}</span></div>
    <div class="info-row"><span class="key">Isp · engines</span><span class="val">${s.isp_s} s · ${s.numEngines ?? '—'}</span></div>
    <div class="info-row"><span class="key">Thrust</span><span class="val">${(s.thrust_N / 1e6).toFixed(2)} MN</span></div>
    <div class="info-row"><span class="key">Ideal stage Δv</span><span class="val amber">${s.idealDv_m_s != null ? formatVelocity(s.idealDv_m_s) : '—'}</span></div>
    <div class="info-row"><span class="key">T/W liftoff · a</span><span class="val">${fmtTw(s.twr_liftoff)} · ${fmtG(s.accel_liftoff_g)}</span></div>
    <div class="info-row"><span class="key">T/W burnout · a</span><span class="val">${fmtTw(s.twr_burnout)} · ${fmtG(s.accel_burnout_g)}</span></div>
    <div style="height:6px"></div>`;
}

/**
 * @param {object} stateSlice vehicle fields from app state
 * @returns {string} HTML
 */
export function vehicleEngineeringHtml(stateSlice = {}) {
  const rep = buildVehicleEngineeringReport({
    vehicleId: stateSlice.vehicleId,
    starshipArch: stateSlice.starshipArch,
    tankerCount: stateSlice.tankerCount,
    cargoMass_kg: stateSlice.cargoMass_kg,
    falcon9Variant: stateSlice.falcon9Variant,
  });

  if (!rep.stages?.length) {
    return `
      <div style="height:8px"></div>
      <div class="result-subtitle">VEHICLE ENGINEERING</div>
      <div class="info-row"><span class="key">Sample rockets</span><span class="val">Select SH+Starship or Falcon 9</span></div>
      <div class="info-row"><span class="key">Note</span><span class="val" style="font-size:9px;opacity:0.8">${rep.note || ''}</span></div>`;
  }

  const env = rep.environment;
  let html = `
      <div style="height:8px"></div>
      <div class="result-subtitle">VEHICLE ENGINEERING · ${rep.label}</div>
      <div class="info-row"><span class="key">Disclaimer</span><span class="val" style="font-size:9px;opacity:0.8">${rep.disclaimer}</span></div>
      <div style="height:4px"></div>
      <div class="result-subtitle" style="font-size:8px">EARTH REFERENCE (mission context)</div>
      <div class="info-row"><span class="key">Surface g</span><span class="val">${env.surface_g_m_s2.toFixed(3)} m/s²</span></div>
      <div class="info-row"><span class="key">Surface escape vel.</span><span class="val amber">${formatVelocity(env.surface_escape_m_s)}</span></div>
      <div class="info-row"><span class="key">LEO circ. (${(env.parking_alt_m / 1000).toFixed(0)} km)</span><span class="val">${formatVelocity(env.leo_circular_m_s)}</span></div>
      <div class="info-row"><span class="key">Escape from that alt.</span><span class="val">${formatVelocity(env.leo_escape_m_s)}</span></div>
      <div class="info-row"><span class="key">Atmosphere</span><span class="val" style="font-size:9px">${env.atmosphere.sea_level}</span></div>
      <div class="info-row"><span class="key">Vacuum / upper stage</span><span class="val" style="font-size:9px">${env.atmosphere.vacuum}</span></div>
      <div class="info-row"><span class="key">Aeroassist in HELIOS</span><span class="val" style="font-size:9px">${env.atmosphere.aeroassist}</span></div>
      <div style="height:6px"></div>
      <div class="result-subtitle" style="font-size:8px">STAGES (rocket equation · ideal)</div>`;

  for (const s of rep.stages) {
    html += stageRows(s);
  }

  if (rep.falcon9) {
    html += `
      <div class="info-row"><span class="key">Ideal stack Δv sum</span><span class="val amber">${formatVelocity(rep.falcon9.stackIdealDv_m_s)}</span></div>
      <div class="info-row"><span class="key">Variant note</span><span class="val" style="font-size:9px">${rep.falcon9.asds_note}</span></div>
      <div class="info-row"><span class="key">C₃ capability</span><span class="val" style="font-size:9px">Use Need/Capability cargo table — not this ideal stack sum</span></div>`;
  }

  if (rep.superHeavy && rep.starship) {
    html += `
      <div class="info-row"><span class="key">Architecture note</span><span class="val" style="font-size:9px">${rep.stackNotes}</span></div>`;
    if (rep.starship.capabilityDv_arch_m_s != null && rep.starshipArch !== 'legacy-demo') {
      html += `<div class="info-row"><span class="key">SS cap Δv @ cargo/arch</span><span class="val green">${formatVelocity(rep.starship.capabilityDv_arch_m_s)}</span></div>`;
    }
  }

  html += `
      <div class="info-row"><span class="key">Note</span><span class="val" style="font-size:9px;opacity:0.75">Ideal rocket-eq ignores gravity/drag losses, steering, and staging coast — educational only</span></div>`;

  return html;
}
