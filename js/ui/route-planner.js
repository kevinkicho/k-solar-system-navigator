import { AU, DAY } from '../constants.js';
import { BODIES } from '../data/bodies.js';
import { bodyId, findByIdOrName, listFlybyEligible, resolveFlybyBody } from '../data/catalog.js';
import { state } from '../state.js';
import { hohmannTransfer } from '../physics/kepler.js';
import {
  MIN_PERIHELION_AU,
  solveMultiLegRoute, solveTransferOrbit,
} from '../physics/routing.js';
import { findNearestFeasibleTransferAsync } from './nearest-feasible-async.js';
import { findMultiLegWindowAsync } from './multi-leg-window-async.js';
import { effectiveBackend } from '../physics/ephemeris-provider.js';
import { dateToInputValue, dateToSimTime, inputValueToDate, notify, simTimeToDate } from './format.js';
import { renderRouteUI, updateTransferOrbitVisual } from './route-display.js';
import { selectBody } from './selection.js';
import { timeState } from './time-system.js';
import { updateBodyList } from './body-list.js';
import { syncShareHash } from './share-sync.js';
import { buildPlanDossier } from './plan-dossier.js';

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

function routePlanOpts() {
  return {
    ephemerisBackend: state.classroomMode
      ? 'approx'
      : (state.ephemerisBackend === 'sample-de' ? 'sample-de' : 'approx'),
    classroomMode: !!state.classroomMode,
  };
}

/**
 * True when sample-de was requested but any planning endpoint fell back to approx.
 */
export function detectSampleFallback(td) {
  if (state.classroomMode || state.ephemerisBackend !== 'sample-de') return false;
  if (!td) return false;
  const pairs = [];
  if (td.isMultiLeg && Array.isArray(td.legs)) {
    for (const L of td.legs) {
      const b1 = findByIdOrName(L.from) || L.fromBody;
      const b2 = findByIdOrName(L.to) || L.toBody;
      if (b1 && L.departSimTime != null) pairs.push([b1, L.departSimTime]);
      if (b2 && L.arriveSimTime != null) pairs.push([b2, L.arriveSimTime]);
    }
  } else {
    if (td.body1 && td.departureSimTime != null) pairs.push([td.body1, td.departureSimTime]);
    if (td.body2 && td.arrivalSimTime != null) pairs.push([td.body2, td.arrivalSimTime]);
  }
  for (const [body, t] of pairs) {
    const { sampleHit } = effectiveBackend(body, t, 'sample-de', {
      classroomMode: false,
    });
    // requested sample-de but sampleHit false means fallback
    if (!sampleHit) return true;
  }
  return false;
}

/** Ensure multi-leg td has body1/body2 for measurement card when possible. */
function tagMultiLegBodies(td) {
  if (!td || !td.isMultiLeg) return td;
  if (!td.body1 && state.routeOrigin) td.body1 = state.routeOrigin;
  if (!td.body2 && state.routeDestination) td.body2 = state.routeDestination;
  stampPlanningEphemeris(td);
  return td;
}

