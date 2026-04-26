import * as THREE from 'three';
import { VEHICLE_SPECS, reservedDeltaV, starshipDeltaV, superHeavyDeltaV, totalMissionDeltaV, transferDeltaV } from '../../trajectory-calculator.js';
import { AU, DAY, DEG, LEG_COLORS, PI } from '../constants.js';
import { state } from '../state.js';
import { getBodyPosition3D, getSunBarycentricOffset } from '../physics/kepler.js';
import { propagateOrbit } from '../physics/helio.js';
import {
  addFlybyMarker, addLegLine, clearMultiLegVisuals, setTransferLine, transferMarkers,
} from '../scene/transfer-visual.js';
import {
  formatDateShort, formatDist, formatTime, formatTimePrecise, formatVelocity, simTimeToDate,
} from './format.js';
import { timeState } from './time-system.js';

// Mission action handlers (injected by main.js to break the route ↔ mission cycle).
let _launchMission = null, _abortMission = null;
export function bindMissionHandlers({ launch, abort }) {
  _launchMission = launch;
  _abortMission = abort;
}

// ---- Scene-side: dashed transfer-orbit lines + depart/arrive/flyby ring markers ----
export function updateTransferOrbitVisual() {
  setTransferLine(null);
  clearMultiLegVisuals();
  transferMarkers.depart.visible = false;
  transferMarkers.arrive.visible = false;
  if (!state.showTransferOrbit || !state.transferData) return;

  const td = state.transferData;
  if (td.isMultiLeg) { renderMultiLegVisual(); return; }

  // Each point on the trajectory occurs at a specific time; apply that moment's
  // Sun-barycentric offset so the drawn arc meets the wobbled planets at endpoints.
  const depT = td.departureSimTime;
  const arrT = td.arrivalSimTime;
  const dep = td.dep3D || getBodyPosition3D(td.body1, depT);
  const arr = td.arr3D || getBodyPosition3D(td.body2, arrT);
  const depOff = getSunBarycentricOffset(depT);
  const arrOff = getSunBarycentricOffset(arrT);
  const points = [];
  const N = 200;
  if (td.orbit) {
    for (let i = 0; i <= N; i++) {
      const dt = (i / N) * td.transferTime;
      const pos_m = propagateOrbit(td.orbit, dt);
      const off = getSunBarycentricOffset(depT + dt);
      points.push(new THREE.Vector3(
        pos_m[0] / AU + off.x, pos_m[1] / AU + off.y, pos_m[2] / AU + off.z));
    }
  } else {
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const blend = 0.5 - 0.5 * Math.cos(PI * t);
      const off = getSunBarycentricOffset(depT + t * td.transferTime);
      points.push(new THREE.Vector3(
        dep.x + (arr.x - dep.x) * blend + off.x,
        dep.y + (arr.y - dep.y) * blend + off.y,
        dep.z + (arr.z - dep.z) * blend + off.z));
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineDashedMaterial({
    color: 0xff9800, dashSize: 0.15, gapSize: 0.08,
    transparent: true, opacity: 0.7,
  });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  setTransferLine(line);
  transferMarkers.depart.position.set(dep.x + depOff.x, dep.y + depOff.y, dep.z + depOff.z);
  transferMarkers.depart.visible = true;
  transferMarkers.arrive.position.set(arr.x + arrOff.x, arr.y + arrOff.y, arr.z + arrOff.z);
  transferMarkers.arrive.visible = true;
}

function renderMultiLegVisual() {
  const td = state.transferData;
  const N = 160;
  for (let li = 0; li < td.legs.length; li++) {
    const leg = td.legs[li];
    if (!leg.ok) continue;
    const pts = [];
    if (leg.orbit) {
      for (let i = 0; i <= N; i++) {
        const dt = (i / N) * leg.tof;
        const pm = propagateOrbit(leg.orbit, dt);
        const off = getSunBarycentricOffset(leg.departSimTime + dt);
        pts.push(new THREE.Vector3(pm[0]/AU + off.x, pm[1]/AU + off.y, pm[2]/AU + off.z));
      }
    } else {
      const a = leg.dep3D, b = leg.arr3D;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const blend = 0.5 - 0.5 * Math.cos(PI * t);
        const off = getSunBarycentricOffset(leg.departSimTime + t * leg.tof);
        pts.push(new THREE.Vector3(
          a.x + (b.x - a.x) * blend + off.x,
          a.y + (b.y - a.y) * blend + off.y,
          a.z + (b.z - a.z) * blend + off.z));
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({
      color: LEG_COLORS[li % LEG_COLORS.length],
      dashSize: 0.15, gapSize: 0.08,
      transparent: true, opacity: 0.75,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    addLegLine(line);
  }

  const firstLeg = td.legs[0];
  const lastLeg  = td.legs[td.legs.length - 1];
  if (firstLeg && firstLeg.ok) {
    const o = getSunBarycentricOffset(firstLeg.departSimTime);
    transferMarkers.depart.position.set(firstLeg.dep3D.x + o.x, firstLeg.dep3D.y + o.y, firstLeg.dep3D.z + o.z);
    transferMarkers.depart.visible = true;
  }
  if (lastLeg && lastLeg.ok) {
    const o = getSunBarycentricOffset(lastLeg.arriveSimTime);
    transferMarkers.arrive.position.set(lastLeg.arr3D.x + o.x, lastLeg.arr3D.y + o.y, lastLeg.arr3D.z + o.z);
    transferMarkers.arrive.visible = true;
  }

  for (let i = 1; i < td.waypoints.length - 1; i++) {
    const wp = td.waypoints[i];
    const p = getBodyPosition3D(wp.body, wp.simTime, true);
    const o = getSunBarycentricOffset(wp.simTime);
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.018, 0.030, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd54f, side: THREE.DoubleSide,
        transparent: true, opacity: 0.85,
      }),
    );
    mesh.position.set(p.x + o.x, p.y + o.y, p.z + o.z);
    addFlybyMarker(mesh);
  }
}

// ---- DOM-side: results panel + mission controls ----
export function renderRouteUI() {
  const td = state.transferData;
  if (!td) return;
  if (td.isMultiLeg) { renderMultiLegRouteUI(); return; }

  const departDate = simTimeToDate(td.departureSimTime);
  const arriveDate = simTimeToDate(td.arrivalSimTime);
  const lambertOk = !!td.lambertOk;
  const orbPhys = td.orbitPhysical;

  const res = document.getElementById('transfer-results');
  res.innerHTML = `
    <div class="transfer-results">
      <div class="result-title">${lambertOk ? 'LAMBERT TRANSFER ORBIT' : 'HOHMANN ESTIMATE (Lambert failed)'}</div>
      <div class="info-row"><span class="key">Departure</span><span class="val green">${formatDateShort(departDate)}</span></div>
      <div class="info-row"><span class="key">Arrival</span><span class="val amber">${formatDateShort(arriveDate)}</span></div>
      <div class="info-row"><span class="key">Transit duration</span><span class="val highlight">${formatTimePrecise(td.transferTime)}</span></div>
      <div class="info-row"><span class="key">Transit (days)</span><span class="val">${(td.transferTime / DAY).toFixed(1)} days</span></div>
      <div style="height:8px"></div>
      <div class="info-row"><span class="key">Departure Δv</span><span class="val green">${formatVelocity(lambertOk ? td.dv1_lambert : td.dv1)}</span></div>
      <div class="info-row"><span class="key">Arrival Δv</span><span class="val green">${formatVelocity(lambertOk ? td.dv2_lambert : td.dv2)}</span></div>
      <div class="info-row"><span class="key">Total Δv</span><span class="val amber">${formatVelocity(lambertOk ? td.dvTotal_lambert : td.dvTotal)}</span></div>
      ${lambertOk && orbPhys ? `
      <div style="height:8px"></div>
      <div class="info-row"><span class="key">Transfer semi-major</span><span class="val">${formatDist(orbPhys.a)}</span></div>
      <div class="info-row"><span class="key">Eccentricity</span><span class="val">${orbPhys.e.toFixed(4)}</span></div>` : `
      <div style="height:8px"></div>
      <div class="info-row"><span class="key">Transfer semi-major</span><span class="val">${formatDist(td.aT)}</span></div>`}
      <div class="info-row"><span class="key">Phase angle needed</span><span class="val">${(td.phaseAngle / DEG).toFixed(2)}&deg;</span></div>
      <div class="info-row"><span class="key">Phase at departure</span><span class="val">${(td.currentPhase / DEG).toFixed(2)}&deg;</span></div>
      <div class="info-row"><span class="key">Next optimal window</span><span class="val highlight">${formatTime(td.timeToWindow)}</span></div>
      <div style="height:8px"></div>
      <div class="info-row"><span class="key">Vehicle</span><span class="val">${VEHICLE_SPECS.combined.name}</span></div>
      <div class="info-row"><span class="key">Super Heavy Δv (transfer)</span><span class="val">${formatVelocity(superHeavyDeltaV())}</span></div>
      <div class="info-row"><span class="key">Starship Δv (reserved)</span><span class="val">${formatVelocity(starshipDeltaV())}</span></div>
      <div class="info-row"><span class="key">Total stack Δv</span><span class="val">${formatVelocity(totalMissionDeltaV())}</span></div>
      <div class="info-row"><span class="key">Usable transfer Δv</span><span class="val">${formatVelocity(transferDeltaV())}</span></div>
      <div class="info-row"><span class="key">Mission feasible</span><span class="val ${transferDeltaV() >= (lambertOk ? td.dvTotal_lambert : td.dvTotal) ? 'green' : 'red-val'}">${transferDeltaV() >= (lambertOk ? td.dvTotal_lambert : td.dvTotal) ? 'YES' : 'NO'}</span></div>
    </div>`;

  const mc = document.getElementById('mission-controls');
  mc.innerHTML = `
    <button class="route-btn launch" id="btn-launch">Launch Mission</button>
    <button class="route-btn" id="btn-goto-depart" style="font-size:9px;padding:7px;margin-top:4px;">Jump to Departure Date</button>
  `;
  document.getElementById('btn-launch').onclick = () => _launchMission && _launchMission();
  document.getElementById('btn-goto-depart').onclick = () => {
    timeState.simTime = td.departureSimTime;
    timeState.setSpeed(3);
    timeState.updateDisplay();
    import('./format.js').then(({ notify }) => notify('JUMPED TO DEPARTURE DATE'));
  };
}

function renderMultiLegRouteUI() {
  const td = state.transferData;
  const res = document.getElementById('transfer-results');
  const allOk = td.allLegsOk;
  const totalDv = td.dvTotalMultiLeg;
  const feasible = transferDeltaV() >= totalDv;

  const legRows = td.legs.map((L, i) => {
    const color = ['#ff9800','#00d4ff','#d36bff','#00e676','#ffeb3b','#ff5a3c'][i % 6];
    if (!L.ok) {
      return `<div class="info-row"><span class="key" style="color:${color}">Leg ${i+1} ${L.from}→${L.to}</span><span class="val red-val">LAMBERT FAILED</span></div>`;
    }
    return `<div class="info-row"><span class="key" style="color:${color}">Leg ${i+1} ${L.from}→${L.to}</span><span class="val">${(L.tof/DAY).toFixed(0)}d</span></div>`;
  }).join('');

  const manRows = td.maneuvers.map((m) => {
    if (m.type === 'depart') return `<div class="info-row"><span class="key">Depart ${m.body}</span><span class="val green">${formatVelocity(m.dv)}</span></div>`;
    if (m.type === 'arrive') return `<div class="info-row"><span class="key">Arrive ${m.body}</span><span class="val amber">${formatVelocity(m.dv)}</span></div>`;
    const gi = m.info;
    const tDeg = (gi.turningAngle / DEG).toFixed(1);
    const tMax = (gi.maxTurningAngle / DEG).toFixed(1);
    const rP = isFinite(gi.rPeriapsis) ? (gi.rPeriapsis / 1000).toFixed(0) + ' km' : '—';
    const minR = (gi.minR / 1000).toFixed(0) + ' km';
    const cls = gi.achievable ? 'green' : 'red-val';
    const status = gi.achievable ? 'OK' : 'TOO SHARP';
    return `
      <div class="info-row"><span class="key">Flyby ${m.body}</span><span class="val ${cls}">${status}</span></div>
      <div class="info-row"><span class="key">&nbsp;&nbsp;Turning angle</span><span class="val">${tDeg}&deg; / max ${tMax}&deg;</span></div>
      <div class="info-row"><span class="key">&nbsp;&nbsp;Periapsis</span><span class="val">${rP} (min ${minR})</span></div>
      <div class="info-row"><span class="key">&nbsp;&nbsp;V&infin; in / out</span><span class="val">${(gi.vInfInMag/1000).toFixed(2)} / ${(gi.vInfOutMag/1000).toFixed(2)} km/s</span></div>
      ${gi.dvFlyby > 1 ? `<div class="info-row"><span class="key">&nbsp;&nbsp;Powered Δv</span><span class="val amber">${formatVelocity(gi.dvFlyby)}</span></div>` : ''}
    `;
  }).join('');

  res.innerHTML = `
    <div class="transfer-results">
      <div class="result-title">${allOk ? 'MULTI-LEG TRANSFER' : 'MULTI-LEG (some legs failed)'}</div>
      <div class="info-row"><span class="key">Depart ${td.body1.name}</span><span class="val green">${formatDateShort(simTimeToDate(td.departureSimTime))}</span></div>
      <div class="info-row"><span class="key">Arrive ${td.body2.name}</span><span class="val amber">${formatDateShort(simTimeToDate(td.arrivalSimTime))}</span></div>
      <div class="info-row"><span class="key">Total transit</span><span class="val highlight">${(td.transferTime / DAY).toFixed(0)} days</span></div>
      <div style="height:8px"></div>
      ${legRows}
      <div style="height:8px"></div>
      ${manRows}
      <div style="height:8px"></div>
      <div class="info-row"><span class="key">Total Δv</span><span class="val amber">${formatVelocity(totalDv)}</span></div>
      <div style="height:8px"></div>
      <div class="info-row"><span class="key">Vehicle</span><span class="val">${VEHICLE_SPECS.combined.name}</span></div>
      <div class="info-row"><span class="key">Usable transfer Δv</span><span class="val">${formatVelocity(transferDeltaV())}</span></div>
      <div class="info-row"><span class="key">Mission feasible</span><span class="val ${feasible ? 'green' : 'red-val'}">${feasible ? 'YES' : 'NO'}</span></div>
    </div>`;

  const mc = document.getElementById('mission-controls');
  mc.innerHTML = td.allLegsOk ? `
    <button class="route-btn launch" id="btn-launch">Launch Mission</button>
    <button class="route-btn" id="btn-goto-depart" style="font-size:9px;padding:7px;margin-top:4px;">Jump to Departure Date</button>
  ` : `
    <div class="info-row"><span class="key" style="color:var(--red)">Some legs failed Lambert</span><span class="val">Fix dates to launch</span></div>
    <button class="route-btn" id="btn-goto-depart" style="font-size:10px;padding:8px;">Jump to Departure Date</button>
  `;
  if (td.allLegsOk) {
    document.getElementById('btn-launch').onclick = () => _launchMission && _launchMission();
  }
  document.getElementById('btn-goto-depart').onclick = () => {
    timeState.simTime = td.departureSimTime;
    timeState.setSpeed(3);
    timeState.updateDisplay();
    import('./format.js').then(({ notify }) => notify('JUMPED TO DEPARTURE DATE'));
  };
}

// `_abortMission` referenced just to silence unused-var; consumed elsewhere via DI.
export function _attachAbortHandlerTo(buttonId) {
  const btn = document.getElementById(buttonId);
  if (btn && _abortMission) btn.onclick = _abortMission;
}
