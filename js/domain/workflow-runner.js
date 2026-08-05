/**
 * Single workflow entry — DAG or linear plan flow.
 * Keeps agent/campaign-dag and campaign-runner as strategy backends.
 */

export async function runWorkflow(kind = 'dag', plan = {}, opts = {}) {
  if (kind === 'linear' || kind === 'log') {
    const { runCampaignWithLog } = await import('../agent/campaign-runner.js');
    return runCampaignWithLog(plan, opts);
  }
  const { runPlanFlow } = await import('../agent/plan-flow.js');
  return runPlanFlow(plan, opts);
}

export { runPlanFlow, runPlanFlowLog } from '../agent/plan-flow.js';
