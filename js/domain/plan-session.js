/**
 * Plan session façade — history + seed digest.
 * Phase 1: thin wrapper over campaign-object for domain imports.
 */

export {
  getCampaign as getPlanSession,
  listCampaignSteps,
  pushCampaignStep,
  undoCampaignStep,
  redoCampaignStep,
  setCampaignCursor,
  clearCampaign,
  snapshotCampaign,
  onCampaignChange as onPlanSessionChange,
  loadCampaignFromLocal,
  formatCampaignTimeline,
  CAMPAIGN_SCHEMA_VERSION,
} from '../agent/campaign-object.js';

export { buildPlanRequestFromState, normalizePlanRequest, digestPlanSeed } from './plan-seed.js';
