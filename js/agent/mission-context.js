/**
 * Rich mission context for AI co-pilot prompts.
 * Pure — no DOM. Used by FAB chat, mission brief, next-actions.
 */

import { buildMissionSnapshot, summarizeTransfer } from './transfer-summary.js';

/**
 * Build a dense, honesty-preserving context object for the model.
 * @param {object} appState HELIOS state
 * @param {{ departure?: string }} [extra]
 */
export function buildRichMissionContext(appState, extra = {}) {
  const snap = buildMissionSnapshot(appState, extra);
  const td = appState?.transferData;
  const dossier = td?.dossier || null;
  const need = dossier?.need || td?.need || null;
  const capability = dossier?.capability || td?.capability || null;
  const margin = dossier?.margin || td?.margin || null;
  const gates = (dossier?.gates || []).slice(0, 12).map((g) => ({
    code: g.code,
    level: g.level,
    message: g.message || g.title || '',
  }));
  const fails = gates.filter((g) => g.level === 'fail');
  const warns = gates.filter((g) => g.level === 'warn');

  return {
    product: {
      class: 'industrial-preliminary',
      not_flight_certified: true,
      not_range_safety: true,
      not_spice_od: true,
    },
    route: {
      origin: snap.origin,
      destination: snap.destination,
      flybys: snap.flybys,
      departure: snap.departure,
    },
    vehicle: {
      id: snap.vehicleId,
      arch: snap.starshipArch,
      cargo_kg: snap.cargoMass_kg,
    },
    fidelity: {
      level: snap.fidelityLevel || appState?.fidelityLevel || null,
      backend: appState?.ephemerisBackend || null,
      pathGeometry: appState?.pathGeometry || null,
      multiRev: !!appState?.pathAccuracy?.multiRevLambert,
      horizonsInject: !!appState?.horizonsEndpointInject,
    },
    transfer: summarizeTransfer(td),
    triad: {
      need_m_s: need?.need_dv_m_s ?? need?.need ?? null,
      capability_m_s: capability?.capability_dv_m_s ?? capability?.capability ?? null,
      margin_m_s: margin?.margin_dv_m_s ?? margin?.margin ?? null,
      feasible: margin?.feasible ?? null,
    },
    dossier: dossier
      ? {
          status: dossier.status,
          mission_ready: dossier.mission_ready,
          launch_enabled: dossier.launch_enabled,
          confidence_0_100: dossier.confidence_0_100 ?? null,
          fail_count: fails.length,
          warn_count: warns.length,
          fails,
          warns,
        }
      : null,
    ga: appState?.gaSuggestions
      ? {
          has_pack: true,
          thorough: !!appState.gaSuggestions.thorough,
          n: appState.gaSuggestions.suggestions?.length ?? 0,
          recommended: appState.gaSuggestions.suggestions?.find((s) => s.recommended)?.label || null,
        }
      : { has_pack: false },
    itinerary: appState?.itinerarySuggestions
      ? {
          has_pack: true,
          thorough: !!appState.itinerarySuggestions.thorough,
          n: appState.itinerarySuggestions.suggestions?.length ?? 0,
          recommended:
            appState.itinerarySuggestions.suggestions?.find((s) => s.recommended)?.itineraryLabel
            || appState.itinerarySuggestions.suggestions?.find((s) => s.recommended)?.label
            || null,
        }
      : { has_pack: false },
    ai: {
      model: appState?.ai?.model || null,
      tools: !!appState?.ai?.toolsEnabled,
      personality: appState?.ai?.personality || 'industrial',
    },
  };
}

/**
 * Compact system-append string for chat (token-budget aware).
 * @param {object} ctx from buildRichMissionContext
 * @param {{ maxChars?: number }} [opts]
 */
export function formatContextForPrompt(ctx, opts = {}) {
  const maxChars = opts.maxChars ?? 3500;
  let s = `\n\n[HELIOS live mission context — preliminary analysis only, not flight-certified]\n`;
  s += JSON.stringify(ctx, null, 0);
  if (s.length > maxChars) {
    // Drop gate details first
    const slim = {
      ...ctx,
      dossier: ctx.dossier
        ? {
            status: ctx.dossier.status,
            mission_ready: ctx.dossier.mission_ready,
            launch_enabled: ctx.dossier.launch_enabled,
            fail_count: ctx.dossier.fail_count,
            warn_count: ctx.dossier.warn_count,
            fails: (ctx.dossier.fails || []).slice(0, 4),
          }
        : null,
    };
    s = `\n\n[HELIOS live mission context — preliminary analysis only]\n${JSON.stringify(slim)}`;
  }
  if (s.length > maxChars) s = s.slice(0, maxChars - 20) + '…[truncated]';
  return s;
}

