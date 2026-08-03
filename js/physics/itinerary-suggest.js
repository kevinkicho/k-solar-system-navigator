/**
 * Intelligent itinerary suggestions (local multi-leg seeds).
 * Not a global tour optimizer — ranked templates + GA-style evaluation.
 */

import { DAY } from '../constants.js';
import { listFlybyEligible } from '../data/catalog.js';
import { hohmannTransfer } from './kepler.js';
import { solveTransferOrbit } from './routing.js';
import { findMultiLegWindow } from './multi-leg-window-search.js';
import { resolvePlanningBackend } from './planning-defaults.js';
import { dualFlybyTemplates, pickAssistCandidates, evaluateDirectBaseline } from './ga-suggest.js';

/**
 * Named multi-stop itinerary templates (classic tour patterns).
 * @returns {{ id: string, label: string, bodies: object[], rationale: string }[]}
 */
export function itineraryTemplates(origin, dest) {
  if (!origin || !dest) return [];
  const byName = (n) => listFlybyEligible().find((b) => (b.name || '').toLowerCase() === n);
  const o = (origin.name || '').toLowerCase();
  const d = (dest.name || '').toLowerCase();
  const aD = dest.a ?? 1;
  const aO = origin.a ?? 1;
  const out = [];

  const venus = byName('venus');
  const earth = byName('earth');
  const mars = byName('mars');
  const jupiter = byName('jupiter');
  const saturn = byName('saturn');

  // Direct always available as itinerary option
  out.push({
    id: 'itin-direct',
    kind: 'direct',
    label: `${origin.name} → ${dest.name} (direct)`,
    bodies: [],
    rationale: 'Single Lambert arc · baseline itinerary',
  });

  // Classic inner-system
  if (o === 'earth' && d === 'mars' && venus) {
    out.push({
      id: 'itin-evm',
      kind: 'assist',
      label: 'Earth → Venus → Mars',
      bodies: [venus],
      rationale: 'Classic Venus gravity-assist path toward Mars (local seed)',
    });
  }
  if (o === 'earth' && (aD > 3) && venus) {
    out.push({
      id: 'itin-ev-outer',
      kind: 'assist',
      label: `Earth → Venus → ${dest.name}`,
      bodies: [venus],
      rationale: 'Inner-planet assist for outer destination energy shaping',
    });
  }
  if (o === 'earth' && mars && aD > 4) {
    out.push({
      id: 'itin-em-outer',
      kind: 'assist',
      label: `Earth → Mars → ${dest.name}`,
      bodies: [mars],
      rationale: 'Mars assist toward outer system (phasing / energy)',
    });
  }
  if (o === 'earth' && venus && mars && aD > 4) {
    out.push({
      id: 'itin-evm-outer',
      kind: 'assist-dual',
      label: `Earth → Venus → Mars → ${dest.name}`,
      bodies: [venus, mars],
      rationale: 'Named dual-assist template (VEEGA-class family · local seed only)',
    });
  }
  if (o === 'earth' && jupiter && aD > 8) {
    out.push({
      id: 'itin-ej-outer',
      kind: 'assist',
      label: `Earth → Jupiter → ${dest.name}`,
      bodies: [jupiter],
      rationale: 'Jupiter assist for deep outer targets (high energy · local seed)',
    });
  }
  // Return / inner from outer
  if (aO > 3 && d === 'earth' && mars) {
    out.push({
      id: 'itin-return-mars',
      kind: 'assist',
      label: `${origin.name} → Mars → Earth`,
      bodies: [mars],
      rationale: 'Mars staging on return to Earth',
    });
  }
  if (o === 'earth' && d === 'jupiter' && venus && earth) {
    out.push({
      id: 'itin-veega-like',
      kind: 'assist-dual',
      label: 'Earth → Venus → Earth → Jupiter',
      bodies: [venus, earth],
      rationale: 'VEEGA-inspired template (not a global optimum search)',
    });
  }
  // Outer / return family expansions (local seeds)
  if (o === 'earth' && d === 'saturn' && jupiter) {
    out.push({
      id: 'itin-ej-saturn',
      kind: 'assist',
      label: 'Earth → Jupiter → Saturn',
      bodies: [jupiter],
      rationale: 'Outer energy-shaping via Jupiter (local seed · not Cassini redesign)',
    });
  }
  if (o === 'earth' && d === 'saturn' && venus && jupiter) {
    out.push({
      id: 'itin-evj-saturn',
      kind: 'assist-dual',
      label: 'Earth → Venus → Jupiter → Saturn',
      bodies: [venus, jupiter],
      rationale: 'VEEGA-class energy + Jupiter for Saturn (local dual template)',
    });
  }
  if (o === 'mars' && d === 'earth' && venus) {
    out.push({
      id: 'itin-mars-return-venus',
      kind: 'assist',
      label: 'Mars → Venus → Earth',
      bodies: [venus],
      rationale: 'Return-path Venus assist sketch',
    });
  }
  // Historical-pattern labels (educational analogues only)
  if (o === 'earth' && d === 'jupiter' && mars) {
    out.push({
      id: 'itin-pioneer-class',
      kind: 'assist',
      label: 'Earth → Mars → Jupiter (Pioneer-class energy sketch)',
      bodies: [mars],
      rationale: 'Educational analogue pattern · not a reconstruction of historical OD',
    });
  }

  // Fill from dual templates / assist candidates
  for (const t of dualFlybyTemplates(origin, dest)) {
    const id = `itin-dual-${t.bodies.map((b) => (b.name || '').toLowerCase()).join('-')}`;
    if (!out.some((x) => x.id === id)) {
      out.push({
        id,
        kind: 'assist-dual',
        label: `${origin.name} → ${t.label} → ${dest.name}`,
        bodies: t.bodies,
        rationale: 'Named dual-flyby template from GA library',
      });
    }
  }
  for (const b of pickAssistCandidates(origin, dest).slice(0, 3)) {
    const id = `itin-ga-${(b.id || b.name || '').toLowerCase()}`;
    if (!out.some((x) => x.id === id)) {
      out.push({
        id,
        kind: 'assist',
        label: `${origin.name} → ${b.name} → ${dest.name}`,
        bodies: [b],
        rationale: `Scored assist candidate near O–D annulus (${b.name})`,
      });
    }
  }

  // Cap for wall-clock
  return out.slice(0, 10);
}

