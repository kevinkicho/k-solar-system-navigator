/**
 * UI re-export of domain plan apply (backward compatible).
 * Prefer: import { reapplyPlanRequest, dispatchPlanCommand } from '../domain/…'
 */

export { reapplyPlanRequest } from '../domain/plan-apply.js';
export { normalizePlanRequest, buildPlanRequestFromState, digestPlanSeed } from '../domain/plan-seed.js';
export { dispatchPlanCommand, getPlanSessionSnapshot } from '../domain/plan-commands.js';
