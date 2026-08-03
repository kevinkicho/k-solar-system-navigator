/**
 * Pin up to 3 plan snapshots for compare workspace.
 * Snapshots store recompute seeds + triad numbers — never treat stored Δv as flight truth.
 */

const MAX_PINS = 3;
const STORAGE_KEY = 'helios-plan-pins-v1';

/**
 * Snapshot current app plan for pin board.
 * @param {object} appState
 * @param {object} [extra]
 */
export function snapshotPlanPin(appState, extra = {}) {
  const td = appState.transferData;
  const need = td?.dossier?.need || td?.need || null;
  const cap = td?.dossier?.capability || td?.capability || null;
  const margin = td?.dossier?.margin || td?.margin || null;
  const o = appState.routeOrigin;
  const d = appState.routeDestination;
  return {
    id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    pinned_at: new Date().toISOString(),
    label: extra.label || `${o?.name || '?'} → ${d?.name || '?'}`,
    route: {
      origin: o?.name || null,
      destination: d?.name || null,
      originId: o?.id || o?.name || null,
      destId: d?.id || d?.name || null,
      flybys: (appState.flybys || []).map((f) => f.bodyName || f.bodyId),
    },
    vehicle: {
      vehicleId: appState.vehicleId,
      starshipArch: appState.starshipArch,
      tankerCount: appState.tankerCount,
      cargoMass_kg: appState.cargoMass_kg,
      launchSiteId: appState.launchSiteId,
    },
    fidelity: {
      level: appState.fidelityLevel,
      backend: appState.ephemerisBackend,
      pathGeometry: appState.pathGeometry,
    },
    triad: {
      need_m_s: need?.need_dv_m_s ?? need?.need ?? null,
      capability_m_s: cap?.capability_dv_m_s ?? cap?.capability ?? null,
      margin_m_s: margin?.margin_dv_m_s ?? margin?.margin ?? null,
      feasible: margin?.feasible ?? null,
    },
    dossier: td?.dossier
      ? {
          status: td.dossier.status,
          mission_ready: td.dossier.mission_ready,
          fail_count: (td.dossier.gates || []).filter((g) => g.level === 'fail').length,
        }
      : null,
    departureSimTime: td?.departureSimTime ?? null,
    notes: extra.notes || null,
    product_class: 'preliminary-not-flight-certified',
  };
}

/**
 * Diff two pins for UI.
 */
export function diffPlanPins(a, b) {
  if (!a || !b) return { error: 'need two pins' };
  const dn = numDiff(a.triad?.need_m_s, b.triad?.need_m_s);
  const dm = numDiff(a.triad?.margin_m_s, b.triad?.margin_m_s);
  return {
    a_label: a.label,
    b_label: b.label,
    need_delta_m_s: dn,
    margin_delta_m_s: dm,
    route_same: a.route?.origin === b.route?.origin && a.route?.destination === b.route?.destination,
    vehicle_same: a.vehicle?.vehicleId === b.vehicle?.vehicleId
      && a.vehicle?.starshipArch === b.vehicle?.starshipArch
      && a.vehicle?.cargoMass_kg === b.vehicle?.cargoMass_kg,
    ready_a: !!a.dossier?.mission_ready,
    ready_b: !!b.dossier?.mission_ready,
    note: 'Diff of stored snapshot numbers — recompute for authority.',
  };
}

function numDiff(x, y) {
  if (x == null || y == null || !isFinite(x) || !isFinite(y)) return null;
  return y - x;
}

/** In-memory pin board (also mirrored to state by UI). */
let _pins = loadPins();

export function getPlanPins() {
  return _pins.slice();
}

export function pinPlan(appState, extra = {}) {
  const snap = snapshotPlanPin(appState, extra);
  _pins = [snap, ..._pins].slice(0, MAX_PINS);
  savePins();
  return snap;
}

export function clearPlanPins() {
  _pins = [];
  savePins();
}

export function removePlanPin(id) {
  _pins = _pins.filter((p) => p.id !== id);
  savePins();
}

function loadPins() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_PINS) : [];
  } catch {
    return [];
  }
}

function savePins() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_pins));
  } catch { /* */ }
}