function evalMulti(origin, dest, flybyBodies, depHint, routeOpts, opts) {
  if (!flybyBodies?.length) return null;
  const thorough = !!opts.thorough;
  const nDep = thorough ? 20 : 12;
  const nFb = thorough ? 12 : 8;
  const hints = flybyBodies.map((b, i) => ({
    body: b,
    simTime: depHint + (90 + i * 140) * DAY,
  }));
  const best = findMultiLegWindow(origin, dest, hints, depHint, {
    ephemerisBackend: resolvePlanningBackend(routeOpts),
    maxRevolutions: routeOpts.maxRevolutions ?? 0,
  }, { nDep, nFb, thorough });
  if (!best) return null;
  return {
    departureSimTime: best.departureSimTime,
    flybyTimes: best.flybyTimes?.slice() || [],
    arrivalSimTime: best.arrivalSimTime,
    tof_days: (best.arrivalSimTime - best.departureSimTime) / DAY,
    dvTotal_m_s: best.dvTotal,
  };
}

/**
 * Rank intelligent itineraries for O→D near depHint.
 * @returns {{ suggestions: object[], product_class: string, note: string }}
 */
export function suggestItineraries(origin, dest, depHint, routeOpts = {}, opts = {}) {
  const templates = itineraryTemplates(origin, dest);
  const direct = evaluateDirectBaseline(origin, dest, depHint, routeOpts);
  const suggestions = [];

  for (const t of templates) {
    try {
      if (t.kind === 'direct') {
        if (!direct) continue;
        suggestions.push({
          ...direct,
          id: t.id,
          kind: 'itinerary-direct',
          itineraryLabel: t.label,
          rationale: t.rationale,
          stops: [origin.name, dest.name],
          recommended: false,
        });
        continue;
      }
      const ev = evalMulti(origin, dest, t.bodies, depHint, routeOpts, opts);
      if (!ev) continue;
      const names = t.bodies.map((b) => b.name);
      suggestions.push({
        id: t.id,
        kind: t.kind === 'assist-dual' ? 'itinerary-dual' : 'itinerary-assist',
        label: t.label,
        itineraryLabel: t.label,
        rationale: t.rationale,
        summary: `${t.rationale} · local seed · not global optimum`,
        originName: origin.name,
        destName: dest.name,
        flybyNames: names,
        flybyBodyIds: t.bodies.map((b) => b.id || b.name),
        stops: [origin.name, ...names, dest.name],
        departureSimTime: ev.departureSimTime,
        flybyTimes: ev.flybyTimes,
        arrivalSimTime: ev.arrivalSimTime,
        tof_days: ev.tof_days,
        dvTotal_m_s: ev.dvTotal_m_s,
        recommended: false,
        seed_class: opts.thorough ? 'thorough-local' : 'coarse-local',
        note: 'Intelligent itinerary seed · patched-conic · not flight-certified',
        delta_vs_direct_m_s: direct?.dvTotal_m_s != null
          ? ev.dvTotal_m_s - direct.dvTotal_m_s
          : null,
      });
    } catch { /* skip */ }
  }

  // Multi-objective local rank (Need / TOF / stop count) — still local seeds only
  const weights = normalizeWeights(opts.weights);
  for (const s of suggestions) {
    s.score = scoreItinerary(s, weights, suggestions);
  }
  suggestions.sort((a, b) => (a.score ?? 1e15) - (b.score ?? 1e15));

  if (suggestions[0]) {
    suggestions[0].recommended = true;
    suggestions[0].summary = (suggestions[0].summary || '') + ' · RECOMMENDED itinerary seed';
  }

  return {
    product_class: 'preliminary-not-flight-certified',
    note: 'Intelligent itinerary suggestions are local multi-leg seeds — not a global tour optimizer, not flight-certified.',
    direct,
    suggestions,
    weights,
    generated_at: new Date().toISOString(),
    thorough: !!opts.thorough,
  };
}

/**
 * @param {{ need?: number, tof?: number, stops?: number }} w
 * Weights higher = more preference for lower that metric (cost).
 */
function normalizeWeights(w = {}) {
  const need = w.need != null ? Number(w.need) : 1;
  const tof = w.tof != null ? Number(w.tof) : 0.35;
  const stops = w.stops != null ? Number(w.stops) : 0.2;
  const sum = Math.max(1e-9, need + tof + stops);
  return { need: need / sum, tof: tof / sum, stops: stops / sum };
}

function scoreItinerary(s, weights, all) {
  const dvs = all.map((x) => x.dvTotal_m_s).filter((v) => Number.isFinite(v));
  const tofs = all.map((x) => x.tof_days).filter((v) => Number.isFinite(v));
  const maxDv = Math.max(...dvs, 1);
  const maxTof = Math.max(...tofs, 1);
  const maxStops = Math.max(...all.map((x) => x.stops?.length || 2), 2);
  const nd = (s.dvTotal_m_s ?? maxDv) / maxDv;
  const nt = (s.tof_days ?? maxTof) / maxTof;
  const ns = (s.stops?.length || 2) / maxStops;
  return weights.need * nd + weights.tof * nt + weights.stops * ns;
}
