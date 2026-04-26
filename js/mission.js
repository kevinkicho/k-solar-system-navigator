import { state } from './state.js';
import { getSunBarycentricOffset } from './physics/kepler.js';
import { getShipPositionOnTransfer } from './physics/routing.js';
import {
  addTrailPoint, resetTrail, shipGroup, shipLabelDiv, trailLine,
} from './scene/ship.js';
import {
  flybyMarkers, hideArrivalGhost, hideDepartureGhost, transferMarkers,
} from './scene/transfer-visual.js';
import { formatDateShort, formatTimePrecise, notify, simTimeToDate } from './ui/format.js';
import { renderRouteUI } from './ui/route-display.js';
import { timeState } from './ui/time-system.js';
import { MAX_TRAIL_POINTS } from './constants.js';

export function launchMission() {
  const td = state.transferData;
  if (!td) return;
  if (td.isMultiLeg && !td.allLegsOk) {
    notify('CANNOT LAUNCH: some legs failed Lambert'); return;
  }

  const m = state.mission;
  m.active = true;
  m.arrived = false;
  m.departureSimTime = td.departureSimTime;
  m.arrivalSimTime = td.arrivalSimTime;
  m.transferData = td;
  m.lastTrailTime = m.departureSimTime;
  m.currentLegIndex = -1;
  m.flybysTriggered = new Set();

  timeState.simTime = m.departureSimTime;
  timeState.setSpeed(6); // 1 month/s — good default for interplanetary

  resetTrail();
  shipGroup.visible = true;

  const isMulti = !!td.isMultiLeg;
  const legRow = isMulti
    ? `<div class="info-row"><span class="key">Leg</span><span class="val highlight" id="mission-leg">—</span></div>`
    : '';

  const mc = document.getElementById('mission-controls');
  mc.innerHTML = `
    <div class="mission-status" id="mission-status-box">
      <h4>MISSION IN PROGRESS</h4>
      <div class="info-row"><span class="key">From</span><span class="val green">${td.body1.name}</span></div>
      <div class="info-row"><span class="key">To</span><span class="val amber">${td.body2.name}</span></div>
      <div class="info-row"><span class="key">Departed</span><span class="val">${formatDateShort(simTimeToDate(m.departureSimTime))}</span></div>
      <div class="info-row"><span class="key">ETA</span><span class="val highlight" id="mission-eta">${formatDateShort(simTimeToDate(m.arrivalSimTime))}</span></div>
      ${legRow}
      <div class="progress-bar-wrap"><div class="progress-bar" id="mission-progress" style="width:0%"></div></div>
      <div class="info-row"><span class="key">Progress</span><span class="val" id="mission-pct">0%</span></div>
      <div class="info-row"><span class="key">Time remaining</span><span class="val highlight" id="mission-remaining">--</span></div>
    </div>
    <button class="route-btn abort" id="btn-abort">Abort Mission</button>
  `;
  document.getElementById('btn-abort').onclick = abortMission;

  const label = isMulti
    ? `MULTI-LEG MISSION LAUNCHED: ${td.body1.name.toUpperCase()} -> ${td.body2.name.toUpperCase()} (${td.legs.length} LEGS)`
    : `MISSION LAUNCHED: ${td.body1.name.toUpperCase()} -> ${td.body2.name.toUpperCase()}`;
  notify(label);
}

export function abortMission() {
  const m = state.mission;
  if (!m.active) return;
  m.active = false;
  m.arrived = false;
  m.currentLegIndex = -1;
  m.flybysTriggered = new Set();
  shipGroup.visible = false;
  trailLine.visible = false;
  resetTrail();
  // Re-show the rendezvous markers if we still have transferData — abort
  // doesn't clear the route, so the user may want to re-launch.
  if (state.transferData && state.showTransferOrbit) {
    // Re-render transfer visuals (which re-creates depart/arrival ghosts).
    import('./ui/route-display.js').then(({ updateTransferOrbitVisual }) => {
      updateTransferOrbitVisual();
    });
  }
  for (const fm of flybyMarkers) {
    fm.scale.set(1, 1, 1);
    if (fm.material) fm.material.opacity = 0.85;
    delete fm.userData.pulseStart;
  }
  if (state.transferData) renderRouteUI();
  else document.getElementById('mission-controls').innerHTML = '';
  notify('MISSION ABORTED');
}