function finalizePlan(td, dossierOpts, notifyMsg) {
  state.transferData = td;
  buildPlanDossier(td, dossierOpts || {});
  state.showTransferOrbit = true;
  updateTransferOrbitVisual();
  renderRouteUI();
  syncShareHash();
  if (notifyMsg) notify(notifyMsg);
  try {
    window.dispatchEvent(new CustomEvent('helios:plan-computed', {
      detail: {
        ok: !!(td && (td.dossier?.mission_ready || td.lambertOk || td.allLegsOk)),
        mission_ready: td?.dossier?.mission_ready ?? null,
        isMultiLeg: !!td?.isMultiLeg,
      },
    }));
  } catch { /* non-browser */ }
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

    const planOpts = routePlanOpts();
    const originBody = state.routeOrigin;
    const destBody = state.routeDestination;
    let td = tagMultiLegBodies(solveMultiLegRoute(waypoints, planOpts));
    const prevDep = departureSimTime;
    // Seed OK — no heavy window search needed
    if (td.allLegsOk && !(td.flybys || []).some(f => !f.achievable)) {
      finalizePlan(td, {
        sampleFallback: detectSampleFallback(td),
      }, 'MULTI-LEG ROUTE COMPUTED (local seed — not global optimum)');
      return;
    }

    // Infeasible seed: coarse multi-leg window search off the main thread when possible
    notify('SEARCHING MULTI-LEG WINDOW (coarse seed)…');
    const searchGen = (state._multiLegSearchGen = (state._multiLegSearchGen || 0) + 1);
    const flybyHints = state.flybys.map(f => ({ body: resolveFlybyBody(f), simTime: f.simTime }));

    findMultiLegWindowAsync(
      originBody,
      destBody,
      flybyHints,
      departureSimTime,
      planOpts,
      {
        onProgress: ({ i, n }) => {
          if (state._multiLegSearchGen !== searchGen) return;
          if (i === 1 || i === n || i % 6 === 0) {
            notify(`SEARCHING MULTI-LEG WINDOW… ${i}/${n}`);
          }
        },
      },
    ).then((win) => {
      if (state._multiLegSearchGen !== searchGen) return;
      if (state.routeOrigin !== originBody || state.routeDestination !== destBody) return;

      if (win) {
        dateInput.value = dateToInputValue(simTimeToDate(win.departureSimTime));
        timeState.simTime = win.departureSimTime;
        timeState.setSpeed(3);
        timeState.updateDisplay();
        state.flybys.forEach((f, i) => {
          f.simTime = win.flybyTimes[i];
        });
        renderFlybyList();
        const wps = [
          { body: originBody, simTime: win.departureSimTime },
          ...state.flybys.map(f => ({ body: resolveFlybyBody(f), simTime: f.simTime })),
          { body: destBody, simTime: win.arrivalSimTime },
        ];
        td = tagMultiLegBodies(solveMultiLegRoute(wps, planOpts));
        const stillBad = !td.allLegsOk || (td.flybys || []).some(f => !f.achievable);
        finalizePlan(td, {
          dateAdjusted: true,
          prevDepartureSimTime: prevDep,
          sampleFallback: detectSampleFallback(td),
        }, stillBad
          ? 'MULTI-LEG SEARCHED — STILL INFEASIBLE (see Plan Status)'
          : 'MULTI-LEG WINDOW SEARCHED (coarse seed — not global optimum)');
        return;
      }
      finalizePlan(td, {
        pathologicalUnrecovered: false,
        sampleFallback: detectSampleFallback(td),
      }, 'MULTI-LEG INFEASIBLE — NO WINDOW FOUND (see Plan Status)');
    }).catch((err) => {
      if (state._multiLegSearchGen !== searchGen) return;
      console.error(err);
      finalizePlan(td, {
        pathologicalUnrecovered: true,
        sampleFallback: detectSampleFallback(td),
      }, 'MULTI-LEG SEARCH ERROR (see Plan Status)');
    });
    return;
  }

  // Single-leg path.
  state.userTofDays = null;
  const prevDepSingle = departureSimTime;
  const originBody = state.routeOrigin;
  const destBody = state.routeDestination;
  state.transferData = stampPlanningEphemeris(
    hohmannTransfer(originBody, destBody, departureSimTime),
  );
  solveTransferOrbit(state.transferData);

  const orb = state.transferData.orbitPhysical;
  const periAU = orb ? (orb.a * (1 - orb.e)) / AU : Infinity;
  const totalDv = state.transferData.dvTotal_lambert ?? state.transferData.dvTotal;
  const pathological = !isFinite(periAU) || periAU < MIN_PERIHELION_AU || totalDv > 30000;

  if (!pathological) {
    finalizePlan(state.transferData, {
      dateAdjusted: false,
      sampleFallback: detectSampleFallback(state.transferData),
    }, 'TRANSFER ORBIT COMPUTED');
    return;
  }

  // Pathological: search nearest feasible window off the main thread when possible.
  const tofHint = state.transferData.transferTime;
  const backend = state.transferData.ephemerisBackend;
  const classroomMode = state.classroomMode;
  notify('SEARCHING NEAREST FEASIBLE WINDOW…');

  // Capture generation so a second Compute supersedes this search.
  const searchGen = (state._nearestSearchGen = (state._nearestSearchGen || 0) + 1);

  findNearestFeasibleTransferAsync(originBody, destBody, departureSimTime, tofHint, {
    backend,
    classroomMode,
    onProgress: ({ i, n }) => {
      if (state._nearestSearchGen !== searchGen) return;
      if (i === 1 || i === n || i % 10 === 0) {
        notify(`SEARCHING WINDOW… ${i}/${n}`);
      }
    },
  }).then((fix) => {
    if (state._nearestSearchGen !== searchGen) return;
    // Origin/dest may have changed during search
    if (state.routeOrigin !== originBody || state.routeDestination !== destBody) return;

    let adjusted = false;
    let unrecovered = false;
    if (fix) {
      state.transferData = stampPlanningEphemeris(
        hohmannTransfer(originBody, destBody, fix.departureSimTime),
      );
      state.transferData.transferTime = fix.transferTime;
      state.transferData.arrivalSimTime = fix.arrivalSimTime;
      solveTransferOrbit(state.transferData);
      dateInput.value = dateToInputValue(simTimeToDate(fix.departureSimTime));
      timeState.simTime = fix.departureSimTime;
      timeState.setSpeed(3);
      timeState.updateDisplay();
      adjusted = true;
    } else {
      unrecovered = true;
    }

    const newDate = simTimeToDate(state.transferData.departureSimTime).toISOString().slice(0, 10);
    finalizePlan(state.transferData, {
      dateAdjusted: adjusted,
      prevDepartureSimTime: adjusted ? prevDepSingle : null,
      pathologicalUnrecovered: unrecovered,
      sampleFallback: detectSampleFallback(state.transferData),
    }, unrecovered
      ? 'PLAN FAILED — NO FEASIBLE WINDOW (see Plan Status)'
      : adjusted
        ? `LAUNCH ADJUSTED TO ${newDate} (NEAREST FEASIBLE WINDOW)`
        : 'TRANSFER ORBIT COMPUTED');
  }).catch((err) => {
    if (state._nearestSearchGen !== searchGen) return;
    console.error(err);
    finalizePlan(state.transferData, {
      pathologicalUnrecovered: true,
      sampleFallback: detectSampleFallback(state.transferData),
    }, 'PLAN FAILED — WINDOW SEARCH ERROR (see Plan Status)');
  });
}
