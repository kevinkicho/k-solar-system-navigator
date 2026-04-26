import { DAY } from '../constants.js';
import { BODIES } from '../data/bodies.js';
import { state } from '../state.js';
import { hohmannTransfer } from '../physics/kepler.js';
import { solveMultiLegRoute, solveTransferOrbit } from '../physics/routing.js';
import { dateToInputValue, dateToSimTime, inputValueToDate, notify, simTimeToDate } from './format.js';
import { renderRouteUI, updateTransferOrbitVisual } from './route-display.js';
import { selectBody } from './selection.js';
import { timeState } from './time-system.js';
import { updateBodyList } from './body-list.js';

export function setRouteOrigin(body) {
  state.routeOrigin = body;
  state.flybys = [];
  state.transferData = null;
  state.showTransferOrbit = false;
  document.getElementById('origin-name').textContent = body ? body.name : 'Drag or right-click';
  document.getElementById('origin-name').classList.toggle('empty', !body);
  if (body) notify(`ORIGIN: ${body.name.toUpperCase()}`);
  document.getElementById('transfer-results').innerHTML = '';
  document.getElementById('mission-controls').innerHTML = '';
  renderFlybyList();
  selectBody(state.selectedBody);
  updateBodyList();
}

export function setRouteDestination(body) {
  state.routeDestination = body;
  state.flybys = [];
  state.transferData = null;
  state.showTransferOrbit = false;
  document.getElementById('dest-name').textContent = body ? body.name : 'Drag or right-click';
  document.getElementById('dest-name').classList.toggle('empty', !body);
  if (body) notify(`DESTINATION: ${body.name.toUpperCase()}`);
  document.getElementById('transfer-results').innerHTML = '';
  document.getElementById('mission-controls').innerHTML = '';
  renderFlybyList();
  selectBody(state.selectedBody);
  updateBodyList();
}

// `clearRoute` aborts any in-flight mission via the injected handler set by main.js,
// to avoid the route-planner ↔ mission cycle.
let _abortMission = () => {};
export function bindAbortHandler(fn) { _abortMission = fn; }

export function clearRoute() {
  _abortMission();
  setRouteOrigin(null);
  setRouteDestination(null);
  state.flybys = [];
  renderFlybyList();
  state.transferData = null;
  state.showTransferOrbit = false;
  updateTransferOrbitVisual();
  document.getElementById('transfer-results').innerHTML = '';
  document.getElementById('mission-controls').innerHTML = '';
  document.getElementById('depart-date').value = '';
  notify('ROUTE CLEARED');
}

export function renderFlybyList() {
  const list = document.getElementById('flyby-list');
  if (state.flybys.length === 0) { list.innerHTML = ''; return; }
  const options = BODIES.map(b => `<option value="${b.name}">${b.name}</option>`).join('');
  list.innerHTML = state.flybys.map((f, i) => `
    <div class="flyby-row" data-index="${i}">
      <select class="flyby-body">${options}</select>
      <input type="datetime-local" class="flyby-date" step="1">
      <button class="flyby-remove" title="Remove flyby">&times;</button>
    </div>
  `).join('');
  state.flybys.forEach((f, i) => {
    const row = list.querySelector(`.flyby-row[data-index="${i}"]`);
    row.querySelector('.flyby-body').value = f.bodyName;
    row.querySelector('.flyby-date').value = dateToInputValue(simTimeToDate(f.simTime));
    row.querySelector('.flyby-body').addEventListener('change', (e) => {
      state.flybys[i].bodyName = e.target.value;
    });
    row.querySelector('.flyby-date').addEventListener('change', (e) => {
      const d = inputValueToDate(e.target.value);
      if (d && !isNaN(d.getTime())) state.flybys[i].simTime = dateToSimTime(d);
    });
    row.querySelector('.flyby-remove').addEventListener('click', () => {
      state.flybys.splice(i, 1);
      renderFlybyList();
    });
  });
}

export function addFlyby() {
  if (!state.routeOrigin || !state.routeDestination) {
    notify('SET ORIGIN AND DESTINATION FIRST'); return;
  }
  const dateInput = document.getElementById('depart-date');
  const depDate = inputValueToDate(dateInput.value);
  const depSim = (depDate && !isNaN(depDate.getTime())) ? dateToSimTime(depDate) : timeState.simTime;
  const h = hohmannTransfer(state.routeOrigin, state.routeDestination, depSim);
  const lastSim = state.flybys.length > 0 ? state.flybys[state.flybys.length - 1].simTime : depSim;
  const endSim = h.arrivalSimTime;
  const midSim = 0.5 * (lastSim + endSim);
  const a1 = state.routeOrigin.a, a2 = state.routeDestination.a;
  const goingOut = a2 > a1;
  const defaultName = goingOut
    ? (a1 < 1.0 ? 'Earth' : (a1 < 5.2 ? 'Jupiter' : 'Saturn'))
    : (a1 > 1.0 ? 'Earth' : 'Venus');
  state.flybys.push({ bodyName: defaultName, simTime: midSim });
  renderFlybyList();
}

