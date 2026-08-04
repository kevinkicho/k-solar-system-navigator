/**
 * Onboard agent — browser-side command & control executor.
 * Polls POST /api/agent/claim and applies actions to the live app.
 */

import { state } from '../state.js';
import { findByIdOrName, listRouteable } from '../data/catalog.js';
import { notify, dateToInputValue, dateToSimTime } from '../ui/format.js';
import {
  setRouteOrigin,
  setRouteDestination,
  clearRoute,
  computeRoute,
} from '../ui/route-planner.js';
import { timeState } from '../ui/time-system.js';
import { heliosJson } from './api-auth.js';
import { buildMissionSnapshot } from './transfer-summary.js';

const POLL_MS = 800;
const HEARTBEAT_MS = 4000;
const COMPUTE_WAIT_MS = 120_000;
const AGENT_ID = 'onboard-' + Math.random().toString(36).slice(2, 10);

let pollTimer = null;
let beatTimer = null;
let running = false;
let pollInFlight = false;
let authRequired = false;

function snapshotState() {
  return buildMissionSnapshot(state, {
    departure: dateToInputValue(timeState.getDate()),
  });
}

function resolveBody(name) {
  if (!name || typeof name !== 'string') return null;
  return findByIdOrName(name.trim());
}

function listBodyNames() {
  return listRouteable()
    .map((b) => b.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function waitForPlanComputed(timeoutMs = COMPUTE_WAIT_MS) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (payload) => {
      if (done) return;
      done = true;
      window.removeEventListener('helios:plan-computed', onEvt);
      clearTimeout(timer);
      resolve(payload);
    };
    const onEvt = (e) => finish(e.detail || { ok: true });
    const timer = setTimeout(() => finish({ ok: true, timedOut: true }), timeoutMs);
    window.addEventListener('helios:plan-computed', onEvt);
    // If compute already finished synchronously before listener, snapshot soon
    queueMicrotask(() => {
      if (state.transferData?.dossier || state.transferData) {
        // still wait a tick for event from finalizePlan
      }
    });
  });
}

