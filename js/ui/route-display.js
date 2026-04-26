import * as THREE from 'three';
import { VEHICLE_SPECS, reservedDeltaV, starshipDeltaV, superHeavyDeltaV, totalMissionDeltaV, transferDeltaV } from '../../trajectory-calculator.js';
import { AU, DAY, DEG, LEG_COLORS, PI } from '../constants.js';
import { state } from '../state.js';
import { getBodyPosition3D, getBodyVelocity3D, getSunBarycentricOffset } from '../physics/kepler.js';
import { propagateOrbit } from '../physics/helio.js';
import { v3dot, v3mag, v3sub } from '../physics/vec3.js';
import {
  addFlybyGhost, addFlybyMarker, addLegLine, clearMultiLegVisuals,
  hideArrivalGhost, hideDepartureGhost, setArrivalGhost, setDepartureGhost,
  setTransferLine, transferMarkers,
} from '../scene/transfer-visual.js';
import {
  formatDateShort, formatDist, formatTime, formatTimePrecise, formatVelocity, simTimeToDate,
} from './format.js';
import { timeState } from './time-system.js';

// Launch handler — injected by main.js to break the route ↔ mission cycle.
// (Abort uses bindAbortHandler in route-planner.js for the same reason.)
let _launchMission = null;
export function bindMissionHandlers({ launch }) {
  _launchMission = launch;
}

