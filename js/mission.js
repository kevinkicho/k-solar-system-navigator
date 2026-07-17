import { state } from './state.js';
import { getSunBarycentricOffset } from './physics/kepler.js';
import { getShipPositionOnTransfer } from './physics/routing.js';
import {
  addTrailPoint, resetTrail, shipGroup, shipLabelDiv, trailLine,
  setShipLabelVisible, setShipVelocityDirection,
} from './scene/ship.js';
import {
  flybyMarkers, hideArrivalGhost, hideDepartureGhost, transferMarkers,
} from './scene/transfer-visual.js';
import { DAY, MAX_TRAIL_POINTS } from './constants.js';
import {
  formatDateShort, formatTimePrecise, formatVelocity, notify, simTimeToDate,
} from './ui/format.js';
import { renderRouteUI } from './ui/route-display.js';
import {
  timeState, pickMissionStudySpeed, formatTimeCompression,
} from './ui/time-system.js';
import { canLaunchMission } from './mission-gates.js';

// Re-export for callers / tests that imported from mission.js
export { pickMissionStudySpeed, formatTimeCompression };

export function showMissionStudyBar(visible) {
  const bar = document.getElementById('mission-study-bar');
  const bottom = document.getElementById('bottom-bar');
  if (!bar) return;
  bar.hidden = !visible;
  bar.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (bottom) bottom.classList.toggle('mission-study-active', !!visible);
}

export function syncMissionStudyBar() {
  const m = state.mission;
  const scrub = document.getElementById('ms-scrub');
  const pctEl = document.getElementById('ms-pct');
  const label = document.getElementById('ms-route-label');
  if (!m.active || !m.transferData) {
    showMissionStudyBar(false);
    return;
  }
  showMissionStudyBar(true);
  const td = m.transferData;
  const span = Math.max(1, m.arrivalSimTime - m.departureSimTime);
  const t = timeState.simTime;
  const p = Math.max(0, Math.min(1, (t - m.departureSimTime) / span));
  if (scrub && document.activeElement !== scrub) {
    scrub.value = String(Math.round(p * 1000));
  }
  if (pctEl) pctEl.textContent = `${Math.round(p * 100)}%`;
  if (label) {
    const phase = m.arrived ? 'ARRIVED' : (t < m.departureSimTime ? 'PRE-DEPART' : 'IN TRANSIT');
    label.textContent = `${td.body1?.name || '?'} → ${td.body2?.name || '?'} · ${phase}`;
  }
}

export function wireMissionStudyBar() {
  const scrub = document.getElementById('ms-scrub');
  const depBtn = document.getElementById('ms-jump-dep');
  const arrBtn = document.getElementById('ms-jump-arr');
  const playStudy = document.getElementById('ms-play-study');
  if (scrub) {
    scrub.addEventListener('input', () => {
      const m = state.mission;
      if (!m.active || !m.transferData) return;
      const u = Number(scrub.value) / 1000;
      const span = m.arrivalSimTime - m.departureSimTime;
      timeState.simTime = m.departureSimTime + u * span;
      timeState.setSpeed(3); // pause while scrubbing
      timeState.updateDisplay();
      m.arrived = timeState.simTime >= m.arrivalSimTime;
      syncMissionStudyBar();
    });
  }
  if (depBtn) {
    depBtn.onclick = () => {
      const m = state.mission;
      if (!m.active) return;
      timeState.simTime = m.departureSimTime;
      timeState.setSpeed(3);
      timeState.updateDisplay();
      m.arrived = false;
      syncMissionStudyBar();
      notify('JUMPED TO DEPARTURE');
    };
  }
  if (arrBtn) {
    arrBtn.onclick = () => {
      const m = state.mission;
      if (!m.active) return;
      timeState.simTime = m.arrivalSimTime;
      timeState.setSpeed(3);
      timeState.updateDisplay();
      m.arrived = true;
      syncMissionStudyBar();
      notify('JUMPED TO ARRIVAL');
    };
  }
  if (playStudy) {
    playStudy.onclick = () => {
      const m = state.mission;
      if (!m.active || !m.transferData) return;
      if (timeState.simTime >= m.arrivalSimTime) {
        timeState.simTime = m.departureSimTime;
        m.arrived = false;
      }
      timeState.setSpeed(pickMissionStudySpeed(m.transferData.transferTime));
      timeState.updateDisplay();
      notify('MISSION STUDY PLAY · use bottom bar speed to fine-tune');
    };
  }
  showMissionStudyBar(false);
}

