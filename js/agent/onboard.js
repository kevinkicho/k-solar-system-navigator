/**
 * Onboard agent — browser-side command & control executor.
 * Polls the local HELIOS server C2 bus and applies actions to the live app
 * (route, vehicle, dates, compute) so the CLI agent can drive the planner.
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

const POLL_MS = 800;
const HEARTBEAT_MS = 4000;

function apiBase() {
  // Same origin when served by HELIOS server.js
  return '';
}

async function postJson(path, body) {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function getJson(path) {
  const res = await fetch(`${apiBase()}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function snapshotState() {
  const td = state.transferData;
  let transferSummary = null;
  if (td) {
    transferSummary = {
      isMultiLeg: !!td.isMultiLeg,
      tofDays: td.tofDays ?? td.tof_days ?? null,
      deltaV_m_s: td.deltaV ?? td.totalDeltaV ?? td.dvTotal ?? null,
      vInfDep_m_s: td.vInfDep ?? td.v_inf_dep ?? null,
      missionReady: td.planDossier?.mission_ready ?? td.mission_ready ?? null,
      quality: td.planDossier?.overall ?? null,
    };
  }
  return {
    origin: state.routeOrigin?.name || null,
    destination: state.routeDestination?.name || null,
    flybys: (state.flybys || []).map((f) => f.bodyName || f.bodyId || f.body?.name),
    vehicleId: state.vehicleId,
    cargoMass_kg: state.cargoMass_kg,
    starshipArch: state.starshipArch,
    fidelityLevel: state.fidelityLevel,
    classroomMode: state.classroomMode,
    departure: dateToInputValue(timeState.getDate()),
    missionActive: !!state.mission?.active,
    transfer: transferSummary,
  };
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
      computeRoute();
      // Give dossier a tick to attach
      await new Promise((r) => setTimeout(r, 50));
      return snapshotState();
    }

    case 'clear_route':
      clearRoute();
      return { cleared: true };

    case 'set_vehicle': {
      if (args.vehicleId) {
        state.vehicleId = String(args.vehicleId);
        const sel = document.getElementById('vehicle-select');
        if (sel) sel.value = state.vehicleId;
      }
      if (args.cargoMass_kg != null && Number.isFinite(Number(args.cargoMass_kg))) {
        state.cargoMass_kg = Number(args.cargoMass_kg);
        const cargo = document.getElementById('cargo-mass');
        if (cargo) cargo.value = String(state.cargoMass_kg);
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
      if (input) input.value = val;
      // Align sim clock to departure day
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

let pollTimer = null;
let beatTimer = null;
let running = false;

async function pollOnce() {
  try {
    const { commands } = await getJson('/api/agent/commands');
    if (!commands || !commands.length) return;
    for (const cmd of commands) {
      try {
        const result = await executeCommand(cmd);
        await postJson('/api/agent/result', {
          id: cmd.id,
          ok: true,
          result,
        });
      } catch (e) {
        await postJson('/api/agent/result', {
          id: cmd.id,
          ok: false,
          error: e.message || String(e),
        });
      }
    }
  } catch {
    // Server may not be the HELIOS Node server (static host) — stay quiet.
  }
}

async function heartbeat() {
  try {
    await postJson('/api/agent/state', { snapshot: snapshotState() });
  } catch {
    // ignore
  }
}

/** Start onboard C2 loop. Safe to call multiple times. */
export function startOnboardAgent() {
  if (running) return;
  running = true;
  pollTimer = setInterval(pollOnce, POLL_MS);
  beatTimer = setInterval(heartbeat, HEARTBEAT_MS);
  // Immediate first cycle
  pollOnce();
  heartbeat();
  if (typeof window !== 'undefined') {
    window.__HELIOS_ONBOARD = {
      running: true,
      snapshot: snapshotState,
      execute: executeCommand,
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
