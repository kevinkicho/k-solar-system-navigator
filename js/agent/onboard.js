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
