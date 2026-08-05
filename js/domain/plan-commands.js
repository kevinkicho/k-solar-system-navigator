/**
 * Plan command bus — single entry for UI / agent / share / undo.
 * Phase 1: wraps session history + domain apply.
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
import { state } from '../state.js';

/**
 * @typedef {{ type: string, seed?: object, compute?: boolean, notifyUser?: boolean, index?: number, label?: string, source?: string }} PlanCommand
 */

/**
 * Dispatch a plan command.
 * @param {PlanCommand} cmd
 */
export async function dispatchPlanCommand(cmd) {
  if (!cmd || !cmd.type) return { ok: false, error: 'no command' };

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
      return r;
    }

    case 'COMPUTE': {
      const { computeRoute } = await import('../ui/route-planner.js');
      if (!state.routeOrigin || !state.routeDestination) {
        return { ok: false, error: 'no route' };
      }
      computeRoute();
      if (cmd.recordHistory !== false) {
        pushCampaignStep({
          kind: 'compute',
          label: cmd.label || 'Compute',
          source: cmd.source || 'command',
        });
      }
      return { ok: true };
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
      return { ok: true, step };
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
      return { ok: true, step };
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
      return { ok: true, step };
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
      const { runPlanFlow, runPlanFlowLog } = await import('../agent/plan-flow.js');
      if (cmd.id === 'linear' || cmd.workflow === 'linear') {
        const r = await runPlanFlowLog(cmd.plan || {}, cmd.opts || {});
        return { ok: true, result: r };
      }
      const dag = await runPlanFlow(cmd.plan || {}, {
        source: cmd.source || 'command',
        ...(cmd.opts || {}),
      });
      return { ok: true, result: dag };
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
  };
}
