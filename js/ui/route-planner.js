import { AU, DAY } from '../constants.js';
import { BODIES } from '../data/bodies.js';
import { bodyId, findByIdOrName, listFlybyEligible, resolveFlybyBody } from '../data/catalog.js';
import { state } from '../state.js';
import { hohmannTransfer } from '../physics/kepler.js';
import {
  MIN_PERIHELION_AU, findNearestFeasibleTransfer, findMultiLegWindow,
  solveMultiLegRoute, solveTransferOrbit,
} from '../physics/routing.js';
import { dateToInputValue, dateToSimTime, inputValueToDate, notify, simTimeToDate } from './format.js';
import { renderRouteUI, updateTransferOrbitVisual } from './route-display.js';
import { selectBody } from './selection.js';
import { timeState } from './time-system.js';
import { updateBodyList } from './body-list.js';
import { syncShareHash } from './share-sync.js';

// Mission abort handler — injected by main.js so route-planner can cancel an
// in-flight mission without importing mission.js (which would create a cycle).
let _abortMission = () => {};
export function bindAbortHandler(fn) { _abortMission = fn; }

/** Stamp L2-plan backend fields onto transferData (K3 classroom → approx). */
export function stampPlanningEphemeris(td) {
  if (!td) return td;
  const backend = state.classroomMode
    ? 'approx'
    : (state.ephemerisBackend === 'sample-de' ? 'sample-de' : 'approx');
  td.ephemerisBackend = backend;
  td.classroomMode = !!state.classroomMode;
  return td;
}

export function setRouteOrigin(body) {
  // If a mission was in flight (or arrived), changing the origin invalidates
  // it — the "From X" label and progress bar would be stale.  Bail cleanly.
  if (state.mission.active) _abortMission();
  state.routeOrigin = body;
  state.flybys = [];
  state.transferData = null;
  state.showTransferOrbit = false;
  updateTransferOrbitVisual();   // tear down dashed line + ghost target
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
  if (state.mission.active) _abortMission();
  state.routeDestination = body;
  state.flybys = [];
  state.transferData = null;
  state.showTransferOrbit = false;
  updateTransferOrbitVisual();
  document.getElementById('dest-name').textContent = body ? body.name : 'Drag or right-click';
  document.getElementById('dest-name').classList.toggle('empty', !body);
  if (body) notify(`DESTINATION: ${body.name.toUpperCase()}`);
  document.getElementById('transfer-results').innerHTML = '';
  document.getElementById('mission-controls').innerHTML = '';
  renderFlybyList();
  selectBody(state.selectedBody);
  updateBodyList();
}

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
  const options = listFlybyEligible()
    .map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  list.innerHTML = state.flybys.map((f, i) => `
    <div class="flyby-row" data-index="${i}">
      <select class="flyby-body">${options}</select>
      <input type="datetime-local" class="flyby-date" step="1">
      <button class="flyby-remove" title="Remove flyby">&times;</button>
    </div>
  `).join('');
  state.flybys.forEach((f, i) => {
    const row = list.querySelector(`.flyby-row[data-index="${i}"]`);
    const body = resolveFlybyBody(f);
    const sel = row.querySelector('.flyby-body');
    if (body) sel.value = body.id;
    else if (f.bodyName) {
      const byName = findByIdOrName(f.bodyName);
      if (byName) sel.value = byName.id;
    }
    row.querySelector('.flyby-date').value = dateToInputValue(simTimeToDate(f.simTime));
    sel.addEventListener('change', (e) => {
      const b = findByIdOrName(e.target.value);
      state.flybys[i].bodyId = b?.id || e.target.value;
      state.flybys[i].bodyName = b?.name || e.target.value;
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
  const a1 = state.routeOrigin.a ?? 1, a2 = state.routeDestination.a ?? 1.5;
  const goingOut = a2 > a1;
  const defaultName = goingOut
    ? (a1 < 1.0 ? 'Earth' : (a1 < 5.2 ? 'Jupiter' : 'Saturn'))
    : (a1 > 1.0 ? 'Earth' : 'Venus');
  const def = findByIdOrName(defaultName) || BODIES[2];
  state.flybys.push({ bodyId: def.id, bodyName: def.name, simTime: midSim });
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
        body: resolveFlybyBody(f),
        simTime: times[i],
      })),
      { body: state.routeDestination, simTime: 0 },
    ];
    if (wps.some(w => !w.body)) return Infinity;
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

// Two bodies are "in the same gravity well" when one is the other's parent
// or they share a parent (e.g., Moon→Earth, Earth→Moon, Phobos→Deimos, Io→
// Europa).  These are planet-relative maneuvers — the spacecraft never
// leaves the parent's SOI — and our heliocentric Lambert solver cannot
// model them honestly (it would draw a half-orbit around the Sun, which is
// not what you'd actually fly).  Refuse to compute and explain why.
function isPlanetRelativeRoute(b1, b2) {
  if (b1.parent && b1.parent === b2.name) return true;     // moon → its parent
  if (b2.parent && b2.parent === b1.name) return true;     // parent → its moon
  if (b1.parent && b2.parent && b1.parent === b2.parent) return true;
  return false;
}