export function launchMission() {
  const td = state.transferData;
  if (!td) return;
  const gate = canLaunchMission(td);
  if (!gate.ok) {
    notify(`CANNOT LAUNCH: ${gate.reason || 'plan not ready'}`);
    return;
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
  // Adaptive speed: moon hops stay slow enough to study on the bottom bar
  timeState.setSpeed(pickMissionStudySpeed(td.transferTime));

  resetTrail();
  // Place ship at departure *before* showing the CSS2D label — otherwise
  // "SHIP 0%" flashes on the Sun (group default position is origin).
  const launchPos = getShipPositionOnTransfer(m.departureSimTime, td, m.departureSimTime);
  if (launchPos) {
    const off = getSunBarycentricOffset(m.departureSimTime);
    shipGroup.position.set(launchPos.x + off.x, launchPos.y + off.y, launchPos.z + off.z);
  } else if (td.dep3D) {
    const off = getSunBarycentricOffset(m.departureSimTime);
    shipGroup.position.set(td.dep3D.x + off.x, td.dep3D.y + off.y, td.dep3D.z + off.z);
  }
  shipGroup.visible = true;
  setShipLabelVisible(true);
  shipLabelDiv.textContent = 'SHIP 0%';
  showMissionStudyBar(true);
  syncMissionStudyBar();

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
      <div class="info-row"><span class="key">Progress (time)</span><span class="val" id="mission-pct">0%</span></div>
      <div class="info-row"><span class="key">Time remaining</span><span class="val highlight" id="mission-remaining">--</span></div>
      <div class="info-row"><span class="key">Helio speed</span><span class="val green" id="mission-speed">—</span></div>
      <div class="info-row"><span class="key">Sun distance</span><span class="val" id="mission-r">—</span></div>
      <div class="info-row"><span class="key">Path mode</span><span class="val" id="mission-path-mode">—</span></div>
      <div class="info-row"><span class="key">Time compression</span><span class="val amber" id="mission-time-x">—</span></div>
      <p class="mission-study-hint">Ship follows the <strong>2-body Kepler transfer</strong> (vis-viva speed). Calendar time is sped up for study — that is not a thruster throttle. Fast near the Sun, slow in the outer system is physical. Bottom bar: scrub, DEP/ARR, play/speed. <button type="button" class="btn-tiny" id="ms-follow-ship">Follow ship</button></p>
    </div>
    <button class="route-btn abort" id="btn-abort">Abort Mission</button>
  `;
  document.getElementById('btn-abort').onclick = abortMission;
  const followBtn = document.getElementById('ms-follow-ship');
  if (followBtn) {
    followBtn.onclick = () => {
      state.followMode = true;
      state.followShip = true;
      notify('CAMERA FOLLOWS SHIP · drag to orbit, Follow off when done');
    };
  }

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
  setShipLabelVisible(false);
  setShipVelocityDirection(null);
  trailLine.visible = false;
  resetTrail();
  state.followShip = false;
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
  showMissionStudyBar(false);
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

  if (t < m.departureSimTime) {
    shipGroup.visible = false;
    setShipLabelVisible(false);
    setShipVelocityDirection(null);
    return;
  }

  shipGroup.visible = true;
  setShipLabelVisible(true);

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
    setShipVelocityDirection(null);

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
      setShipVelocityDirection(shipInfo.vx, shipInfo.vy, shipInfo.vz, shipInfo.v_km_s);

      // Trail denser when physically faster (more path length per sim second)
      const vRef = Math.max(1, shipInfo.v_km_s || 20); // km/s
      const baseInterval = td.transferTime / MAX_TRAIL_POINTS;
      const trailInterval = baseInterval * (20 / vRef);
      if (t - m.lastTrailTime >= trailInterval) {
        addTrailPoint(sx, sy, sz);
        m.lastTrailTime = t;
      }
      const vLabel = shipInfo.v_km_s != null
        ? ` · ${shipInfo.v_km_s.toFixed(1)} km/s`
        : '';
      shipLabelDiv.textContent = `SHIP ${Math.round(progress * 100)}%${vLabel}`;
    }
  } else {
    const destPos = state.bodyPositions.get(td.body2.name);
    if (destPos) shipGroup.position.set(destPos.x, destPos.y, destPos.z);
    shipLabelDiv.textContent = 'ARRIVED';
    setShipVelocityDirection(null);
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
  const spdEl = document.getElementById('mission-speed');
  const rEl = document.getElementById('mission-r');
  const modeEl = document.getElementById('mission-path-mode');
  const xEl = document.getElementById('mission-time-x');
  if (pctEl) pctEl.textContent = Math.round(progress * 100) + '%';
  if (barEl) barEl.style.width = Math.round(progress * 100) + '%';
  if (remEl) {
    const remaining = Math.max(0, td.transferTime - elapsed);
    remEl.textContent = remaining > 0 ? formatTimePrecise(remaining) : 'ARRIVED';
  }
  if (spdEl) {
    if (shipInfo?.v_km_s != null && progress < 1) {
      const modeNote = shipInfo.mode === 'kepler' ? '' : ' (approx)';
      spdEl.textContent = `${formatVelocity(shipInfo.v_km_s * 1000)}${modeNote}`;
      spdEl.className = shipInfo.mode === 'kepler' ? 'val green' : 'val amber';
    } else if (progress >= 1) {
      spdEl.textContent = '—';
    }
  }
  if (rEl) {
    if (shipInfo?.r_AU != null && progress < 1) {
      rEl.textContent = `${shipInfo.r_AU.toFixed(3)} AU`;
    } else if (progress >= 1) {
      rEl.textContent = '—';
    }
  }
  if (modeEl) {
    const map = {
      kepler: 'Kepler 2-body (vis-viva)',
      cosine: 'Geometric blend (no orbit)',
      endpoint: 'At endpoint',
    };
    modeEl.textContent = map[shipInfo?.mode] || (progress >= 1 ? 'arrived' : '—');
  }
  if (xEl) {
    xEl.textContent = formatTimeCompression(timeState.timeScale);
  }
  syncMissionStudyBar();
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

