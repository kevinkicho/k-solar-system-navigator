/**
 * Plan command bus — single entry for UI / agent / share / undo.
 */

import {
  pushCampaignStep,
  undoCampaignStep,
  redoCampaignStep,
  setCampaignCursor,
  listCampaignSteps,
  getCampaign,
  clearCampaign,
} from '../agent/campaign-object.js';
import { reapplyPlanRequest } from './plan-apply.js';
import { buildPlanRequestFromState, normalizePlanRequest, digestPlanSeed } from './plan-seed.js';
import { buildPlanResult } from './plan-result.js';
import { waitForPlanComputed } from './wait-plan.js';
import {
  applyVehicleArgs,
  applyDepartureArgs,
  applyLaunchSiteArgs,
  openWindowSearch,
  runSuggestGa,
  resolveBody,
} from './plan-actions.js';
import { setProductMode } from './display-modes.js';
import { state } from '../state.js';

/** Optional test/mock hook: if set, records commands instead of executing. */
let _mockRecorder = null;

export function setPlanCommandRecorder(fn) {
  _mockRecorder = typeof fn === 'function' ? fn : null;
}

/**
 * @param {object} cmd
 */
export async function dispatchPlanCommand(cmd) {
  if (!cmd || !cmd.type) return { ok: false, error: 'no command' };
  if (_mockRecorder) {
    _mockRecorder(cmd);
    return { ok: true, mocked: true, cmd };
  }

  switch (cmd.type) {
    case 'APPLY_SEED': {
      const seed = normalizePlanRequest(cmd.seed);
      const r = await reapplyPlanRequest(seed, {
        compute: cmd.compute !== false,
        notifyUser: cmd.notifyUser !== false,
      });
      if (r.ok && cmd.recordHistory !== false) {
        pushCampaignStep({
          kind: 'apply_seed',
          label: cmd.label || `Apply ${seed?.o || '?'} → ${seed?.d || '?'}`,
          source: cmd.source || 'command',
        });
      }
      return { ...r, result: r.ok ? buildPlanResult() : null };
    }

    case 'COMPUTE': {
      const { computeRoute } = await import('../ui/route-planner.js');
      if (!state.routeOrigin || !state.routeDestination) {
        return { ok: false, error: 'no route' };
      }
      const waitP = cmd.wait !== false ? waitForPlanComputed() : Promise.resolve({ ok: true });
      computeRoute();
      await waitP;
      if (cmd.recordHistory !== false) {
        pushCampaignStep({
          kind: 'compute',
          label: cmd.label || 'Compute',
          source: cmd.source || 'command',
        });
      }
      return { ok: true, result: buildPlanResult() };
    }

    case 'SET_VEHICLE': {
      const out = applyVehicleArgs(cmd);
      return { ok: true, ...out };
    }

    case 'SET_DEPARTURE': {
      try {
        const departure = applyDepartureArgs(cmd.date || cmd.iso || cmd.departure);
        return { ok: true, departure };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    case 'SET_LAUNCH_SITE': {
      const launchSiteId = applyLaunchSiteArgs(cmd.launchSiteId || cmd.site);
      return { ok: true, launchSiteId };
    }

    case 'SET_ROUTE': {
      const { setRouteOrigin, setRouteDestination } = await import('../ui/route-planner.js');
      const out = {};
      if (cmd.origin) {
        const b = resolveBody(cmd.origin);
        if (!b) return { ok: false, error: `Unknown origin: ${cmd.origin}` };
        setRouteOrigin(b);
        out.origin = b.name;
      }
      if (cmd.destination) {
        const b = resolveBody(cmd.destination);
        if (!b) return { ok: false, error: `Unknown destination: ${cmd.destination}` };
        setRouteDestination(b);
        out.destination = b.name;
      }
      if (!cmd.origin && !cmd.destination) {
        return { ok: false, error: 'SET_ROUTE needs origin and/or destination' };
      }
      return { ok: true, ...out };
    }

    case 'CLEAR_ROUTE': {
      const { clearRoute } = await import('../ui/route-planner.js');
      clearRoute();
      return { ok: true, cleared: true };
    }

    case 'OPEN_WINDOWS': {
      return openWindowSearch();
    }

    case 'SUGGEST_GA': {
      return runSuggestGa({ thorough: cmd.thorough });
    }

    case 'SET_MODE': {
      return setProductMode(cmd.mode || cmd.id || 'present', {
        silent: cmd.silent,
        skipRecompute: cmd.skipRecompute,
      });
    }

    case 'RUN_CAMPAIGN': {
      const { runMissionCampaign } = await import('../agent/campaign.js');
      const r = await runMissionCampaign(cmd.plan || cmd.args || cmd);
      return { ok: !!r?.ok, ...r };
    }

    case 'UNDO': {
      const step = undoCampaignStep();
      if (!step) return { ok: false, error: 'nothing to undo' };
      if (step.plan_request) {
        await reapplyPlanRequest(step.plan_request, {
          notifyUser: false,
          compute: cmd.compute !== false,
        });
      }
      return { ok: true, step, result: buildPlanResult() };
    }

    case 'REDO': {
      const step = redoCampaignStep();
      if (!step) return { ok: false, error: 'nothing to redo' };
      if (step.plan_request) {
        await reapplyPlanRequest(step.plan_request, {
          notifyUser: false,
          compute: cmd.compute !== false,
        });
      }
      return { ok: true, step, result: buildPlanResult() };
    }

    case 'JUMP': {
      const step = setCampaignCursor(cmd.index ?? 0);
      if (!step) return { ok: false, error: 'no step' };
      if (step.plan_request) {
        await reapplyPlanRequest(step.plan_request, {
          notifyUser: false,
          compute: cmd.compute !== false,
        });
      }
      return { ok: true, step, result: buildPlanResult() };
    }

    case 'SNAPSHOT': {
      pushCampaignStep({
        kind: 'snapshot',
        label: cmd.label || 'Manual snapshot',
        source: cmd.source || 'command',
      });
      return { ok: true };
    }

    case 'CLEAR_HISTORY': {
      clearCampaign();
      return { ok: true };
    }

    case 'RUN_WORKFLOW': {
      const { runWorkflow } = await import('./workflow-runner.js');
      const kind = cmd.id || cmd.workflow || 'dag';
      const result = await runWorkflow(kind, cmd.plan || {}, {
        source: cmd.source || 'command',
        ...(cmd.opts || {}),
      });
      return { ok: true, result };
    }

    default:
      return { ok: false, error: `unknown command ${cmd.type}` };
  }
}

export function getPlanSessionSnapshot() {
  return {
    campaign: getCampaign(),
    steps: listCampaignSteps(),
    seed: buildPlanRequestFromState(state),
    digest: digestPlanSeed(buildPlanRequestFromState(state)),
    result: buildPlanResult(),
    productMode: state.productMode || 'present',
  };
}
