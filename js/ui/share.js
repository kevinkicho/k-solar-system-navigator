// Shareable mission plan codec v1 — location.hash only.
// Pure parse/encode live in share-codec.js (offline-testable).

import { DAY } from '../constants.js';
import { state } from '../state.js';
import { bodyId, resolveFlybyBody } from '../data/catalog.js';
import { notify, simTimeToDate } from './format.js';
import { timeState } from './time-system.js';
import {
  encodePlanRequestObject, parsePlanRequest as parseHash, padDate, MAX_FLYS,
} from './share-codec.js';
import {
  cloneSurfacePoint, isSurfacePointActive,
} from '../physics/surface-point.js';

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
    view: state.display?.mode || 'cinematic'};
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
  // Geographic sites from state or transferData
  const os = td?.surfaceOriginPoint || state.routeOriginPoint;
  const ds = td?.surfaceDestPoint || state.routeDestPoint;
  if (isSurfacePointActive(os)) plan.originSite = cloneSurfacePoint(os, origin);
  if (isSurfacePointActive(ds)) plan.destSite = cloneSurfacePoint(ds, dest);
  return encodePlanRequestObject(plan);
}

/**
 * Apply share/hash plan via domain command bus (single apply path).
 * Returns a Promise<boolean> (thenable — sync callers treat as truthy while loading).
 * @param {object} req parsePlanRequest shape or compact seed
 * @returns {Promise<boolean>}
 */
export async function applyPlanRequest(req) {
  if (!req) return false;
  const { normalizePlanRequest } = await import('../domain/plan-seed.js');
  const { reapplyPlanRequest } = await import('../domain/plan-apply.js');
  const seed = normalizePlanRequest(req);
  if (!seed?.o || !seed?.d) {
    notify('SHARE LINK: unknown body id');
    return false;
  }
  if (Array.isArray(req.flybys) && req.flybys.length > 0 && (req.costBasis === 'mission' || seed.basis === 'mission')) {
    notify('MISSION BASIS IS SINGLE-LEG ONLY — USING HELIO');
    seed.basis = 'helio';
  }
  if (req.tofIgnoredMulti) notify('TOF IGNORED FOR MULTI-LEG');

  const r = await reapplyPlanRequest(seed, { notifyUser: false, compute: true });
  if (!r.ok) {
    notify(r.error || 'SHARE APPLY FAILED');
    return false;
  }
  try {
    const { updateTransferOrbitVisual } = await import('./route-orbit-visual.js');
    updateTransferOrbitVisual?.();
  } catch { /* */ }
  try {
    const { renderRouteUI } = await import('./route-display.js');
    if (state.transferData) renderRouteUI();
  } catch { /* */ }
  try {
    const { updateBodyList } = await import('./body-list.js');
    updateBodyList();
  } catch { /* */ }
  updateViewBadge();
  notify(`LOADED SHARE: ${(seed.o || '?').toUpperCase()} → ${(seed.d || '?').toUpperCase()}`);
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
  if (req) {
    applyPlanRequest(req).catch((e) => console.warn('[HELIOS] hash apply', e));
  }
}

export function updateViewBadge() {
  const el = document.getElementById('view-mode-badge');
  if (!el) return;
  import('../domain/display-modes.js').then(({ productModeBadgeText, productModeTitle, getProductMode }) => {
    const mode = getProductMode();
    el.textContent = productModeBadgeText();
    el.title = productModeTitle();
    el.dataset.productMode = mode;
  }).catch(() => {
    try {
      if (state.physicsAccurate) {
        el.textContent = 'VIEW: PHYSICS-ACCURATE';
        return;
      }
      if (state.mapMode) {
        el.textContent = 'VIEW: MAP · dual path';
        return;
      }
    } catch { /* */ }
    import('../display-scale.js').then(({ displayModeBadge }) => {
      el.textContent = displayModeBadge();
    });
  });
}