export function computeRoute() {
  if (!state.routeOrigin || !state.routeDestination) {
    notify('SET ORIGIN AND DESTINATION FIRST'); return;
  }
  if (isPlanetRelativeRoute(state.routeOrigin, state.routeDestination)) {
    notify('PLANET-RELATIVE MANEUVER — pick bodies in different parent systems');
    return;
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
    // Coerce mission cost basis for multi-leg
    if (state.costBasis === 'mission') {
      state.costBasis = 'helio';
      const basisSel = document.getElementById('cost-basis-select');
      if (basisSel) { basisSel.value = 'helio'; basisSel.disabled = true; }
    }

    let waypoints = [
      { body: state.routeOrigin, simTime: departureSimTime },
      ...state.flybys.map(f => ({
        body: resolveFlybyBody(f),
        simTime: f.simTime,
      })),
      { body: state.routeDestination, simTime: 0 },
    ];
    if (waypoints.some(w => !w.body)) {
      notify('INVALID FLYBY BODY'); return;
    }
    const lastFlyby = waypoints[waypoints.length - 2];
    const tailHohmann = hohmannTransfer(lastFlyby.body, state.routeDestination, lastFlyby.simTime);
    waypoints[waypoints.length - 1].simTime = tailHohmann.arrivalSimTime;

    let td = solveMultiLegRoute(waypoints);
    // If seed is infeasible, run coarse multi-leg window search (local opt).
    if (!td.allLegsOk || td.flybys.some(f => !f.achievable)) {
      const win = findMultiLegWindow(
        state.routeOrigin,
        state.routeDestination,
        state.flybys.map(f => ({ body: resolveFlybyBody(f), simTime: f.simTime })),
        departureSimTime,
      );
      if (win) {
        departureSimTime = win.departureSimTime;
        dateInput.value = dateToInputValue(simTimeToDate(win.departureSimTime));
        timeState.simTime = win.departureSimTime;
        timeState.setSpeed(3);
        timeState.updateDisplay();
        state.flybys.forEach((f, i) => {
          f.simTime = win.flybyTimes[i];
        });
        renderFlybyList();
        waypoints = [
          { body: state.routeOrigin, simTime: win.departureSimTime },
          ...state.flybys.map(f => ({ body: resolveFlybyBody(f), simTime: f.simTime })),
          { body: state.routeDestination, simTime: win.arrivalSimTime },
        ];
        td = solveMultiLegRoute(waypoints);
        state.transferData = td;
        state.showTransferOrbit = true;
        updateTransferOrbitVisual();
        renderRouteUI();
        syncShareHash();
        notify('MULTI-LEG WINDOW SEARCHED (local optimum — not global)');
        return;
      }
    }

    state.transferData = td;
    state.showTransferOrbit = true;
    updateTransferOrbitVisual();
    renderRouteUI();
    syncShareHash();
    notify('MULTI-LEG ROUTE COMPUTED');
    return;
  }

  // Single-leg path.
  state.userTofDays = null;
  state.transferData = stampPlanningEphemeris(
    hohmannTransfer(state.routeOrigin, state.routeDestination, departureSimTime),
  );
  solveTransferOrbit(state.transferData);

  let adjusted = false;
  const orb = state.transferData.orbitPhysical;
  const periAU = orb ? (orb.a * (1 - orb.e)) / AU : Infinity;
  const totalDv = state.transferData.dvTotal_lambert ?? state.transferData.dvTotal;
  const pathological = !isFinite(periAU) || periAU < MIN_PERIHELION_AU || totalDv > 30000;

  if (pathological) {
    const fix = findNearestFeasibleTransfer(
      state.routeOrigin, state.routeDestination,
      departureSimTime, state.transferData.transferTime,
      {
        backend: state.transferData.ephemerisBackend,
        classroomMode: state.classroomMode,
      },
    );
    if (fix) {
      // Re-build transferData around the feasible date/TOF.
      state.transferData = stampPlanningEphemeris(
        hohmannTransfer(state.routeOrigin, state.routeDestination, fix.departureSimTime),
      );
      state.transferData.transferTime  = fix.transferTime;
      state.transferData.arrivalSimTime = fix.arrivalSimTime;
      solveTransferOrbit(state.transferData);
      // Reflect the adjusted launch in the UI: update the date input and
      // jump simulation time so the planets are shown in the right phase.
      dateInput.value = dateToInputValue(simTimeToDate(fix.departureSimTime));
      timeState.simTime = fix.departureSimTime;
      timeState.setSpeed(3);
      timeState.updateDisplay();
      adjusted = true;
    }
  }

  state.showTransferOrbit = true;
  updateTransferOrbitVisual();
  renderRouteUI();
  syncShareHash();
  if (adjusted) {
    const newDate = simTimeToDate(state.transferData.departureSimTime).toISOString().slice(0, 10);
    notify(`LAUNCH ADJUSTED TO ${newDate} (NEAREST FEASIBLE WINDOW)`);
  } else {
    notify('TRANSFER ORBIT COMPUTED');
  }
}