/**
 * Rule-based next actions (always available; AI can refine).
 * @param {object} ctx
 * @returns {{ id: string, label: string, priority: number, reason: string }[]}
 */
export function ruleBasedNextActions(ctx) {
  const actions = [];
  if (!ctx.route?.origin) {
    actions.push({
      id: 'set_origin',
      label: 'Set origin body (e.g. Earth)',
      priority: 100,
      reason: 'No origin selected',
    });
  }
  if (!ctx.route?.destination) {
    actions.push({
      id: 'set_destination',
      label: 'Set destination body',
      priority: 95,
      reason: 'No destination selected',
    });
  }
  if (ctx.route?.origin && ctx.route?.destination && !ctx.transfer) {
    actions.push({
      id: 'compute_route',
      label: 'Compute transfer (Lambert / multi-leg)',
      priority: 90,
      reason: 'Route endpoints set but no transfer computed',
    });
  }
  if (ctx.transfer && ctx.dossier && !ctx.dossier.mission_ready) {
    actions.push({
      id: 'review_gates',
      label: 'Review NO-GO gates and recover',
      priority: 85,
      reason: `Plan status ${ctx.dossier.status || 'fail'} — fix vehicle margin, site DLA, or dates`,
    });
  }
  if (ctx.transfer && ctx.dossier?.mission_ready) {
    actions.push({
      id: 'fly_study',
      label: 'Fly study (animation along path)',
      priority: 40,
      reason: 'Plan is analysis-ready',
    });
  }
  if (ctx.route?.origin && ctx.route?.destination && !ctx.ga?.has_pack) {
    actions.push({
      id: 'suggest_ga',
      label: 'SUGGEST GA — compare assist seeds',
      priority: 55,
      reason: 'No gravity-assist suggestion pack yet',
    });
  }
  if (ctx.route?.origin && ctx.route?.destination && !ctx.itinerary?.has_pack) {
    actions.push({
      id: 'suggest_itineraries',
      label: 'SUGGEST ITINERARY — multi-leg tour seeds',
      priority: 58,
      reason: 'No intelligent itinerary pack yet (local templates only)',
    });
  }
  if (ctx.fidelity?.pathGeometry === 'visual') {
    actions.push({
      id: 'path_physical',
      label: 'Restore product physical path geometry',
      priority: 72,
      reason: 'Visual path geometry breaks ship≡line honesty for Need analysis',
    });
  }
  if (ctx.fidelity?.backend === 'approx') {
    actions.push({
      id: 'use_sample_de',
      label: 'Switch planning ephemeris to sample-DE / L3',
      priority: 70,
      reason: 'Planning on L1 approx — product default is sample-DE',
    });
  }
  if (!ctx.fidelity?.horizonsInject && ctx.transfer) {
    actions.push({
      id: 'horizons_inject',
      label: 'Optional: enable live Horizons endpoint inject',
      priority: 25,
      reason: 'Higher-fidelity dep/arr VECTORS (network)',
    });
  }
  if (ctx.triad?.feasible === false) {
    actions.push({
      id: 'vehicle_margin',
      label: 'Adjust vehicle / cargo / arch for margin',
      priority: 80,
      reason: 'Capability below Need',
    });
  }
  actions.sort((a, b) => b.priority - a.priority);
  return actions.slice(0, 8);
}

/**
 * System prompt for mission brief generation.
 */
export function missionBriefSystemPrompt() {
  return `You are HELIOS Mission Brief writer — industrial preliminary analysis only.
Write a tight mission brief from the provided live context JSON.
Sections (use markdown):
1. Route & epochs
2. Need / Capability / Margin
3. Fidelity & path honesty
4. Plan gates (READY vs NO-GO)
5. Recommended next steps (actionable)
Never claim flight certification, range safety, SpaceX warranty, or global tour optima.
Keep under 400 words. Be specific with numbers from context.`;
}
