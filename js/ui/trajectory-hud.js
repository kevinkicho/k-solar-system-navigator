/**
 * On-screen trajectory / scale HUD — AU distances, path residual, mode honesty.
 */
import { state } from '../state.js';
import { isSchematic } from '../display-scale.js';
import {
  buildTransferPathSamples, sampleTransferPathAtTime,
} from '../physics/transfer-path.js';
import { getShipPositionOnTransfer } from '../physics/routing.js';
import { timeState } from './time-system.js';

let lastHudMs = 0;

export function ensureTrajectoryHud() {
  let el = document.getElementById('trajectory-hud');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'trajectory-hud';
  el.className = 'trajectory-hud';
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <div class="thud-row" id="thud-mode">VIEW: —</div>
    <div class="thud-row" id="thud-eph">EPH: —</div>
    <div class="thud-row" id="thud-path">PATH: —</div>
    <div class="thud-row" id="thud-r">r: —</div>
    <div class="thud-row" id="thud-res">RES: —</div>
    <div class="thud-note">Numbers always physical · path is Kepler conic (not SPICE)</div>
  `;
  document.body.appendChild(el);
  return el;
}

/**
 * Lightweight residual: max |ship−path| at a few equal-time knots (AU).
 * @returns {{ maxAU: number|null, samples: number, note: string }}
 */
export function measurePathResidual(td) {
  if (!td || td.isMultiLeg) {
    return { maxAU: null, samples: 0, note: td?.isMultiLeg ? 'multi-leg residual N/A' : 'no transfer' };
  }
  const geom = state.pathGeometry === 'physical' ? 'physical' : 'visual';
  const opts = {
    geometry: geom,
    exaggerate: geom !== 'physical',
    sampleMode: state.pathSampleMode || 'equal_time',
    offsetPolicy: state.pathOffsetPolicy || 'time_varying',
    nSamples: 8,
  };
  const t0 = td.departureSimTime;
  const T = td.transferTime;
  if (t0 == null || !(T > 0)) return { maxAU: null, samples: 0, note: 'no TOF' };

  let maxAU = 0;
  let n = 0;
  const fracs = [0, 0.25, 0.5, 0.75, 1];
  for (const f of fracs) {
    const t = t0 + f * T;
    const path = sampleTransferPathAtTime(td, t, opts);
    const ship = getShipPositionOnTransfer(t0, td, t);
    if (!path || !ship) continue;
    const dx = path.x - ship.x;
    const dy = path.y - ship.y;
    const dz = path.z - ship.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > maxAU) maxAU = d;
    n++;
  }
  return {
    maxAU: n ? maxAU : null,
    samples: n,
    note: n ? 'ship–line same-t residual' : 'no samples',
  };
}

/** Helio r of selected body or ship (AU). */
function currentRadiusAU() {
  if (state.mission?.active && state.mission?.transferData) {
    const m = state.mission;
    const ship = getShipPositionOnTransfer(
      m.departureSimTime, m.transferData, timeState.simTime,
    );
    if (ship) return Math.sqrt(ship.x * ship.x + ship.y * ship.y + ship.z * ship.z);
  }
  const name = state.selectedBody?.name;
  if (name && state.bodyPositions?.has(name)) {
    const p = state.bodyPositions.get(name);
    if (p?.r != null) return p.r;
    if (p) return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
  }
  return null;
}

function ephLabel() {
  if (state.classroomMode) return 'L1 approx (classroom)';
  if (state.ephemerisBackend === 'sample-de') return 'sample-de (L2-plan class)';
  const f = state.fidelityLevel || 'L1';
  return `${f} · approx`;
}

function pathLabel(td) {
  if (!td) return 'idle';
  const g = state.pathGeometry || 'visual';
  const mode = state.display?.mode || 'cinematic';
  const ribbon = state.showTransferRibbon ? '+ribbon' : '';
  return `Kepler conic · ${g}${ribbon} · ${mode}`;
}

/**
 * Throttled HUD refresh (call from animation loop).
 * @param {number} nowMs
 */
export function updateTrajectoryHud(nowMs = performance.now()) {
  if (nowMs - lastHudMs < 200) return;
  lastHudMs = nowMs;
  const el = ensureTrajectoryHud();
  if (!el) return;

  const modeEl = document.getElementById('thud-mode');
  const ephEl = document.getElementById('thud-eph');
  const pathEl = document.getElementById('thud-path');
  const rEl = document.getElementById('thud-r');
  const resEl = document.getElementById('thud-res');

  if (modeEl) {
    if (state.mapMode) modeEl.textContent = 'VIEW: MAP · dual path';
    else if (isSchematic()) modeEl.textContent = 'VIEW: SCHEMATIC';
    else modeEl.textContent = 'VIEW: CINEMATIC ×incl/wobble';
  }
  if (ephEl) ephEl.textContent = `EPH: ${ephLabel()}`;

  const td = state.transferData;
  if (pathEl) pathEl.textContent = `PATH: ${pathLabel(td)}`;

  const r = currentRadiusAU();
  if (rEl) {
    rEl.textContent = r != null && isFinite(r)
      ? `r: ${r.toFixed(4)} AU`
      : 'r: —';
  }

  if (resEl) {
    if (td && !td.isMultiLeg && (td.lambertOk || td.orbit || td.orbitPhysical)) {
      const res = measurePathResidual(td);
      if (res.maxAU != null) {
        const good = res.maxAU < 1e-4;
        resEl.textContent = `RES: ${res.maxAU.toExponential(2)} AU ${good ? '✓' : ''}`;
        resEl.title = res.note;
        resEl.classList.toggle('thud-ok', good);
        resEl.classList.toggle('thud-warn', !good && res.maxAU > 1e-3);
      } else {
        resEl.textContent = 'RES: —';
      }
    } else {
      resEl.textContent = 'RES: —';
    }
  }
}

export function wireTrajectoryHud() {
  ensureTrajectoryHud();
  updateTrajectoryHud();
}

/** Path length in AU from samples (for scale legend). */
export function pathLengthAU(td) {
  if (!td || td.isMultiLeg) return null;
  const geom = state.pathGeometry === 'physical' ? 'physical' : 'visual';
  const built = buildTransferPathSamples(td, {
    geometry: geom,
    exaggerate: geom !== 'physical',
    nSamples: 64,
    offsetPolicy: state.pathOffsetPolicy || 'time_varying',
  });
  const pts = built?.points;
  if (!pts || pts.length < 2) return null;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    len += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return len;
}
