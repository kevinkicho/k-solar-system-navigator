/**
 * AI narratives: porkchop, GA coach, dual-critic.
 */

import { state } from '../state.js';
import { chatComplete, getMissionAiBundle } from './ai-core.js';
import { formatContextForPrompt } from './mission-context.js';

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
          'You are HELIOS gravity-assist coach. Compare direct vs assist seeds. Emphasize local seeds only — not global tour design, not flight-certified. Recommend one seed with caveats. Under 280 words.',
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
        content: `You are three HELIOS critics reviewing one preliminary plan. Output markdown with exactly three sections:
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
