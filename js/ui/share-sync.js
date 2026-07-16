// Hash bar sync + recent-route bookmarking without importing route-planner
// (avoids a cycle with share.js ↔ route-planner.js).

import { DAY } from '../constants.js';
import { state } from '../state.js';
import { bodyId } from '../data/catalog.js';
import { encodePlanRequestObject, padDate, MAX_FLYS } from './share-codec.js';
import { simTimeToDate } from './format.js';
import { resolveFlybyBody } from '../data/catalog.js';
import { pushRecentRoute } from './recent-routes.js';
import { timeState } from './time-system.js';

function encodeFromState() {
  const origin = state.routeOrigin;
  const dest = state.routeDestination;
  if (!origin || !dest) return null;

  const td = state.transferData;
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
    cargo: state.cargoMass_kg || 0,
    arch: state.vehicleId === 'sh-starship' ? (state.starshipArch || 'legacy-demo') : undefined,
    tankers: state.starshipArch === 'tanker-n' ? (state.tankerCount || 0) : undefined,
    f9v: state.vehicleId === 'falcon9' ? (state.falcon9Variant || 'expendable') : undefined,
  };
  if (!isMulti) {
    const tofDays = state.userTofDays != null
      ? Math.round(state.userTofDays)
      : (td ? Math.round(td.transferTime / DAY) : null);
    if (tofDays != null && isFinite(tofDays)) plan.tof = tofDays;
  }
  const flybys = state.flybys || [];
  if (flybys.length > 0) {
    plan.fb = flybys.slice(0, MAX_FLYS).map((f) => {
      const b = resolveFlybyBody(f);
      const id = b ? bodyId(b) : (f.bodyId || f.bodyName);
      return { id, date: padDate(simTimeToDate(f.simTime)) };
    });
  }
  return encodePlanRequestObject(plan);
}

/** Push current plan into the address bar without reloading. */
export function syncShareHash() {
  const hash = encodeFromState();
  if (!hash) return;
  try {
    history.replaceState(null, '', location.pathname + location.search + hash);
  } catch { /* ignore */ }

  const origin = state.routeOrigin;
  const dest = state.routeDestination;
  if (!origin || !dest) return;
  const td = state.transferData;
  const dep = td ? padDate(simTimeToDate(td.departureSimTime)) : null;
  pushRecentRoute({
    o: bodyId(origin),
    d: bodyId(dest),
    dep,
    tof: td && !td.isMultiLeg ? Math.round(td.transferTime / DAY) : null,
    label: `${origin.name} → ${dest.name}`,
  });
}
