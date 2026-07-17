/**
 * Route results panel + mission controls (DOM).
 * Scene transfer visuals live in route-orbit-visual.js;
 * plan JSON export lives in mission-export.js;
 * shared Δv helpers live in mission-budget-ui.js.
 */
import { AU, DAY, DEG, LEG_COLORS } from '../constants.js';
import { state } from '../state.js';
import { computeMissionBudget } from '../physics/mission-budget.js';
import {
  formatDateShort, formatDist, formatTime, formatTimePrecise, formatVelocity, simTimeToDate,
} from './format.js';
import { timeState } from './time-system.js';
import { requiredDeltaV, transferBudgetNow } from './mission-budget-ui.js';
import { exportMissionPlan } from './mission-export.js';
import { buildMeasurementCard } from './measurement-card.js';
import { planStatusBannerHtml, buildPlanDossier } from './plan-dossier.js';
import { bindPlanRecoveryButtons } from './plan-recovery.js';
export { updateTransferOrbitVisual } from './route-orbit-visual.js';
export { requiredDeltaV, transferBudgetNow } from './mission-budget-ui.js';

// Launch handler — injected by main.js to break the route ↔ mission cycle.
// (Abort uses bindAbortHandler in route-planner.js for the same reason.)
let _launchMission = null;
export function bindMissionHandlers({ launch }) {
  _launchMission = launch;
}

/** @deprecated Prefer buildMeasurementCard — kept for multi-leg interim. */
function vehicleBlockHtml(requiredDv, isMulti = false) {
  const card = buildMeasurementCard(state.transferData);
  if (!isMulti) return card.html;
  return card.html;
}

function ensureDossier(td) {
  if (!td) return null;
  if (!td.dossier) buildPlanDossier(td, {});
  return td.dossier;
}

function bindMissionControlButtons(td, { canLaunch }) {
  const launchBtn = document.getElementById('btn-launch');
  if (launchBtn) {
    if (canLaunch) {
      launchBtn.disabled = false;
      launchBtn.title = 'Launch animated mission along the transfer';
      launchBtn.onclick = () => _launchMission && _launchMission();
    } else {
      launchBtn.disabled = true;
      launchBtn.title = 'Plan not mission-ready — see Plan Status gates';
      launchBtn.onclick = () => {
        import('./format.js').then(({ notify }) =>
          notify('LAUNCH BLOCKED — PLAN NOT MISSION-READY'));
      };
    }
  }
  const shareBtn = document.getElementById('btn-share-link');
  if (shareBtn) {
    shareBtn.onclick = () => {
      import('./share.js').then(({ copyShareLink }) => copyShareLink());
    };
  }
  document.getElementById('btn-goto-depart').onclick = () => {
    timeState.simTime = td.departureSimTime;
    timeState.setSpeed(3);
    timeState.updateDisplay();
    import('./format.js').then(({ notify }) => notify('JUMPED TO DEPARTURE DATE'));
  };
  document.getElementById('btn-export-plan').onclick = () => exportMissionPlan(td);

  bindPlanRecoveryButtons({
    findNearestWindow: () => {
      import('./route-planner.js').then(({ computeRoute }) => computeRoute());
    },
    openPorkchop: () => {
      document.getElementById('find-windows')?.click();
    },
    snapFlybys: () => {
      import('./route-planner.js').then((m) => {
        if (typeof m.snapFlybyDates === 'function') m.snapFlybyDates();
        else document.getElementById('btn-snap-flybys')?.click();
      });
    },
  });
}

// ---- DOM-side: results panel + mission controls ----
export function renderRouteUI() {
  const td = state.transferData;
  if (!td) return;
  if (td.isMultiLeg) { renderMultiLegRouteUI(); return; }
  renderSingleLegRouteUI(td);
}