// Coordinate-descent optimizer: sweeps each flyby's date ±30 days (2-day steps)
// to minimize total-mission Δv, up to 3 passes. Infeasible candidates (Lambert
// failure or too-sharp turning angle) are scored as Infinity.
export function snapFlybyDates() {
  if (!state.routeOrigin || !state.routeDestination) {
    notify('SET ORIGIN AND DESTINATION FIRST'); return;
  }
  if (state.flybys.length === 0) { notify('NO FLYBYS TO OPTIMIZE'); return; }

  const dateInput = document.getElementById('depart-date');
  const depDate = inputValueToDate(dateInput.value);
  const depSim = (depDate && !isNaN(depDate.getTime())) ? dateToSimTime(depDate) : timeState.simTime;

  const evalCost = (times) => {
    const wps = [
      { body: state.routeOrigin, simTime: depSim },
      ...state.flybys.map((f, i) => ({
        body: BODIES.find(b => b.name === f.bodyName),
        simTime: times[i],
      })),
      { body: state.routeDestination, simTime: 0 },
    ];
    const lastF = wps[wps.length - 2];
    const tail = hohmannTransfer(lastF.body, state.routeDestination, lastF.simTime);
    wps[wps.length - 1].simTime = tail.arrivalSimTime;
    const td = solveMultiLegRoute(wps);
    if (!td.allLegsOk) return Infinity;
    if (td.flybys.some(f => !f.achievable)) return Infinity;
    return td.dvTotalMultiLeg;
  };

  const times = state.flybys.map(f => f.simTime);
  let bestCost = evalCost(times);
  const WINDOW = 30 * DAY;
  const STEP = 2 * DAY;

  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let i = 0; i < times.length; i++) {
      const loBound = (i === 0 ? depSim : times[i - 1]) + DAY;
      const hiBound = (i === times.length - 1 ? Infinity : times[i + 1]) - DAY;
      const tMin = Math.max(times[i] - WINDOW, loBound);
      const tMax = Math.min(times[i] + WINDOW, hiBound);
      let bestT = times[i];
      for (let t = tMin; t <= tMax; t += STEP) {
        const trial = times.slice();
        trial[i] = t;
        const c = evalCost(trial);
        if (c < bestCost) { bestCost = c; bestT = t; improved = true; }
      }
      times[i] = bestT;
    }
    if (!improved) break;
  }

  if (!isFinite(bestCost)) { notify('NO FEASIBLE FLYBY DATES IN ±30-DAY WINDOW'); return; }

  state.flybys.forEach((f, i) => { f.simTime = times[i]; });
  renderFlybyList();
  computeRoute();
  notify(`FLYBY DATES SNAPPED · TOTAL Δv ${(bestCost / 1000).toFixed(2)} KM/S`);
}

export function computeRoute() {
  if (!state.routeOrigin || !state.routeDestination) {
    notify('SET ORIGIN AND DESTINATION FIRST'); return;
  }

  const dateInput = document.getElementById('depart-date');
  let departureSimTime;
  const inputDate = inputValueToDate(dateInput.value);
  if (inputDate && !isNaN(inputDate.getTime())) {
    departureSimTime = dateToSimTime(inputDate);
  } else {
    departureSimTime = timeState.simTime;
    dateInput.value = dateToInputValue(timeState.getDate());
  }

  if (state.flybys.length > 0) {
    const waypoints = [
      { body: state.routeOrigin, simTime: departureSimTime },
      ...state.flybys.map(f => ({
        body: BODIES.find(b => b.name === f.bodyName),
        simTime: f.simTime,
      })),
      { body: state.routeDestination, simTime: 0 },
    ];
    const lastFlyby = waypoints[waypoints.length - 2];
    const tailHohmann = hohmannTransfer(lastFlyby.body, state.routeDestination, lastFlyby.simTime);
    waypoints[waypoints.length - 1].simTime = tailHohmann.arrivalSimTime;

    state.transferData = solveMultiLegRoute(waypoints);
  } else {
    state.transferData = hohmannTransfer(state.routeOrigin, state.routeDestination, departureSimTime);
    solveTransferOrbit(state.transferData);
  }
  state.showTransferOrbit = true;
  updateTransferOrbitVisual();
  renderRouteUI();
  notify(state.flybys.length > 0 ? 'MULTI-LEG ROUTE COMPUTED' : 'TRANSFER ORBIT COMPUTED');
}
