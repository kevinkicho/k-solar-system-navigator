/**
 * AI / campaign evaluation harness — golden NL → expected tools (no LLM required).
 * Headless pure checks for CI.
 */

import { parseCampaignHint } from './campaign-parse.js';

/**
 * Golden scenarios: natural language + expected parse / tool sequence hints.
 */
export const GOLDEN_SCENARIOS = [
  {
    id: 'earth-mars-2028-cargo',
    text: 'Plan Earth to Mars 2028 with 2t Starship cargo from Cape',
    expectParse: {
      origin: /earth/i,
      destination: /mars/i,
      year: 2028,
    },
    expectTools: ['run_mission_campaign', 'set_route', 'compute_route'],
    notes: 'Campaign-style NL',
  },
  {
    id: 'jupiter-itinerary',
    text: 'Suggest itinerary for Earth Jupiter gravity assist tour',
    expectParse: {
      origin: /earth/i,
      destination: /jupiter/i,
    },
    expectTools: ['suggest_itineraries', 'suggest_ga'],
    notes: 'Tour seeds',
  },
  {
    id: 'nogo-recover',
    text: 'Plan is NO-GO — propose gate recovery and apply first fix',
    expectParse: {},
    expectTools: ['propose_gate_recovery', 'apply_gate_recovery', 'get_watchdogs'],
    notes: 'Recovery ladder',
  },
  {
    id: 'fidelity-product',
    text: 'Switch to product sample-DE physical path fidelity',
    expectParse: {},
    expectTools: ['apply_fidelity_preset', 'apply_watchdog_action', 'get_residual_dashboard'],
    notes: 'Fidelity wizard',
  },
  {
    id: 'architecture-trade',
    text: 'Compare Starship tanker architectures for current Need',
    expectParse: {},
    expectTools: ['get_architecture_matrix', 'get_mission_brief_context'],
    notes: 'Vehicle board',
  },
  {
    id: 'window-families',
    text: 'Cluster launch windows into seasons from shortlist',
    expectParse: {},
    expectTools: ['get_window_families'],
    notes: 'Window families',
  },
  {
    id: 'campaign-dag',
    text: 'Run branching campaign DAG with auto recover',
    expectParse: {},
    expectTools: ['run_campaign_dag', 'run_campaign_with_log'],
    notes: 'DAG',
  },
  {
    id: 'playbook-mars',
    text: 'Run the unrefueled Mars cargo playbook',
    expectParse: {},
    expectTools: ['run_playbook', 'list_playbooks'],
    notes: 'Playbook',
  },
  {
    id: 'path-truth',
    text: 'Explain path truth scene vs Need and ARR ghost',
    expectParse: {},
    expectTools: ['get_path_truth', 'get_residual_dashboard'],
    notes: 'Path honesty',
  },
  {
    id: 'apply-studio',
    text: 'Apply recommended window family and architecture matrix row',
    expectParse: {},
    expectTools: ['apply_window_family', 'apply_architecture_row', 'get_window_families'],
    notes: 'Campaign board apply',
  },
];

/**
 * Score a model-proposed tool list against golden expectTools (set overlap).
 * @param {string[]} proposedTools
 * @param {string[]} expectedTools
 */
export function scoreToolOverlap(proposedTools, expectedTools) {
  const prop = new Set((proposedTools || []).map((t) => String(t).toLowerCase()));
  const exp = expectedTools || [];
  if (!exp.length) return { hit: 0, total: 0, ratio: 1, missing: [] };
  const missing = exp.filter((t) => !prop.has(String(t).toLowerCase()));
  const hit = exp.length - missing.length;
  return { hit, total: exp.length, ratio: hit / exp.length, missing };
}

/**
 * Run pure harness (parse + static expect lists). No LLM.
 */
export function runEvalHarness() {
  const results = [];
  for (const g of GOLDEN_SCENARIOS) {
    const parse = parseCampaignHint(g.text || '');
    const parseOk = checkParse(parse, g.expectParse || {});
    results.push({
      id: g.id,
      parseOk,
      parse,
      expectTools: g.expectTools,
      notes: g.notes,
      // Without LLM we only validate parse contract; tools are documentation for agent tests
      tool_contract: g.expectTools,
    });
  }
  const failed = results.filter((r) => !r.parseOk);
  return {
    ok: failed.length === 0,
    n: results.length,
    failed: failed.map((f) => f.id),
    results,
    product_class: 'preliminary-not-flight-certified',
    note: 'Headless harness validates NL parse goldens; tool lists document expected agent tools.',
  };
}

function checkParse(parse, expect) {
  if (expect.origin && !expect.origin.test(String(parse.origin || ''))) return false;
  if (expect.destination && !expect.destination.test(String(parse.destination || ''))) return false;
  if (expect.year != null) {
    const y = parse.year ?? (parse.departure && String(parse.departure).slice(0, 4));
    if (Number(y) !== Number(expect.year)) return false;
  }
  return true;
}

/**
 * Heuristic: map user text to recommended tools (deterministic coach).
 */
export function recommendToolsForText(text) {
  const t = String(text || '').toLowerCase();
  const tools = [];
  if (/\b(campaign|plan|set up|earth|mars|jupiter)\b/.test(t)) tools.push('run_mission_campaign');
  if (/\bitinerary|tour\b/.test(t)) tools.push('suggest_itineraries');
  if (/\b(ga|gravity.?assist|flyby)\b/.test(t)) tools.push('suggest_ga');
  if (/\b(nogo|no-go|recover|margin)\b/.test(t)) {
    tools.push('propose_gate_recovery', 'get_watchdogs');
  }
  if (/\b(fidelity|sample-de|path geometry)\b/.test(t)) tools.push('apply_fidelity_preset');
  if (/\b(architecture|tanker|matrix)\b/.test(t)) tools.push('get_architecture_matrix');
  if (/\b(window|season|family|porkchop)\b/.test(t)) tools.push('get_window_families');
  if (/\bdag\b/.test(t)) tools.push('run_campaign_dag');
  if (/\bplaybook\b/.test(t)) tools.push('run_playbook');
  if (/\b(residual|n-body|launch geometry)\b/.test(t)) tools.push('get_residual_dashboard');
  if (/\b(path truth|scene path|arr ghost|fly study)\b/.test(t)) tools.push('get_path_truth');
  if (/\bapply\b.*\b(window|family)\b|\bwindow family\b/.test(t)) tools.push('apply_window_family');
  if (/\bapply\b.*\barch|\barchitecture row\b/.test(t)) tools.push('apply_architecture_row');
  if (!tools.length) tools.push('get_mission_brief_context');
  return [...new Set(tools)];
}
