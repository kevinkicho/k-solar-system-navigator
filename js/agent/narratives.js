/**
 * AI narratives: porkchop, GA coach, dual-critic, itinerary coach, red-team.
 */

import { state } from '../state.js';
import { chatComplete, getMissionAiBundle } from './ai-core.js';
import { formatContextForPrompt } from './mission-context.js';

function personalityStyle() {
  const p = state.ai?.personality || 'industrial';
  if (p === 'coach') {
    return 'Tone: teaching coach — short explanations for why each recommendation matters. Still concise.';
  }
  return 'Tone: industrial terse — bullets and numbers first.';
}

/**
 * Summarize porkchop shortlist / last window result.
 */
export async function porkchopNarrative() {
  const short = state.windowShortlist;
  const cells = Array.isArray(short)
    ? short.slice(0, 8).map((c, i) => ({
      rank: i + 1,
      dv_m_s: c.dvTotal ?? c.dv ?? c.score,
      dep: c.departureSimTime ?? c.dep,
      tof_s: c.transferTime ?? c.tof,
      c3: c.c3 ?? null,
    }))
    : [];
  const { ctx } = getMissionAiBundle();
  const result = await chatComplete({
    messages: [
      {
        role: 'system',
        content:
          'You are HELIOS launch-window narrator. Explain shortlist cells using only provided numbers. Preliminary only; not global optimum; not flight-certified. Under 250 words.',
      },
      {
        role: 'user',
        content: `Route ${ctx.route?.origin}→${ctx.route?.destination}. Shortlist JSON:\n${JSON.stringify(cells)}\nContext: ${formatContextForPrompt(ctx).slice(0, 1500)}`,
      },
    ],
  });
  return { narrative: result.text, usage: result.usage, model: result.model, n: cells.length };
}

/**
 * GA suggestion pack coach narrative.
 */
export async function gaTourCoach() {
  const pack = state.gaSuggestions;
  if (!pack?.suggestions?.length) {
    return { narrative: 'No GA suggestion pack loaded. Run SUGGEST GA first.', n: 0 };
  }
  const slim = pack.suggestions.slice(0, 6).map((s) => ({
    label: s.label,
    kind: s.kind,
    dv_m_s: s.dvTotal_m_s,
    tof_days: s.tof_days,
    delta_vs_direct_m_s: s.delta_vs_direct_m_s,
    recommended: !!s.recommended,
    flybys: s.flybyNames,
    note: s.note,
  }));
  const result = await chatComplete({
    messages: [
      {
        role: 'system',
        content:
          `You are HELIOS gravity-assist coach. ${personalityStyle()} Compare direct vs assist seeds. Emphasize local seeds only — not global tour design, not flight-certified. Recommend one seed with caveats. Under 280 words.`,
      },
      {
        role: 'user',
        content: `Candidates:\n${JSON.stringify(slim)}\nDirect: ${JSON.stringify(pack.direct || null)}`,
      },
    ],
  });
  return {
    narrative: result.text,
    usage: result.usage,
    model: result.model,
    n: slim.length,
    recommended: slim.find((s) => s.recommended)?.label || null,
  };
}

/**
 * Dual-critic: physics / vehicle / ops perspectives in one call (structured).
 */
export async function dualCriticReview() {
  const { ctx, promptContext } = getMissionAiBundle();
  const result = await chatComplete({
    messages: [
      {
        role: 'system',
        content: `You are three HELIOS critics reviewing one preliminary plan. ${personalityStyle()}
Output markdown with exactly three sections:
## Physics critic
## Vehicle critic  
## Ops critic
Each section: 2–4 bullets. End with ## Consensus (agree/disagree + top risk).
Never invent numbers not in context. Not flight-certified.`,
      },
      { role: 'user', content: `Review this plan:\n${promptContext}` },
    ],
  });
  return {
    review: result.text,
    usage: result.usage,
    model: result.model,
    status: ctx.dossier?.status || null,
  };
}

/**
 * Intelligent itinerary pack coach.
 */
export async function itineraryCoach() {
  const pack = state.itinerarySuggestions;
  if (!pack?.suggestions?.length) {
    return { narrative: 'No itinerary pack loaded. Run SUGGEST ITINERARY first.', n: 0 };
  }
  const slim = pack.suggestions.slice(0, 6).map((s) => ({
    label: s.itineraryLabel || s.label,
    kind: s.kind,
    stops: s.stops,
    dv_m_s: s.dvTotal_m_s,
    tof_days: s.tof_days,
    delta_vs_direct_m_s: s.delta_vs_direct_m_s,
    recommended: !!s.recommended,
    rationale: s.rationale,
  }));
  const result = await chatComplete({
    messages: [
      {
        role: 'system',
        content:
          `You are HELIOS itinerary coach. ${personalityStyle()} Compare multi-leg tour seeds. Emphasize local templates only — not a global tour optimizer, not flight-certified. Recommend one seed with caveats. Under 280 words.`,
      },
      {
        role: 'user',
        content: `Itinerary candidates:\n${JSON.stringify(slim)}\nDirect: ${JSON.stringify(pack.direct || null)}\nNote: ${pack.note || ''}`,
      },
    ],
  });
  return {
    narrative: result.text,
    usage: result.usage,
    model: result.model,
    n: slim.length,
    recommended: slim.find((s) => s.recommended)?.label || null,
  };
}

/**
 * Red-team / devil's advocate review of current plan.
 */
export async function redTeamReview() {
  const { ctx, promptContext } = getMissionAiBundle();
  const result = await chatComplete({
    messages: [
      {
        role: 'system',
        content: `You are HELIOS red-team. ${personalityStyle()}
Attack the plan: hidden assumptions, path honesty, fidelity gaps, vehicle margin risk, launch-site DLA, multi-leg phasing fragility.
Output markdown:
## Attack surface
## Weakest claims
## What would falsify READY
## Mitigations (analysis only)
Never invent numbers. Not flight-certified. Under 320 words.`,
      },
      { role: 'user', content: `Red-team this plan:\n${promptContext}` },
    ],
  });
  return {
    review: result.text,
    usage: result.usage,
    model: result.model,
    status: ctx.dossier?.status || null,
  };
}
