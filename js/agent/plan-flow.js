/**
 * Unified plan-flow facade — single entry for timeline / DAG / linear log.
 * Naming:
 *   - plan timeline  = campaign-object (recompute seeds, undo/redo)
 *   - plan flow DAG  = campaign-dag (branching matrix + recover)
 *   - plan flow log  = campaign-runner (linear steps + optional approve)
 * Not flight-certified.
 */

export {
  getCampaign,
  pushCampaignStep,
  listCampaignSteps,
  undoCampaignStep,
  redoCampaignStep,
  clearCampaign,
  snapshotCampaign,
  buildPlanRequestFromState,
  loadCampaignFromLocal,
  formatCampaignTimeline,
  onCampaignChange,
  CAMPAIGN_SCHEMA_VERSION,
} from './campaign-object.js';

export { runCampaignDag, getCampaignDag, onCampaignDagChange } from './campaign-dag.js';

export {
  runCampaignWithLog,
  getCampaignRun,
  onCampaignRunChange,
  renderCampaignLog,
} from './campaign-runner.js';

/**
 * Primary “run plan flow” — DAG with auto-recover (same as timeline CTA).
 */
export async function runPlanFlow(plan = {}, opts = {}) {
  const { runCampaignDag } = await import('./campaign-dag.js');
  const { pushCampaignStep } = await import('./campaign-object.js');
  pushCampaignStep({
    kind: 'plan_flow',
    label: 'Plan flow (DAG)',
    source: opts.source || 'plan-flow',
  });
  const dag = await runCampaignDag({
    compute: true,
    autoRecover: true,
    ...plan,
  });
  pushCampaignStep({
    kind: 'plan_flow_done',
    label: `Plan flow ${dag?.status || 'done'}`,
    detail: `${dag?.nodes?.length || 0} nodes`,
    source: opts.source || 'plan-flow',
  });
  return dag;
}

/**
 * Linear plan flow with optional human approve (runner).
 */
export async function runPlanFlowLog(plan = {}, opts = {}) {
  const { runCampaignWithLog } = await import('./campaign-runner.js');
  return runCampaignWithLog(plan, opts);
}
