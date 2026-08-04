/**
 * First-class Campaign object — schema, timeline, undo (recompute seeds only).
 * Never treats stored Δv as authority. Not flight-certified.
 */

import { state } from '../state.js';
import { bodyId } from '../data/catalog.js';
import { DAY } from '../constants.js';
import { buildPathTruth, formatPathTruthLine } from '../physics/path-truth.js';

export const CAMPAIGN_SCHEMA_VERSION = 1;
const MAX_STEPS = 40;
const STORAGE_KEY = 'helios-campaign-timeline-v1';

/** @type {{ id: string, steps: object[], cursor: number, created_at: string, updated_at: string }|null} */
let _campaign = null;
const listeners = new Set();

export function getCampaign() {
  return _campaign;
}

export function onCampaignChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(_campaign); } catch { /* */ }
  }
  try {
    window.dispatchEvent(new CustomEvent('helios-campaign', { detail: _campaign }));
  } catch { /* */ }
  saveLocal();
}

function saveLocal() {
  try {
    if (typeof localStorage === 'undefined' || !_campaign) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      id: _campaign.id,
      steps: _campaign.steps.slice(-MAX_STEPS),
      cursor: _campaign.cursor,
      created_at: _campaign.created_at,
      updated_at: _campaign.updated_at,
    }));
  } catch { /* */ }
}

export function loadCampaignFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    _campaign = JSON.parse(raw);
    emit();
    return _campaign;
  } catch {
    return null;
  }
}

/**
 * Compact plan_request-like seed for recompute (share-codec compatible fields).
 */
export function buildPlanRequestFromState(appState = state, td = appState.transferData) {
  const o = appState.routeOrigin;
  const d = appState.routeDestination;
  if (!o || !d) return null;
  const depSim = td?.departureSimTime;
  const depDay = depSim != null
    ? new Date(depSim * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString().slice(0, 10)
    : null;
  const tofDays = td?.transferTime != null ? Math.round(td.transferTime / DAY) : (appState.userTofDays ?? null);
  const pr = {
    v: 2,
    o: bodyId(o) || o.name?.toLowerCase(),
    d: bodyId(d) || d.name?.toLowerCase(),
    dep: depDay,
    tof: tofDays,
    veh: appState.vehicleId || 'sh-starship',
    cargo: Math.round(appState.cargoMass_kg || 0),
    arch: appState.vehicleId === 'sh-starship' ? (appState.starshipArch || 'unrefueled') : undefined,
    tankers: appState.starshipArch === 'tanker-n' ? (appState.tankerCount || 0) : undefined,
    f9v: appState.vehicleId === 'falcon9' ? (appState.falcon9Variant || 'expendable') : undefined,
    eph: appState.ephemerisBackend === 'sample-de' ? 'sample' : undefined,
    site: appState.launchSiteId || 'any',
  };
  if (appState.flybys?.length) {
    pr.fb = appState.flybys.slice(0, 6).map((f) => ({
      id: f.bodyId || (f.bodyName || '').toLowerCase(),
      date: f.simTime != null
        ? new Date(f.simTime * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString().slice(0, 10)
        : null,
    })).filter((x) => x.id);
  }
  return pr;
}

/**
 * Full campaign snapshot for package / cloud / AI.
 */
export function snapshotCampaign(appState = state, extra = {}) {
  const td = appState.transferData;
  const need = td?.dossier?.need || td?.need || null;
  const margin = td?.dossier?.margin || td?.margin || null;
  let pathTruthLine = null;
  try {
    if (td) pathTruthLine = formatPathTruthLine(buildPathTruth(td, appState));
  } catch { /* */ }

  return {
    schema_version: CAMPAIGN_SCHEMA_VERSION,
    product_class: 'preliminary-not-flight-certified',
    note: 'Recompute from plan_request for authority — never trust stored Δv alone.',
    generated_at: new Date().toISOString(),
    label: extra.label || (
      appState.routeOrigin && appState.routeDestination
        ? `${appState.routeOrigin.name} → ${appState.routeDestination.name}`
        : 'HELIOS campaign'
    ),
    plan_request: buildPlanRequestFromState(appState, td),
    route: {
      origin: appState.routeOrigin?.name || null,
      destination: appState.routeDestination?.name || null,
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
      scenePathNote: 'cinematic scene path may be visual; Need always physical',
    },
    triad: {
      need_m_s: need?.need_dv_m_s ?? need?.need ?? null,
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
    path_truth_line: pathTruthLine,
    window_families_n: appState.windowFamilies?.families?.length ?? 0,
    architecture_matrix_n: appState.architectureMatrix?.rows?.length ?? 0,
    pins_n: appState.planPins?.length ?? 0,
    build_sha: typeof document !== 'undefined'
      ? (document.querySelector('meta[name="helios-build"]')?.content || null)
      : null,
    ...extra,
  };
}

/**
 * Ensure campaign exists; push a timeline step with plan_request snapshot.
 * @param {{ kind: string, label: string, detail?: string, source?: string }} step
 */
export function pushCampaignStep(step) {
  if (!_campaign) {
    _campaign = {
      id: `camp-${Date.now()}`,
      steps: [],
      cursor: -1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      product_class: 'preliminary-not-flight-certified',
    };
  }
  // Truncate redo tail
  if (_campaign.cursor < _campaign.steps.length - 1) {
    _campaign.steps = _campaign.steps.slice(0, _campaign.cursor + 1);
  }
  const snap = snapshotCampaign(state, { label: step.label });
  _campaign.steps.push({
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    kind: step.kind || 'action',
    label: step.label || step.kind || 'step',
    detail: step.detail || null,
    source: step.source || 'ui',
    plan_request: snap.plan_request,
    triad: snap.triad,
    dossier_status: snap.dossier?.status ?? null,
    mission_ready: snap.dossier?.mission_ready ?? null,
  });
  if (_campaign.steps.length > MAX_STEPS) {
    _campaign.steps = _campaign.steps.slice(-MAX_STEPS);
  }
  _campaign.cursor = _campaign.steps.length - 1;
  _campaign.updated_at = new Date().toISOString();
  emit();
  return _campaign.steps[_campaign.cursor];
}

export function listCampaignSteps() {
  return _campaign?.steps?.slice() || [];
}

export function campaignCursor() {
  return _campaign?.cursor ?? -1;
}

/**
 * Jump cursor (undo/redo position). Does not auto-reapply — caller applies plan_request.
 */
export function setCampaignCursor(index) {
  if (!_campaign?.steps?.length) return null;
  const i = Math.max(0, Math.min(_campaign.steps.length - 1, index | 0));
  _campaign.cursor = i;
  _campaign.updated_at = new Date().toISOString();
  emit();
  return _campaign.steps[i];
}

export function undoCampaignStep() {
  if (!_campaign || _campaign.cursor <= 0) return null;
  return setCampaignCursor(_campaign.cursor - 1);
}

export function redoCampaignStep() {
  if (!_campaign || _campaign.cursor >= _campaign.steps.length - 1) return null;
  return setCampaignCursor(_campaign.cursor + 1);
}

export function clearCampaign() {
  _campaign = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  emit();
}

/**
 * Format timeline for UI / package.
 */
export function formatCampaignTimeline(camp = _campaign) {
  if (!camp?.steps?.length) return ['(no campaign steps yet)'];
  return camp.steps.map((s, i) => {
    const cur = i === camp.cursor ? ' ◀' : '';
    const ready = s.mission_ready ? 'READY' : (s.dossier_status || '—');
    return `${i + 1}. [${s.kind}] ${s.label} · ${ready}${cur}`;
  });
}