export function updateMission() {
  const m = state.mission;
  if (!m.active) return;

  const td = m.transferData;
  const t = timeState.simTime;
  const elapsed = t - m.departureSimTime;
  const progress = Math.max(0, Math.min(1, elapsed / td.transferTime));
  const isMulti = !!td.isMultiLeg;

  if (t < m.departureSimTime) { shipGroup.visible = false; return; }

  shipGroup.visible = true;

  // Arrival check: compare simTime directly to arrivalSimTime, not via
  // `progress >= 1`. The ratio elapsed/transferTime can round to just below
  // 1 (e.g. 0.9999999999999998) due to IEEE-754 ULP error even when
  // simTime exactly equals arrivalSimTime — that race causes the arrival
  // pause to miss its intended frame, and time overshoots.
  if (timeState.simTime >= m.arrivalSimTime && !m.arrived) {
    m.arrived = true;
    timeState.setSpeed(3);
    notify(`ARRIVED AT ${td.body2.name.toUpperCase()}`);
    // Hide the rendezvous markers — they were aids for the pre-flight view.
    // Once arrived, ship & destination coincide, so the markers become
    // misleading if the user later scrubs time forward.
    hideArrivalGhost();
    hideDepartureGhost();
    transferMarkers.arrive.visible = false;
    transferMarkers.depart.visible = false;

    const box = document.getElementById('mission-status-box');
    if (box) {
      box.classList.add('arrived');
      box.querySelector('h4').textContent = 'MISSION COMPLETE';
    }
  }

  let shipInfo = null;
  if (progress < 1) {
    shipInfo = getShipPositionOnTransfer(m.departureSimTime, td, t);
    if (shipInfo) {
      const off = getSunBarycentricOffset(t);
      const sx = shipInfo.x + off.x, sy = shipInfo.y + off.y, sz = shipInfo.z + off.z;
      shipGroup.position.set(sx, sy, sz);

      const trailInterval = td.transferTime / MAX_TRAIL_POINTS;
      if (t - m.lastTrailTime >= trailInterval) {
        addTrailPoint(sx, sy, sz);
        m.lastTrailTime = t;
      }
      shipLabelDiv.textContent = `SHIP ${Math.round(progress * 100)}%`;
    }
  } else {
    const destPos = state.bodyPositions.get(td.body2.name);
    if (destPos) shipGroup.position.set(destPos.x, destPos.y, destPos.z);
    shipLabelDiv.textContent = 'ARRIVED';
  }

  if (isMulti && shipInfo && typeof shipInfo.legIndex === 'number') {
    const newLeg = shipInfo.legIndex;
    if (newLeg !== m.currentLegIndex && newLeg > m.currentLegIndex) {
      const flybyIdx = newLeg - 1;
      if (flybyIdx >= 0 && flybyIdx < flybyMarkers.length && !m.flybysTriggered.has(flybyIdx)) {
        m.flybysTriggered.add(flybyIdx);
        flybyMarkers[flybyIdx].userData.pulseStart = performance.now();
        const wp = td.waypoints[flybyIdx + 1];
        if (wp) notify(`FLYBY: ${wp.body.name.toUpperCase()}`);
      }
      m.currentLegIndex = newLeg;
    }
    const legEl = document.getElementById('mission-leg');
    if (legEl) {
      const li = shipInfo.legIndex, L = td.legs[li];
      legEl.textContent = `${li + 1}/${td.legs.length} · ${L.from} → ${L.to} · ${Math.round(shipInfo.legProgress * 100)}%`;
    }
  }

  const pctEl = document.getElementById('mission-pct');
  const barEl = document.getElementById('mission-progress');
  const remEl = document.getElementById('mission-remaining');
  if (pctEl) pctEl.textContent = Math.round(progress * 100) + '%';
  if (barEl) barEl.style.width = Math.round(progress * 100) + '%';
  if (remEl) {
    const remaining = Math.max(0, td.transferTime - elapsed);
    remEl.textContent = remaining > 0 ? formatTimePrecise(remaining) : 'ARRIVED';
  }
}

// Animate any flyby marker with a pulseStart timestamp set by updateMission.
export function updateFlybyPulses(nowMs) {
  for (const fm of flybyMarkers) {
    const t0 = fm.userData.pulseStart;
    if (!t0) continue;
    const age = (nowMs - t0) / 1000;
    if (age < 1.5) {
      const s = 1 + 1.8 * Math.exp(-age * 2.5) * Math.abs(Math.sin(age * 9));
      fm.scale.set(s, s, s);
      if (fm.material) fm.material.opacity = Math.min(1, 0.85 + 0.6 * Math.exp(-age * 2));
    } else {
      fm.scale.set(1, 1, 1);
      if (fm.material) fm.material.opacity = 0.85;
      delete fm.userData.pulseStart;
    }
  }
}