// ---- Scene-side: dashed transfer-orbit lines + depart/arrive/flyby ring markers ----
export function updateTransferOrbitVisual() {
  setTransferLine(null);
  clearMultiLegVisuals();
  transferMarkers.depart.visible = false;
  transferMarkers.arrive.visible = false;
  hideArrivalGhost();
  hideDepartureGhost();
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
  // Ghosts at endpoints — faded planet-sized spheres at "where Origin/Destination
  // are at the planned moment." Makes the rendezvous geometry obvious to a
  // viewer who hasn't pressed Launch yet.
  setDepartureGhost({
    x: dep.x + depOff.x, y: dep.y + depOff.y, z: dep.z + depOff.z,
    radius: td.body1.displayRadius * 1.6,
    color: parseInt(td.body1.color.replace('#', ''), 16),
  });
  setArrivalGhost({
    x: arr.x + arrOff.x, y: arr.y + arrOff.y, z: arr.z + arrOff.z,
    radius: td.body2.displayRadius * 1.6,
    color: parseInt(td.body2.color.replace('#', ''), 16),
  });
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
    setDepartureGhost({
      x: firstLeg.dep3D.x + o.x, y: firstLeg.dep3D.y + o.y, z: firstLeg.dep3D.z + o.z,
      radius: td.body1.displayRadius * 1.6,
      color: parseInt(td.body1.color.replace('#', ''), 16),
    });
  }
  if (lastLeg && lastLeg.ok) {
    const o = getSunBarycentricOffset(lastLeg.arriveSimTime);
    transferMarkers.arrive.position.set(lastLeg.arr3D.x + o.x, lastLeg.arr3D.y + o.y, lastLeg.arr3D.z + o.z);
    transferMarkers.arrive.visible = true;
    setArrivalGhost({
      x: lastLeg.arr3D.x + o.x, y: lastLeg.arr3D.y + o.y, z: lastLeg.arr3D.z + o.z,
      radius: td.body2.displayRadius * 1.6,
      color: parseInt(td.body2.color.replace('#', ''), 16),
    });
  }
  // Per-flyby ghosts at each intermediate planet, parked at the planned-flyby-
  // time position so the user sees the planet "where the ship will meet it"
  // even when sim time is currently elsewhere.
  for (let i = 1; i < td.waypoints.length - 1; i++) {
    const wp = td.waypoints[i];
    const p = getBodyPosition3D(wp.body, wp.simTime, true);
    const o = getSunBarycentricOffset(wp.simTime);
    addFlybyGhost({
      x: p.x + o.x, y: p.y + o.y, z: p.z + o.z,
      radius: wp.body.displayRadius * 1.5,
      color: parseInt(wp.body.color.replace('#', ''), 16),
    });
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

  // computeRoute auto-snaps to the nearest feasible launch window when the
  // user's hint date would have produced a Sun-grazer, so by the time the
  // results panel renders, perihelion is already ≥ 0.3 AU and Δv is in a
  // realistic range. Just display the orbit's diagnostics; perihelion is the
  // most useful number a mission designer wants to see.
  const periAU  = orbPhys ? (orbPhys.a * (1 - orbPhys.e)) / AU : null;
  const apoAU   = orbPhys ? (orbPhys.a * (1 + orbPhys.e)) / AU : null;
  const totalDv = lambertOk ? td.dvTotal_lambert : td.dvTotal;

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
      <div class="info-row"><span class="key">Total Δv</span><span class="val amber">${formatVelocity(totalDv)}</span></div>
      ${lambertOk && orbPhys ? `
      <div style="height:8px"></div>
      <div class="info-row"><span class="key">Transfer semi-major</span><span class="val">${formatDist(orbPhys.a)}</span></div>
      <div class="info-row"><span class="key">Eccentricity</span><span class="val">${orbPhys.e.toFixed(4)}</span></div>
      <div class="info-row"><span class="key">Perihelion</span><span class="val">${periAU.toFixed(3)} AU</span></div>
      <div class="info-row"><span class="key">Apoapsis</span><span class="val">${apoAU.toFixed(3)} AU</span></div>` : `
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
    <button class="route-btn" id="btn-export-plan" style="font-size:9px;padding:7px;margin-top:4px;">Export plan (JSON)</button>
  `;
  document.getElementById('btn-launch').onclick = () => _launchMission && _launchMission();
  document.getElementById('btn-goto-depart').onclick = () => {
    timeState.simTime = td.departureSimTime;
    timeState.setSpeed(3);
    timeState.updateDisplay();
    import('./format.js').then(({ notify }) => notify('JUMPED TO DEPARTURE DATE'));
  };
  document.getElementById('btn-export-plan').onclick = () => exportMissionPlan(td);
}

function renderMultiLegRouteUI() {
  const td = state.transferData;
  const res = document.getElementById('transfer-results');
  const allOk = td.allLegsOk;
  const totalDv = td.dvTotalMultiLeg;
  const feasible = transferDeltaV() >= totalDv;

  const legRows = td.legs.map((L, i) => {
    const color = '#' + LEG_COLORS[i % LEG_COLORS.length].toString(16).padStart(6, '0');
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
    <button class="route-btn" id="btn-export-plan" style="font-size:9px;padding:7px;margin-top:4px;">Export plan (JSON)</button>
  ` : `
    <div class="info-row"><span class="key" style="color:var(--red)">Some legs failed Lambert</span><span class="val">Fix dates to launch</span></div>
    <button class="route-btn" id="btn-goto-depart" style="font-size:10px;padding:8px;">Jump to Departure Date</button>
    <button class="route-btn" id="btn-export-plan" style="font-size:9px;padding:7px;margin-top:4px;">Export plan (JSON)</button>
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
  document.getElementById('btn-export-plan').onclick = () => exportMissionPlan(td);
}


// ---- Mission plan JSON export ----
//
// Builds a structured object describing the entire trajectory plan, then
// triggers a download. Format is intended for downstream tooling — every
// vector is in m/s or m, every epoch is ISO-8601 UTC, every angle is degrees.
function exportMissionPlan(td) {
  const plan = buildPlanObject(td);
  const json = JSON.stringify(plan, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `helios-mission-${td.body1.name}-to-${td.body2.name}-${plan.summary.departure_utc.slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  import('./format.js').then(({ notify }) => notify('MISSION PLAN EXPORTED'));
}

function buildPlanObject(td) {
  const isMulti = !!td.isMultiLeg;
  const totalDv = isMulti ? td.dvTotalMultiLeg
                          : (td.lambertOk ? td.dvTotal_lambert : td.dvTotal);
  const feasible = transferDeltaV() >= totalDv;
  const isoUTC = (simT) => new Date(simT * 1000 + Date.UTC(2000, 0, 1, 12, 0, 0)).toISOString();

  const plan = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    frame: 'Heliocentric Ecliptic J2000',
    units: { distance: 'm', velocity: 'm/s', angle: 'deg', time: 'ISO-8601 UTC' },
    summary: {
      origin: td.body1.name,
      destination: td.body2.name,
      departure_utc: isoUTC(td.departureSimTime),
      arrival_utc:   isoUTC(td.arrivalSimTime),
      transit_days:  td.transferTime / DAY,
      total_dv_m_s:  totalDv,
      multi_leg:     isMulti,
      n_flybys:      isMulti ? td.flybys.length : 0,
    },
    feasibility: {
      vehicle: VEHICLE_SPECS.combined.name,
      transfer_dv_budget_m_s: transferDeltaV(),
      total_stack_dv_m_s: totalMissionDeltaV(),
      reserved_dv_m_s: reservedDeltaV(),
      feasible,
    },
  };

  if (!isMulti) {
    plan.maneuvers = [
      buildSingleLegManeuvers(td),
    ].flat();
    if (td.orbitPhysical) plan.transfer_orbit = serializeOrbit(td.orbitPhysical);
  } else {
    plan.legs = td.legs.map((L, i) => ({
      index: i,
      from: L.from,
      to:   L.to,
      depart_utc: isoUTC(L.departSimTime),
      arrive_utc: isoUTC(L.arriveSimTime),
      tof_days: L.tof / DAY,
      v1_m_s: L.v1, v2_m_s: L.v2,
      transfer_orbit: L.orbitPhysical ? serializeOrbit(L.orbitPhysical) : null,
      lambert_ok: L.ok,
    }));
    plan.maneuvers = td.maneuvers.map(m => {
      const base = { type: m.type, body: m.body, epoch_utc: isoUTC(m.simTime), dv_m_s: m.dv };
      if (m.type === 'flyby' && m.info) {
        base.flyby = {
          v_inf_in_m_s:   m.info.vInfInMag,
          v_inf_out_m_s:  m.info.vInfOutMag,
          turning_angle_deg: m.info.turningAngle / DEG,
          max_turning_deg:   m.info.maxTurningAngle / DEG,
          periapsis_required_m: m.info.rPeriapsis,
          periapsis_min_m:      m.info.minR,
          achievable: m.info.achievable,
        };
      }
      return base;
    });
  }

  return plan;
}

function buildSingleLegManeuvers(td) {
  if (!td.lambertOk || !td.orbitPhysical) {
    // Lambert failed — fall back to coarse Hohmann numbers.
    return [
      { type: 'depart', body: td.body1.name, epoch_utc: new Date(td.departureSimTime*1000 + Date.UTC(2000,0,1,12)).toISOString(), dv_m_s: td.dv1 },
      { type: 'arrive', body: td.body2.name, epoch_utc: new Date(td.arrivalSimTime*1000 + Date.UTC(2000,0,1,12)).toISOString(), dv_m_s: td.dv2 },
    ];
  }
  // Compute V∞ at departure & arrival from the Lambert solution.
  const depP = getBodyPosition3D(td.body1, td.departureSimTime, false);
  const arrP = getBodyPosition3D(td.body2, td.arrivalSimTime, false);
  const vBody1 = getBodyVelocity3D(td.body1, td.departureSimTime, false);
  const vBody2 = getBodyVelocity3D(td.body2, td.arrivalSimTime, false);
  const r1m = [depP.x*AU, depP.y*AU, depP.z*AU];
  // Re-derive v1 from the orbit's M0 (orbit was built from r1, v1 originally).
  // Easier: use the fact that orbit propagated 0s gives r1, and (orb.p_hat, orb.q_hat, orb.M0, orb.n)
  // implicitly defines v1; we can recover it by infinitesimal propagation.
  const r1 = propagateOrbit(td.orbitPhysical, 0);
  const r2 = propagateOrbit(td.orbitPhysical, td.transferTime);
  const dt = 60;
  const r1plus  = propagateOrbit(td.orbitPhysical, dt);
  const r2minus = propagateOrbit(td.orbitPhysical, td.transferTime - dt);
  const v1 = [(r1plus[0]-r1[0])/dt, (r1plus[1]-r1[1])/dt, (r1plus[2]-r1[2])/dt];
  const v2 = [(r2[0]-r2minus[0])/dt, (r2[1]-r2minus[1])/dt, (r2[2]-r2minus[2])/dt];
  const vInfDep = v3sub(v1, vBody1);
  const vInfArr = v3sub(v2, vBody2);
  const c3 = v3dot(vInfDep, vInfDep);

  const isoUTC = (simT) => new Date(simT * 1000 + Date.UTC(2000, 0, 1, 12, 0, 0)).toISOString();
  return [
    {
      type: 'depart', body: td.body1.name,
      epoch_utc: isoUTC(td.departureSimTime),
      dv_m_s: td.dv1_lambert,
      v_inf_m_s: vInfDep, c3_m2_s2: c3,
    },
    {
      type: 'arrive', body: td.body2.name,
      epoch_utc: isoUTC(td.arrivalSimTime),
      dv_m_s: td.dv2_lambert,
      v_inf_m_s: vInfArr,
    },
  ];
}

function serializeOrbit(o) {
  return {
    semi_major_axis_m: o.a,
    eccentricity: o.e,
    semi_latus_rectum_m: o.p,
    p_hat: o.p_hat, q_hat: o.q_hat, w_hat: o.w_hat,
    M0_rad: o.M0, mean_motion_rad_s: o.n,
  };
}
