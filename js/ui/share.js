// Shareable mission plan codec v1 — location.hash only.
// Pure parse/encode live in share-codec.js (offline-testable).

import { DAY } from '../constants.js';
import { state } from '../state.js';
import { bodyId, findById, findByIdOrName, resolveFlybyBody } from '../data/catalog.js';
import { setDisplayMode } from '../display-scale.js';
import { hohmannTransfer } from '../physics/kepler.js';
import { MIN_PERIHELION_AU, findNearestFeasibleTransfer, solveMultiLegRoute, solveTransferOrbit } from '../physics/routing.js';
import { dateToInputValue, dateToSimTime, notify, simTimeToDate } from './format.js';
import { renderRouteUI, updateTransferOrbitVisual } from './route-display.js';
import { setRouteDestination, setRouteOrigin, renderFlybyList } from './route-planner.js';
import { timeState } from './time-system.js';
import { updateBodyList } from './body-list.js';
import {
  encodePlanRequestObject, parsePlanRequest as parseHash, padDate, MAX_FLYS,
} from './share-codec.js';

export function parsePlanRequest(hash) { return parseHash(hash); }

export function encodePlanRequest(opts = {}) {
  const origin = opts.origin || state.routeOrigin;
  const dest = opts.destination || state.routeDestination;
  if (!origin || !dest) return null;

  const td = opts.transferData || state.transferData;
  const depSim = td?.departureSimTime ?? timeState.simTime;
  const dep = padDate(simTimeToDate(depSim));

  const isMulti = !!(td?.isMultiLeg) || (state.flybys && state.flybys.length > 0);
  const plan = {
    o: bodyId(origin),
    d: bodyId(dest),
    dep,
    veh: state.vehicleId || 'sh-starship',
    ab: state.abstractBudget_m_s,
    basis: isMulti ? 'helio' : (state.costBasis || 'helio'),
    view: state.display?.mode || 'cinematic',
  };
  if (!isMulti) {
    const tofDays = state.userTofDays != null
      ? Math.round(state.userTofDays)
      : (td ? Math.round(td.transferTime / DAY) : null);
    if (tofDays != null && isFinite(tofDays)) plan.tof = tofDays;
  }
  const flybys = state.flybys || [];
  if (flybys.length > 0) {
    plan.fb = flybys.slice(0, MAX_FLYS).map(f => {
      const b = resolveFlybyBody(f);
      const id = b ? bodyId(b) : (f.bodyId || f.bodyName);
      return { id, date: padDate(simTimeToDate(f.simTime)) };
    });
  }
  return encodePlanRequestObject(plan);
}