async function executeCommand(cmd) {
  const action = cmd.action;
  const args = cmd.args || {};

  switch (action) {
    case 'get_mission_state':
    case 'get_state':
      return snapshotState();

    case 'get_mission_brief_context': {
      const { getMissionAiBundle } = await import('./ai-core.js');
      const bundle = getMissionAiBundle();
      return {
        context: bundle.ctx,
        next_actions: bundle.next,
        snapshot: snapshotState(),
      };
    }

    case 'run_mission_campaign': {
      const { runMissionCampaign } = await import('./campaign.js');
      return runMissionCampaign(args);
    }

    case 'propose_gate_recovery': {
      const { proposeGateRecovery } = await import('./recovery.js');
      return proposeGateRecovery();
    }

    case 'apply_gate_recovery': {
      const { applyGateRecovery } = await import('./recovery.js');
      return applyGateRecovery(args.actionId || args.id, args);
    }

    case 'find_nearest_window': {
      const { findNearestWindowAndApply } = await import('./recovery.js');
      return findNearestWindowAndApply();
    }

    case 'set_launch_site': {
      state.launchSiteId = String(args.launchSiteId || 'any');
      const sel = document.getElementById('launch-site');
      if (sel) {
        sel.value = state.launchSiteId;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { launchSiteId: state.launchSiteId };
    }

    case 'suggest_ga': {
      const thoroughEl = document.getElementById('ga-suggest-thorough');
      if (thoroughEl && args.thorough != null) thoroughEl.checked = !!args.thorough;
      const { runGaSuggestions } = await import('../ui/ga-suggest-ui.js');
      if (typeof runGaSuggestions === 'function') {
        await runGaSuggestions();
      } else {
        document.getElementById('btn-ga-suggest')?.click();
      }
      return {
        ok: true,
        n: state.gaSuggestions?.suggestions?.length ?? 0,
        recommended: state.gaSuggestions?.suggestions?.find((s) => s.recommended)?.label || null,
      };
    }

    case 'suggest_itineraries': {
      const thoroughEl = document.getElementById('itin-thorough');
      if (thoroughEl && args.thorough != null) thoroughEl.checked = !!args.thorough;
      const { runItinerarySuggest } = await import('../ui/itinerary-ui.js');
      const pack = await runItinerarySuggest();
      return {
        ok: true,
        n: pack?.suggestions?.length ?? state.itinerarySuggestions?.suggestions?.length ?? 0,
        recommended:
          pack?.suggestions?.find((s) => s.recommended)?.itineraryLabel
          || pack?.suggestions?.find((s) => s.recommended)?.label
          || null,
        note: pack?.note || state.itinerarySuggestions?.note || null,
      };
    }

    case 'apply_itinerary': {
      const pack = state.itinerarySuggestions;
      const idx = Number(args.index ?? 0);
      if (!pack?.suggestions?.length) {
        throw new Error('No itinerary pack — run suggest_itineraries first');
      }
      const s = pack.suggestions[idx];
      if (!s) throw new Error(`Invalid itinerary index ${idx}`);
      const { applyItinerary } = await import('../ui/itinerary-ui.js');
      applyItinerary(s);
      return {
        ok: true,
        applied: s.itineraryLabel || s.label,
        index: idx,
        stops: s.stops,
      };
    }

    case 'run_campaign_with_log': {
      const { runCampaignWithLog } = await import('./campaign-runner.js');
      const run = await runCampaignWithLog(args, {
        requireApproval: !!args.requireApproval,
      });
      return {
        ok: true,
        id: run?.id,
        status: run?.status,
        steps: (run?.steps || []).map((s) => ({
          id: s.id,
          status: s.status,
          label: s.label,
          detail: s.detail,
        })),
      };
    }

    case 'get_watchdogs': {
      const { runWatchdogs } = await import('./watchdogs.js');
      return runWatchdogs();
    }

    case 'apply_watchdog_action': {
      const { applyWatchdogAction } = await import('./watchdogs.js');
      return applyWatchdogAction({
        type: args.type || args.actionType,
        value: args.value,
      });
    }

    case 'get_window_families': {
      const { clusterWindowFamilies } = await import('../physics/window-families.js');
      const short = state.windowShortlist;
      if (!short?.length) return { ok: false, error: 'no shortlist — open windows first', families: [] };
      const pack = clusterWindowFamilies(short);
      state.windowFamilies = pack;
      return pack;
    }

    case 'get_architecture_matrix': {
      const { buildArchitectureMatrix } = await import('../physics/architecture-matrix.js');
      const need = state.transferData?.dossier?.need;
      if (!need) throw new Error('Compute transfer first (no Need)');
      const matrix = buildArchitectureMatrix(need, {
        cargoMass_kg: state.cargoMass_kg,
        originBody: state.routeOrigin,
      });
      state.architectureMatrix = matrix;
      return matrix;
    }

    case 'pin_plan': {
      const { pinPlan, getPlanPins } = await import('../physics/plan-pins.js');
      if (!state.transferData) throw new Error('Compute transfer first');
      const p = pinPlan(state, { label: args.label });
      state.planPins = getPlanPins();
      return { ok: true, pin: p, n: state.planPins.length };
    }

    case 'diff_plan_pins': {
      const { getPlanPins, diffPlanPins } = await import('../physics/plan-pins.js');
      const pins = getPlanPins();
      if (pins.length < 2) return { ok: false, error: 'need at least 2 pins' };
      return { ok: true, ...diffPlanPins(pins[0], pins[1]), pins: pins.slice(0, 2).map((p) => p.label) };
    }

    case 'get_residual_dashboard': {
      const { buildResidualDashboard } = await import('../physics/residual-dashboard.js');
      return buildResidualDashboard(state.transferData, state);
    }

    case 'apply_fidelity_preset': {
      const { applyFidelityPreset } = await import('../physics/fidelity-presets.js');
      const r = applyFidelityPreset(state, args.presetId || args.id);
      if (!r.ok) throw new Error(r.error || 'preset failed');
      return r;
    }

    case 'run_campaign_dag': {
      const { runCampaignDag } = await import('./campaign-dag.js');
      const dag = await runCampaignDag(args);
      return {
        ok: true,
        id: dag?.id,
        status: dag?.status,
        nodes: (dag?.nodes || []).map((n) => ({
          id: n.id, status: n.status, label: n.label, detail: n.detail,
        })),
      };
    }

    case 'run_playbook': {
      const { runPlaybook } = await import('./playbook-runner.js');
      return runPlaybook(args.playbookId || args.id);
    }

    case 'list_playbooks': {
      const { listPlaybooks } = await import('./playbooks.js');
      return {
        playbooks: listPlaybooks().map((p) => ({
          id: p.id, label: p.label, description: p.description, n_steps: p.steps?.length,
        })),
      };
    }

    case 'get_moon_system_sketch': {
      const { moonSystemTemplates } = await import('../physics/moon-system-sketch.js');
      return moonSystemTemplates(state.routeOrigin, state.routeDestination);
    }

    case 'add_dsm_seed': {
      const { suggestMidcourseDsmSeed, normalizeDsmNodes, needWithDsmSketch } = await import('../physics/dsm-nodes.js');
      const seed = suggestMidcourseDsmSeed({
        dv_m_s: args.dv_m_s,
        epoch_frac: args.epoch_frac,
      });
      state.dsmNodes = normalizeDsmNodes([...(state.dsmNodes || []), ...seed]);
      const sketch = needWithDsmSketch(
        state.transferData?.dossier?.need?.need_dv_m_s ?? state.transferData?.dvTotal_lambert ?? null,
        state.dsmNodes,
      );
      return { ok: true, nodes: state.dsmNodes, sketch };
    }

    case 'get_need_waterfall': {
      const { buildNeedWaterfall } = await import('../physics/need-waterfall.js');
      const wf = buildNeedWaterfall({
        need: state.transferData?.dossier?.need,
        vehicleId: state.vehicleId,
        ascentBudget_m_s: state.ascentLossBudget_m_s,
        dsmNodes: state.dsmNodes,
        captureBudget_m_s: state.captureBudget_m_s,
      });
      state.needWaterfall = wf;
      return wf;
    }

    case 'get_vehicle_doe': {
      const { runVehicleDoe } = await import('../physics/vehicle-doe.js');
      const need = state.transferData?.dossier?.need;
      if (!need) throw new Error('Compute transfer first');
      const doe = runVehicleDoe(need, {
        cargoMass_kg: state.cargoMass_kg,
        originBody: state.routeOrigin,
        starshipArch: state.starshipArch,
        tankerCount: state.tankerCount,
      });
      state.vehicleDoe = doe;
      return doe;
    }

    case 'get_launch_geometry': {
      const { buildLaunchGeometryCard } = await import('../physics/launch-geometry-card.js');
      return buildLaunchGeometryCard(state.transferData, state);
    }

    case 'sketch_sample_return': {
      const { sketchSampleReturn, canSketchSampleReturn } = await import('../physics/free-return-sketch.js');
      if (!canSketchSampleReturn(state.routeOrigin, state.routeDestination)) {
        throw new Error('sample-return sketch needs Earth↔planet');
      }
      const home = (state.routeOrigin?.name || '').toLowerCase() === 'earth'
        ? state.routeOrigin : state.routeDestination;
      const target = home === state.routeOrigin ? state.routeDestination : state.routeOrigin;
      const dep = state.transferData?.departureSimTime ?? timeState.simTime ?? 0;
      const sketch = sketchSampleReturn(home, target, dep, {
        ephemerisBackend: state.ephemerisBackend === 'sample-de' ? 'sample-de' : 'approx',
      }, { stay_days: args.stay_days ?? 30 });
      state.sampleReturnSketch = sketch;
      return sketch;
    }

    case 'get_itinerary_catalog': {
      const { itineraryTemplates } = await import('../physics/itinerary-suggest.js');
      if (!state.routeOrigin || !state.routeDestination) {
        throw new Error('Set origin and destination');
      }
      return {
        templates: itineraryTemplates(state.routeOrigin, state.routeDestination).map((t) => ({
          id: t.id, label: t.label, kind: t.kind, rationale: t.rationale,
          bodies: (t.bodies || []).map((b) => b.name),
        })),
        product_class: 'preliminary-not-flight-certified',
        note: 'Local templates only — not a global tour optimizer',
      };
    }

    case 'set_companion_mode': {
      const { applyCompanionMode } = await import('../ui/companion-mode.js');
      return applyCompanionMode(!!(args.on ?? args.enabled ?? args.value));
    }

    case 'get_path_truth': {
      const { buildPathTruth } = await import('../physics/path-truth.js');
      return buildPathTruth(state.transferData, state, timeState.simTime);
    }

    case 'apply_window_family': {
      const { clusterWindowFamilies } = await import('../physics/window-families.js');
      let pack = state.windowFamilies;
      if (!pack?.families?.length && state.windowShortlist?.length) {
        pack = clusterWindowFamilies(state.windowShortlist);
        state.windowFamilies = pack;
      }
      const idx = args.index != null ? Number(args.index) : 0;
      const f = pack?.families?.[idx] || pack?.families?.find((x) => x.recommended);
      if (!f) throw new Error('No window family — open windows / cluster first');
      const { applyWindowFamily } = await import('../ui/campaign-apply.js');
      return applyWindowFamily(f);
    }

    case 'apply_architecture_row': {
      const { buildArchitectureMatrix } = await import('../physics/architecture-matrix.js');
      let matrix = state.architectureMatrix;
      if (!matrix?.rows?.length) {
        const need = state.transferData?.dossier?.need;
        if (!need) throw new Error('Compute transfer first');
        matrix = buildArchitectureMatrix(need, {
          cargoMass_kg: state.cargoMass_kg,
          originBody: state.routeOrigin,
        });
        state.architectureMatrix = matrix;
      }
      const idx = args.index != null ? Number(args.index) : null;
      const row = idx != null
        ? matrix.rows[idx]
        : (matrix.rows.find((r) => r.recommended) || matrix.rows.find((r) => r.feasible));
      if (!row) throw new Error('No architecture row');
      const { applyArchitectureRow } = await import('../ui/campaign-apply.js');
      return applyArchitectureRow(row);
    }

    case 'get_campaign_snapshot': {
      const { snapshotCampaign, listCampaignSteps, getCampaign } = await import('./campaign-object.js');
      return {
        snapshot: snapshotCampaign(state),
        timeline: listCampaignSteps().map((s) => ({
          id: s.id, kind: s.kind, label: s.label, mission_ready: s.mission_ready,
        })),
        campaign_id: getCampaign()?.id || null,
        cursor: getCampaign()?.cursor ?? -1,
      };
    }

    case 'list_bodies':
      return { bodies: listBodyNames() };

    case 'set_route': {
      const out = {};
      if (args.origin) {
        const b = resolveBody(args.origin);
        if (!b) throw new Error(`Unknown origin body: ${args.origin}`);
        setRouteOrigin(b);
        out.origin = b.name;
      }
      if (args.destination) {
        const b = resolveBody(args.destination);
        if (!b) throw new Error(`Unknown destination body: ${args.destination}`);
        setRouteDestination(b);
        out.destination = b.name;
      }
      if (!args.origin && !args.destination) {
        throw new Error('set_route requires origin and/or destination');
      }
      return out;
    }

    case 'compute_route': {
      if (!state.routeOrigin || !state.routeDestination) {
        throw new Error('SET ORIGIN AND DESTINATION FIRST');
      }
      const waitP = waitForPlanComputed();
      computeRoute();
      await waitP;
      return snapshotState();
    }

    case 'clear_route':
      clearRoute();
      return { cleared: true };

    case 'set_vehicle': {
      if (args.vehicleId) {
        state.vehicleId = String(args.vehicleId);
        const sel = document.getElementById('vehicle-select');
        if (sel) {
          sel.value = state.vehicleId;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (args.cargoMass_kg != null && Number.isFinite(Number(args.cargoMass_kg))) {
        state.cargoMass_kg = Number(args.cargoMass_kg);
        const cargo = document.getElementById('cargo-mass');
        if (cargo) {
          cargo.value = String(state.cargoMass_kg);
          cargo.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      if (args.starshipArch) {
        state.starshipArch = args.starshipArch;
      }
      window.dispatchEvent(new CustomEvent('helios:vehicle-changed'));
      return {
        vehicleId: state.vehicleId,
        cargoMass_kg: state.cargoMass_kg,
        starshipArch: state.starshipArch,
      };
    }

    case 'set_departure': {
      const raw = args.date || args.iso;
      if (!raw) throw new Error('date required');
      let d;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        d = new Date(raw + 'T00:00:00Z');
      } else {
        d = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z');
      }
      if (isNaN(d.getTime())) throw new Error(`Invalid date: ${raw}`);
      const input = document.getElementById('depart-date');
      const val = dateToInputValue(d);
      if (input) {
        input.value = val;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      timeState.simTime = dateToSimTime(d);
      timeState.updateDisplay();
      return { departure: val };
    }

    case 'notify': {
      const msg = args.message || args.msg || 'AGENT';
      notify(String(msg).slice(0, 200));
      return { notified: true, message: msg };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function pollOnce() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const { commands } = await heliosJson('/api/agent/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: AGENT_ID, limit: 8 }),
    });
    authRequired = false;
    if (!commands || !commands.length) return;
    for (const cmd of commands) {
      try {
        const result = await executeCommand(cmd);
        await heliosJson('/api/agent/result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: cmd.id,
            ok: true,
            result,
            leaseToken: cmd.leaseToken,
          }),
        });
      } catch (e) {
        if (e.code === 'HELIOS_AUTH') {
          authRequired = true;
          return;
        }
        try {
          await heliosJson('/api/agent/result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: cmd.id,
              ok: false,
              error: e.message || String(e),
              leaseToken: cmd.leaseToken,
            }),
          });
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e) {
    if (e.code === 'HELIOS_AUTH' || e.status === 401) {
      authRequired = true;
    }
    // Server may not be HELIOS Node — stay quiet.
  } finally {
    pollInFlight = false;
  }
}

async function heartbeat() {
  try {
    await heliosJson('/api/agent/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: snapshotState() }),
    });
    authRequired = false;
  } catch (e) {
    if (e.code === 'HELIOS_AUTH' || e.status === 401) authRequired = true;
  }
}

/** Start onboard C2 loop. Safe to call multiple times. */
export function startOnboardAgent() {
  if (running) return;
  running = true;
  pollTimer = setInterval(pollOnce, POLL_MS);
  beatTimer = setInterval(heartbeat, HEARTBEAT_MS);
  pollOnce();
  heartbeat();
  if (typeof window !== 'undefined') {
    const debug =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1' ||
      new URLSearchParams(location.search).get('debug') === '1';
    window.__HELIOS_ONBOARD = {
      running: true,
      get authRequired() {
        return authRequired;
      },
      snapshot: snapshotState,
      ...(debug ? { execute: executeCommand } : {}),
    };
  }
}

export function stopOnboardAgent() {
  running = false;
  if (pollTimer) clearInterval(pollTimer);
  if (beatTimer) clearInterval(beatTimer);
  pollTimer = beatTimer = null;
}

export { snapshotState, executeCommand };
