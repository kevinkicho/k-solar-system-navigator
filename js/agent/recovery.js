/**
 * Plan gate auto-recovery helpers (deterministic; AI proposes, physics decides).
 */

import { state } from '../state.js';
import { dateToInputValue, notify, simTimeToDate } from '../ui/format.js';
import { timeState } from '../ui/time-system.js';
import { getMissionAiBundle } from './ai-core.js';
import { buildMissionSnapshot } from './transfer-summary.js';

/**
 * Propose recovery actions from current dossier fails/warns (no side effects).
 */
export function proposeGateRecovery() {
  const { ctx } = getMissionAiBundle();
  const fails = ctx.dossier?.fails || [];
  const proposals = [];

  for (const g of fails) {
    const code = g.code || '';
    if (/VEHICLE|MARGIN|CAPABILITY/i.test(code) || /margin/i.test(g.message || '')) {
      proposals.push({
        id: 'reduce_cargo',
        label: 'Reduce cargo mass toward 0 kg',
        action: 'set_vehicle',
        args: { cargoMass_kg: 0 },
      });
      proposals.push({
        id: 'tanker_arch',
        label: 'Switch Starship to tanker-n (if SH+SS)',
        action: 'set_vehicle',
        args: { vehicleId: 'sh-starship', starshipArch: 'tanker-n' },
      });
    }
    if (/DLA|SITE/i.test(code)) {
      proposals.push({
        id: 'site_any',
        label: 'Clear launch-site DLA constraint',
        action: 'set_launch_site',
        args: { launchSiteId: 'any' },
      });
    }
    if (/LAMBERT|TOF|WINDOW|FEAS/i.test(code)) {
      proposals.push({
        id: 'nearest_window',
        label: 'Search nearest feasible departure window',
        action: 'find_nearest_window',
        args: {},
      });
    }
    if (/FLYBY|SHARP/i.test(code)) {
      proposals.push({
        id: 'clear_flybys',
        label: 'Clear flybys and recompute direct',
        action: 'clear_flybys',
        args: {},
      });
    }
  }

  if (!proposals.length && ctx.dossier && !ctx.dossier.mission_ready) {
    proposals.push({
      id: 'nearest_window',
      label: 'Search nearest feasible window',
      action: 'find_nearest_window',
      args: {},
    });
    proposals.push({
      id: 'reduce_cargo',
      label: 'Zero cargo for max margin',
      action: 'set_vehicle',
      args: { cargoMass_kg: 0 },
    });
  }

  // de-dupe by id
  const seen = new Set();
  const unique = [];
  for (const p of proposals) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    unique.push(p);
  }
  return {
    product_class: 'preliminary-not-flight-certified',
    status: ctx.dossier?.status || null,
    fails,
    proposals: unique,
  };
}

/**
 * Execute a recovery action by id (from proposeGateRecovery).
 */
export async function applyGateRecovery(actionId, extraArgs = {}) {
  const pack = proposeGateRecovery();
  const p = pack.proposals.find((x) => x.id === actionId) || {
    id: actionId,
    action: actionId,
    args: extraArgs,
  };
  const args = { ...p.args, ...extraArgs };
  const action = p.action || actionId;

  switch (action) {
    case 'set_vehicle': {
      const { applyVehicleArgs } = await import('../domain/plan-actions.js');
      applyVehicleArgs(args);
      break;
    }
    case 'set_launch_site': {
      const { applyLaunchSiteArgs } = await import('../domain/plan-actions.js');
      applyLaunchSiteArgs(args.launchSiteId || 'any');
      break;
    }
    case 'clear_flybys': {
      state.flybys = [];
      try {
        const { renderFlybyList } = await import('../ui/route-planner.js');
        renderFlybyList?.();
      } catch { /* */ }
      break;
    }
    case 'find_nearest_window': {
      return findNearestWindowAndApply();
    }
    default:
      throw new Error(`Unknown recovery action: ${action}`);
  }

  if (state.routeOrigin && state.routeDestination) {
    const { dispatchPlanCommand } = await import('../domain/plan-commands.js');
    await dispatchPlanCommand({ type: 'COMPUTE', wait: true, recordHistory: true, source: 'recovery' });
  }
  notify(`RECOVERY APPLIED: ${p.label || actionId}`);
  return {
    ok: true,
    applied: actionId,
    snapshot: buildMissionSnapshot(state),
    remaining: proposeGateRecovery(),
  };
}

export async function findNearestWindowAndApply() {
  if (!state.routeOrigin || !state.routeDestination) {
    throw new Error('Set origin and destination first');
  }
  const { findNearestFeasibleTransferAsync } = await import('../ui/nearest-feasible-async.js');
  const depHint = state.transferData?.departureSimTime ?? timeState.simTime;
  const tofHint = state.transferData?.transferTime ?? 200 * 86400;
  const fix = await findNearestFeasibleTransferAsync(
    state.routeOrigin,
    state.routeDestination,
    depHint,
    tofHint,
    { backend: state.ephemerisBackend || 'sample-de' },
  );
  if (!fix) {
    return { ok: false, error: 'No nearest feasible window in local seed search' };
  }
  const dep = fix.departureSimTime;
  if (dep != null) {
    const { applyDepartureArgs } = await import('../domain/plan-actions.js');
    applyDepartureArgs(dateToInputValue(simTimeToDate(dep)));
  }
  if (fix.transferTime != null) {
    state.userTofDays = fix.transferTime / 86400;
  }
  const { dispatchPlanCommand } = await import('../domain/plan-commands.js');
  await dispatchPlanCommand({ type: 'COMPUTE', wait: true, recordHistory: true, source: 'recovery' });
  notify('NEAREST FEASIBLE WINDOW APPLIED · recompute done');
  return {
    ok: true,
    applied: 'find_nearest_window',
    departureSimTime: dep,
    transferTime: fix.transferTime,
    snapshot: buildMissionSnapshot(state),
    remaining: proposeGateRecovery(),
  };
}