function renderSingleLegRouteUI(td) {
  const departDate = simTimeToDate(td.departureSimTime);
  const arriveDate = simTimeToDate(td.arrivalSimTime);
  const lambertOk = !!td.lambertOk;
  const orbPhys = td.orbitPhysical;

  const periAU  = orbPhys ? (orbPhys.a * (1 - orbPhys.e)) / AU : null;
  const apoAU   = orbPhys ? (orbPhys.a * (1 + orbPhys.e)) / AU : null;
  const totalDv = lambertOk ? td.dvTotal_lambert : td.dvTotal;
  // Patched-conic mission budget for all single-leg Lambert-ok transfers.
  const budget = lambertOk ? computeMissionBudget(td) : null;
  const required = requiredDeltaV(td);

  // Suggest mission basis once when a moon endpoint is selected.
  if ((td.body1?.parent || td.body2?.parent) && !state.moonMissionSuggestDone) {
    state.moonMissionSuggestDone = true;
    if (state.costBasis !== 'mission') {
      import('./format.js').then(({ notify }) =>
        notify('TIP: switch Cost basis → Mission for parking-orbit Δv'));
    }
  }

  const dossier = ensureDossier(td);
  const missionReady = dossier
    ? !!(dossier.launch_enabled ?? dossier.mission_ready)
    : !!lambertOk;
  const res = document.getElementById('transfer-results');
  res.innerHTML = `
    <div class="transfer-results">
      ${planStatusBannerHtml(dossier)}
      <div class="result-title">${lambertOk ? 'LAMBERT TRANSFER ORBIT' : 'HOHMANN ESTIMATE (Lambert failed)'}</div>
      <div class="info-row"><span class="key">Departure</span><span class="val green">${formatDateShort(departDate)}</span></div>
      <div class="info-row"><span class="key">Arrival</span><span class="val amber">${formatDateShort(arriveDate)}</span></div>
      <div class="info-row"><span class="key">Transit duration</span><span class="val highlight">${formatTimePrecise(td.transferTime)}</span></div>
      <div class="info-row"><span class="key">Transit (days)</span><span class="val">${(td.transferTime / DAY).toFixed(1)} days</span></div>
      <div style="height:8px"></div>
      <div class="info-row"><span class="key">Departure Δv (heliocentric)</span><span class="val green">${formatVelocity(lambertOk ? td.dv1_lambert : td.dv1)}</span></div>
      <div class="info-row"><span class="key">Arrival Δv (heliocentric)</span><span class="val green">${formatVelocity(lambertOk ? td.dv2_lambert : td.dv2)}</span></div>
      <div class="info-row"><span class="key">Heliocentric leg total</span><span class="val">${formatVelocity(totalDv)}</span></div>
      ${budget ? `
      <div style="height:8px"></div>
      <div class="result-subtitle">FULL MISSION Δv  (low parking → low parking, ${(budget.parkingAlt_m/1000).toFixed(0)} km)</div>
      ${budget.departure.phases.map(p =>
        `<div class="info-row"><span class="key">↗ ${p.label}</span><span class="val">${formatVelocity(p.dv)}</span></div>`
      ).join('')}
      <div class="info-row"><span class="key">Departure subtotal</span><span class="val green">${formatVelocity(budget.departure.total)}</span></div>
      <div style="height:4px"></div>
      ${budget.arrival.phases.map(p =>
        `<div class="info-row"><span class="key">↘ ${p.label}</span><span class="val">${formatVelocity(p.dv)}</span></div>`
      ).join('')}
      <div class="info-row"><span class="key">Arrival subtotal</span><span class="val amber">${formatVelocity(budget.arrival.total)}</span></div>
      <div style="height:4px"></div>
      <div class="info-row"><span class="key"><strong>Mission total Δv</strong></span><span class="val amber"><strong>${formatVelocity(budget.totalMission)}</strong></span></div>` : ''}
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
      ${vehicleBlockHtml(required, false)}
    </div>`;

  const mc = document.getElementById('mission-controls');
  mc.innerHTML = `
    <button class="route-btn launch" id="btn-launch"${missionReady ? '' : ' disabled'}>Launch Mission</button>
    <button class="route-btn" id="btn-goto-depart" style="font-size:9px;padding:7px;margin-top:4px;">Jump to Departure Date</button>
    <button class="route-btn" id="btn-export-plan" style="font-size:9px;padding:7px;margin-top:4px;">Export plan (JSON)</button>
    <button class="route-btn" id="btn-share-link" style="font-size:9px;padding:7px;margin-top:4px;">Copy share link</button>
  `;
  bindMissionControlButtons(td, { canLaunch: missionReady });
}

function renderMultiLegRouteUI() {
  const td = state.transferData;
  const res = document.getElementById('transfer-results');
  const dossier = ensureDossier(td);
  const missionReady = dossier
    ? !!(dossier.launch_enabled ?? dossier.mission_ready)
    : false;
  const allOk = td.allLegsOk;
  const totalDv = td.dvTotalMultiLeg;
  const required = requiredDeltaV(td);

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

  const b1n = td.body1?.name || 'Origin';
  const b2n = td.body2?.name || 'Destination';

  res.innerHTML = `
    <div class="transfer-results">
      ${planStatusBannerHtml(dossier)}
      <div class="result-title">${allOk ? 'MULTI-LEG TRANSFER' : 'MULTI-LEG (some legs failed)'}</div>
      <div class="info-row"><span class="key">Depart ${b1n}</span><span class="val green">${formatDateShort(simTimeToDate(td.departureSimTime))}</span></div>
      <div class="info-row"><span class="key">Arrive ${b2n}</span><span class="val amber">${formatDateShort(simTimeToDate(td.arrivalSimTime))}</span></div>
      <div class="info-row"><span class="key">Total transit</span><span class="val highlight">${(td.transferTime / DAY).toFixed(0)} days</span></div>
      <div style="height:8px"></div>
      ${legRows}
      <div style="height:8px"></div>
      ${manRows}
      <div style="height:8px"></div>
      <div class="info-row"><span class="key">Total Δv (heliocentric)</span><span class="val amber">${formatVelocity(totalDv)}</span></div>
      <div style="height:8px"></div>
      ${vehicleBlockHtml(required, true)}
      <div class="info-row"><span class="key" style="font-size:9px;opacity:0.7">Note</span><span class="val" style="font-size:9px;opacity:0.7">Mission parking budget is single-leg only</span></div>
    </div>`;

  const mc = document.getElementById('mission-controls');
  mc.innerHTML = `
    <button class="route-btn launch" id="btn-launch"${missionReady ? '' : ' disabled'}>Launch Mission</button>
    <button class="route-btn" id="btn-goto-depart" style="font-size:9px;padding:7px;margin-top:4px;">Jump to Departure Date</button>
    <button class="route-btn" id="btn-export-plan" style="font-size:9px;padding:7px;margin-top:4px;">Export plan (JSON)</button>
    <button class="route-btn" id="btn-share-link" style="font-size:9px;padding:7px;margin-top:4px;">Copy share link</button>
  `;
  bindMissionControlButtons(td, { canLaunch: missionReady });
}
