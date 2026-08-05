import { state, effectivePathGeometry } from './state.js';
import { getSunBarycentricOffset } from './physics/kepler.js';
import { getShipPositionOnTransfer, getPhysicalHelioSpeedOnTransfer } from './physics/routing.js';
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
  timeState, pickMissionStudySpeed, missionStudyScale, formatTimeCompression,
} from './ui/time-system.js';
import { canLaunchMission } from './mission-gates.js';

// Re-export for callers / tests that imported from mission.js
export { pickMissionStudySpeed, missionStudyScale, formatTimeCompression };

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
      timeState.pause(); // pause while scrubbing
      m.arrived = timeState.simTime >= m.arrivalSimTime;
      syncMissionStudyBar();
      // PR5 flightPathMode=rebuild
      import('./ui/route-orbit-visual.js').then(({ maybeRebuildPathOnScrub }) => {
        maybeRebuildPathOnScrub?.();
      }).catch(() => {});
      // Path truth scrub residual (ARR epoch vs live dest)
      import('./ui/path-truth-hud.js').then((m) => m.refreshPathTruthHud?.()).catch(() => {});
    });
  }
  if (depBtn) {
    depBtn.onclick = () => {
      const m = state.mission;
      if (!m.active) return;
      timeState.simTime = m.departureSimTime;
      timeState.pause();
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
      timeState.pause();
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
      // Constant continuous scale for whole transit (~60s wall) — no mid-flight ramp
      timeState.setContinuousScale(missionStudyScale(m.transferData.transferTime));
      notify('MISSION STUDY · constant calendar rate · ship speed varies (vis-viva)');
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
  // Constant continuous calendar rate for the whole transit (not discrete jumps mid-flight)
  timeState.setContinuousScale(missionStudyScale(td.transferTime));

  resetTrail();
  // Place ship at departure *before* showing the CSS2D label — otherwise
  // "SHIP 0%" flashes on the Sun (group default position is origin).
  // Phase 1: getShipPositionOnTransfer already returns scene-frame (offset applied).
  const launchPos = getShipPositionOnTransfer(m.departureSimTime, td, m.departureSimTime);
  if (launchPos) {
    shipGroup.position.set(launchPos.x, launchPos.y, launchPos.z);
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
      <div class="info-row" title="Heliocentric |v| on the physical Lambert conic (Sun frame). Saturn→Earth: ~5 km/s outer → ~40 km/s near Earth. Not planet-relative V∞.">
        <span class="key">Helio speed</span><span class="val green" id="mission-speed">—</span>
      </div>
      <div class="info-row" title="Heliocentric radius of the physical transfer (AU from Sun).">
        <span class="key">Sun distance</span><span class="val" id="mission-r">—</span>
      </div>
      <div class="info-row"><span class="key">Path mode</span><span class="val" id="mission-path-mode">—</span></div>
      <div class="info-row"><span class="key">Time compression</span><span class="val amber" id="mission-time-x">—</span></div>
      <p class="mission-study-hint">Ship follows the <strong>2-body Kepler transfer</strong>. <strong>Calendar rate is constant</strong> (bottom-bar label); the ship still moves faster near the Sun (vis-viva) — that is physics, not a changing time scale. Scrub / DEP / ARR / play. <button type="button" class="btn-tiny" id="ms-follow-ship">Follow ship</button></p>
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
    timeState.pause();
    notify(`ARRIVED AT ${td.body2.name.toUpperCase()}`);
    // Hide the rendezvous markers — they were aids for the pre-flight view.
    // Once arrived, ship & destination coincide, so the markers become
    // misleading if the user later scrubs time forward.
    hideArrivalGhost();
    hideDepartureGhost();
    transferMarkers.arrive.visible = false;
    transferMarkers.depart.visible = false;
    // Keep helio speed readout at ARR epoch (do not blank to —)

    const box = document.getElementById('mission-status-box');
    if (box) {
      box.classList.add('arrived');
      box.querySelector('h4').textContent = 'MISSION COMPLETE';
    }
  }

  // Clamp to [DEP, ARR] so ARR epoch still samples the transfer (not live planet mesh only)
  const tClamp = Math.min(
    Math.max(t, m.departureSimTime),
    m.arrivalSimTime,
  );
  // Scene path position (visual Present / physical Analyze)
  let shipInfo = getShipPositionOnTransfer(m.departureSimTime, td, tClamp);
  // Need-honest heliocentric speed on physical Lambert (always)
  const speedInfo = getPhysicalHelioSpeedOnTransfer(td, tClamp);

  if (progress < 1 && shipInfo) {
    const sx = shipInfo.x, sy = shipInfo.y, sz = shipInfo.z;
    shipGroup.position.set(sx, sy, sz);
    // Arrow uses physical v when available
    if (speedInfo?.v_km_s != null) {
      setShipVelocityDirection(
        shipInfo.vx, shipInfo.vy, shipInfo.vz,
        speedInfo.v_km_s,
      );
    } else {
      setShipVelocityDirection(shipInfo.vx, shipInfo.vy, shipInfo.vz, shipInfo.v_km_s);
    }

    const vRef = Math.max(1, speedInfo?.v_km_s || shipInfo.v_km_s || 20);
    const baseInterval = td.transferTime / MAX_TRAIL_POINTS;
    const trailInterval = baseInterval * (20 / vRef);
    if (t - m.lastTrailTime >= trailInterval) {
      addTrailPoint(sx, sy, sz);
      m.lastTrailTime = t;
    }
    const vShow = speedInfo?.v_km_s ?? shipInfo.v_km_s;
    const vLabel = vShow != null ? ` · ${vShow.toFixed(1)} km/s helio` : '';
    shipLabelDiv.textContent = `SHIP ${Math.round(progress * 100)}%${vLabel}`;
  } else if (progress >= 1) {
    // Prefer path-end pose (ARR epoch); fall back to live dest mesh
    if (shipInfo) {
      shipGroup.position.set(shipInfo.x, shipInfo.y, shipInfo.z);
    } else {
      const destPos = state.bodyPositions.get(td.body2.name);
      if (destPos) shipGroup.position.set(destPos.x, destPos.y, destPos.z);
    }
    const vArr = speedInfo?.v_km_s;
    shipLabelDiv.textContent = vArr != null
      ? `ARRIVED · ${vArr.toFixed(1)} km/s helio`
      : 'ARRIVED';
    if (speedInfo?.v_km_s != null && shipInfo) {
      setShipVelocityDirection(shipInfo.vx, shipInfo.vy, shipInfo.vz, speedInfo.v_km_s);
    } else {
      setShipVelocityDirection(null);
    }
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
    if (speedInfo?.v_km_s != null) {
      const tag = speedInfo.atArrival || progress >= 1 ? ' · ARR epoch' : '';
      const modeNote = speedInfo.mode === 'kepler' ? '' : ' (approx)';
      spdEl.textContent = `${formatVelocity(speedInfo.v_km_s * 1000)} helio${tag}${modeNote}`;
      spdEl.className = speedInfo.mode === 'kepler' ? 'val green' : 'val amber';
      spdEl.title = 'Heliocentric speed on physical Lambert (Sun frame). Not relative to planet. Inward trips: slow outer → fast near Sun.';
    } else {
      spdEl.textContent = '—';
    }
  }
  if (rEl) {
    // Physical transfer r from Sun (Need geometry)
    const rAu = speedInfo?.r_AU != null
      ? speedInfo.r_AU
      : (shipInfo?.r_helio
        ? Math.hypot(shipInfo.r_helio.x, shipInfo.r_helio.y, shipInfo.r_helio.z)
        : shipInfo?.r_AU);
    rEl.textContent = rAu != null ? `${rAu.toFixed(3)} AU` : '—';
  }
  if (modeEl) {
    if (progress >= 1) {
      modeEl.textContent = 'arrived · helio speed = physical ARR epoch';
    } else {
      const base = speedInfo?.mode === 'kepler' || shipInfo?.mode === 'kepler'
        ? 'kepler · physical vis-viva'
        : (shipInfo?.mode === 'cosine' ? 'cosine blend (non-Kepler)' : (shipInfo?.mode || '—'));
      const geom = shipInfo?.displayTransform
        ? `${td.scenePathGeometry || 'scene'}+xf`
        : (td.scenePathGeometry || effectivePathGeometry());
      const flight = state.flightPathMode || 'static';
      modeEl.textContent = `${base} · scene=${geom} · flight=${flight} · v=physical_helio`;
    }
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