export function applyPlanRequest(req) {
  if (!req) return false;
  const origin = findByIdOrName(req.originId);
  const dest = findByIdOrName(req.destId);
  if (!origin || !dest) {
    notify('SHARE LINK: unknown body id');
    return false;
  }

  setDisplayMode(req.view);
  state.vehicleId = req.vehicleId || 'sh-starship';
  state.abstractBudget_m_s = req.abstractBudget_m_s ?? 8000;
  state.costBasis = req.costBasis || 'helio';
  state.cargoMass_kg = req.cargoMass_kg ?? 0;
  if (req.vehicleId === 'sh-starship' || !req.vehicleId) {
    state.starshipArch = req.starshipArch || 'legacy-demo';
    if (req.archOmitted) notify('SHARE OMITTED ARCH — USING LEGACY-DEMO');
  }
  if (req.tankerCount != null) state.tankerCount = req.tankerCount;
  if (req.falcon9Variant) state.falcon9Variant = req.falcon9Variant;
  if (state.classroomMode) {
    state.ephemerisBackend = 'approx';
    state.fidelityLevel = 'L1';
  } else if (req.ephemerisBackend === 'sample-de') {
    state.ephemerisBackend = 'sample-de';
    state.fidelityLevel = 'L2-plan';
  } else {
    state.ephemerisBackend = 'approx';
    // keep L2-compare if already set; otherwise L1
    if (state.fidelityLevel === 'L2-plan') state.fidelityLevel = 'L1';
  }
  const ephSel = document.getElementById('ephemeris-backend');
  if (ephSel) ephSel.value = state.ephemerisBackend;
  if (req.flybys.length > 0 && req.costBasis === 'mission') {
    notify('MISSION BASIS IS SINGLE-LEG ONLY — USING HELIO');
    state.costBasis = 'helio';
  }
  if (req.tofIgnoredMulti) notify('TOF IGNORED FOR MULTI-LEG');
  // Sync vehicle UI controls if present
  const vehSel = document.getElementById('vehicle-select');
  if (vehSel) vehSel.value = state.vehicleId;
  const cargoIn = document.getElementById('cargo-mass');
  if (cargoIn) cargoIn.value = String(state.cargoMass_kg);
  const archSel = document.getElementById('starship-arch');
  if (archSel && state.starshipArch) archSel.value = state.starshipArch;

  setRouteOrigin(origin);
  setRouteDestination(dest);

  const depSim = dateToSimTime(req.depDate);
  timeState.simTime = depSim;
  timeState.setSpeed(3);
  timeState.updateDisplay();
  const depInput = document.getElementById('depart-date');
  if (depInput) depInput.value = dateToInputValue(req.depDate);

  state.flybys = [];
  for (const f of req.flybys) {
    const body = findById(f.bodyId);
    if (!body || !body.flybyEligible) continue;
    state.flybys.push({
      bodyId: body.id,
      bodyName: body.name,
      simTime: dateToSimTime(f.date),
    });
  }
  renderFlybyList();

  // Sync vehicle UI if present
  const vehSel = document.getElementById('vehicle-select');
  if (vehSel) vehSel.value = state.vehicleId;
  const basisSel = document.getElementById('cost-basis-select');
  if (basisSel) {
    basisSel.value = state.costBasis;
    basisSel.disabled = state.flybys.length > 0;
  }
  const abInput = document.getElementById('abstract-budget');
  if (abInput) abInput.value = String(state.abstractBudget_m_s);
  updateViewBadge();

  if (state.flybys.length > 0) {
    const waypoints = [
      { body: origin, simTime: depSim },
      ...state.flybys.map(f => ({ body: resolveFlybyBody(f), simTime: f.simTime })).filter(w => w.body),
      // Destination arrival: Hohmann-ish gap after last flyby
      { body: dest, simTime: state.flybys[state.flybys.length - 1].simTime + hohmannTransfer(
        resolveFlybyBody(state.flybys[state.flybys.length - 1]) || origin, dest,
        state.flybys[state.flybys.length - 1].simTime,
      ).transferTime },
    ];
    // Prefer last flyby + dest with proper TOF
    const lastFb = state.flybys[state.flybys.length - 1];
    const lastBody = resolveFlybyBody(lastFb);
    const h = hohmannTransfer(lastBody || origin, dest, lastFb.simTime);
    waypoints[waypoints.length - 1] = { body: dest, simTime: lastFb.simTime + h.transferTime };

    state.transferData = solveMultiLegRoute(waypoints);
    state.showTransferOrbit = true;
    state.userTofDays = null;
  } else {
    state.transferData = hohmannTransfer(origin, dest, depSim);
    if (req.tofDays != null) {
      state.userTofDays = req.tofDays;
      state.transferData.transferTime = req.tofDays * DAY;
      state.transferData.arrivalSimTime = depSim + req.tofDays * DAY;
      state.transferData.departureSimTime = depSim;
    } else {
      state.userTofDays = null;
    }
    solveTransferOrbit(state.transferData);

    // Pathological auto-snap only
    const td = state.transferData;
    if (td.lambertOk && td.orbitPhysical) {
      const peri = td.orbitPhysical.a * (1 - td.orbitPhysical.e) / (1.495978707e11);
      const dv = td.dvTotal_lambert;
      if (peri < MIN_PERIHELION_AU || dv > 30000) {
        const best = findNearestFeasibleTransfer(origin, dest, depSim, td.transferTime);
        if (best) {
          timeState.simTime = best.departureSimTime;
          state.transferData = hohmannTransfer(origin, dest, best.departureSimTime);
          state.transferData.transferTime = best.transferTime;
          state.transferData.arrivalSimTime = best.arrivalSimTime;
          state.transferData.departureSimTime = best.departureSimTime;
          solveTransferOrbit(state.transferData);
          if (depInput) depInput.value = dateToInputValue(simTimeToDate(best.departureSimTime));
        }
      }
    }
    state.showTransferOrbit = true;
  }

  updateTransferOrbitVisual();
  renderRouteUI();
  updateBodyList();
  notify(`LOADED SHARE: ${origin.name.toUpperCase()} → ${dest.name.toUpperCase()}`);
  return true;
}

export { syncShareHash } from './share-sync.js';

export function copyShareLink() {
  const hash = encodePlanRequest();
  if (!hash) {
    notify('CANNOT SHARE — set origin/destination (or plan too long)');
    return;
  }
  import('./share-sync.js').then(({ syncShareHash }) => syncShareHash());
  const url = location.origin + location.pathname + location.search + hash;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(
      () => notify('SHARE LINK COPIED'),
      () => fallbackCopy(url),
    );
  } else {
    fallbackCopy(url);
  }
}

function fallbackCopy(url) {
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    notify('SHARE LINK COPIED');
  } catch {
    notify('COPY FAILED — see console');
    console.log(url);
  }
}

export function tryApplyHashOnLoad() {
  const req = parsePlanRequest(location.hash);
  if (req) applyPlanRequest(req);
}

export function updateViewBadge() {
  const el = document.getElementById('view-mode-badge');
  if (!el) return;
  import('../display-scale.js').then(({ displayModeBadge }) => {
    el.textContent = displayModeBadge();
  });
}
