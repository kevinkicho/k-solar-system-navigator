/**
 * Gravity-assist path suggestions (preliminary patched-conic multi-leg).
 *
 * Produces ranked candidate routes: direct vs single-planet flyby assists.
 * Local coarse seed only — not a global tour optimizer.
 * User accepts a suggestion or keeps the current plan (manual flybys remain).
 */

import { DAY } from '../constants.js';
import { listFlybyEligible } from '../data/catalog.js';
import { hohmannTransfer } from './kepler.js';
import { solveTransferOrbit } from './routing.js';
import { findMultiLegWindow } from './multi-leg-window-search.js';
import { findNearestFeasibleTransfer } from './nearest-feasible-search.js';

/** Coarse grid for interactive suggestions (keep UI responsive). */
export const GA_SUGGEST_N_DEP = 14;
export const GA_SUGGEST_N_FB = 10;
export const GA_SUGGEST_MAX = 6;

/**
 * Pick flyby body candidates between origin and destination.
 * Keeps manual catalog freedom: any flybyEligible planet/dwarf except O/D.
 * @param {object} origin
 * @param {object} dest
 * @returns {object[]}
 */
export function pickAssistCandidates(origin, dest) {
  if (!origin || !dest) return [];
  const oId = (origin.id || origin.name || '').toLowerCase();
  const dId = (dest.id || dest.name || '').toLowerCase();
  const aO = origin.a ?? 1;
  const aD = dest.a ?? 1;
  const aMin = Math.min(aO, aD);
  const aMax = Math.max(aO, aD);

  const eligible = listFlybyEligible().filter((b) => {
    const id = (b.id || b.name || '').toLowerCase();
    if (id === oId || id === dId) return false;
    // Auto-suggest: planets + major dwarfs only (manual +FLYBY still lists NEOs)
    if (b.kind !== 'planet' && b.kind !== 'dwarf') return false;
    return true;
  });

  // Prefer classic assists in/near the annular region between O and D
  const scored = eligible.map((b) => {
    const a = b.a ?? 1;
    let score = 0;
    // Between orbits (classic)
    if (a > aMin * 0.85 && a < aMax * 1.15) score += 100;
    // Slightly inside/outside still useful for phasing
    else if (a > aMin * 0.5 && a < aMax * 1.5) score += 40;
    // Inner-system assists for outer targets
    if (aD > 3 && a < 2) score += 30;
    // Outer assists for inner returns
    if (aD < 1.2 && aO > 3 && a > 1.2 && a < 6) score += 20;
    // Prefer major planets
    if (b.kind === 'planet') score += 10;
    // Name priors (common tour design)
    const n = (b.name || '').toLowerCase();
    if (n === 'venus' || n === 'mars' || n === 'earth') score += 15;
    if (n === 'jupiter' || n === 'saturn') score += 5;
    return { body: b, score };
  });

  scored.sort((a, b) => b.score - a.score || (a.body.a ?? 0) - (b.body.a ?? 0));
  // Top candidates only for wall-clock
  return scored.filter((s) => s.score >= 30).slice(0, 5).map((s) => s.body);
}

/**
 * Evaluate a direct (no flyby) baseline near depHint.
 * @returns {object|null}
 */
export function evaluateDirectBaseline(origin, dest, depHint, routeOpts = {}) {
  if (!origin || !dest || !isFinite(depHint)) return null;
  let td = {
    body1: origin,
    body2: dest,
    departureSimTime: depHint,
    transferTime: null,
    arrivalSimTime: null,
    ephemerisBackend: routeOpts.ephemerisBackend || routeOpts.backend || 'approx',
  };
  try {
    const h = hohmannTransfer(origin, dest, depHint);
    td.transferTime = h.transferTime;
    td.arrivalSimTime = h.arrivalSimTime;
    solveTransferOrbit(td);
  } catch {
    return null;
  }
  if (!td.lambertOk) {
    const fix = findNearestFeasibleTransfer(origin, dest, depHint, td.transferTime || 200 * DAY, {
      backend: routeOpts.ephemerisBackend || routeOpts.backend || 'approx',
      nDep: 16,
      nTof: 12,
    });
    if (!fix) return null;
    td = {
      body1: origin,
      body2: dest,
      departureSimTime: fix.departureSimTime,
      transferTime: fix.transferTime,
      arrivalSimTime: fix.arrivalSimTime,
      ephemerisBackend: routeOpts.ephemerisBackend || routeOpts.backend || 'approx',
    };
    solveTransferOrbit(td);
    if (!td.lambertOk) return null;
  }
  const dv = td.dvTotal_lambert ?? td.dvTotal ?? null;
  if (dv == null || !isFinite(dv)) return null;
  return {
    id: 'direct',
    kind: 'direct',
    label: `${origin.name} → ${dest.name} (direct)`,
    summary: 'No gravity assist · single Lambert arc',
    originName: origin.name,
    destName: dest.name,
    flybyNames: [],
    flybyBodyIds: [],
    departureSimTime: td.departureSimTime,
    flybyTimes: [],
    arrivalSimTime: td.arrivalSimTime,
    tof_days: td.transferTime / DAY,
    dvTotal_m_s: dv,
    allFlybysOk: true,
    recommended: false,
    note: 'Baseline single-leg · not global optimum',
  };
}

/**
 * Evaluate one single-flyby assist candidate (coarse multi-leg window).
 * @returns {object|null}
 */
export function evaluateAssistCandidate(origin, dest, flybyBody, depHint, routeOpts = {}, opts = {}) {
  if (!flybyBody) return null;
  const hints = [{ body: flybyBody, simTime: depHint + 120 * DAY }];
  const best = findMultiLegWindow(origin, dest, hints, depHint, {
    ephemerisBackend: routeOpts.ephemerisBackend || routeOpts.backend || 'approx',
    maxRevolutions: routeOpts.maxRevolutions ?? 0,
  }, {
    nDep: opts.nDep ?? GA_SUGGEST_N_DEP,
    nFb: opts.nFb ?? GA_SUGGEST_N_FB,
    thorough: false,
  });
  if (!best) return null;
  return {
    id: `ga-${(flybyBody.id || flybyBody.name || 'x').toLowerCase()}`,
    kind: 'assist',
    label: `${origin.name} → ${flybyBody.name} → ${dest.name}`,
    summary: `Patched-conic gravity assist at ${flybyBody.name} · coarse local seed`,
    originName: origin.name,
    destName: dest.name,
    flybyNames: [flybyBody.name],
    flybyBodyIds: [flybyBody.id || flybyBody.name],
    departureSimTime: best.departureSimTime,
    flybyTimes: best.flybyTimes?.slice() || [],
    arrivalSimTime: best.arrivalSimTime,
    tof_days: (best.arrivalSimTime - best.departureSimTime) / DAY,
    dvTotal_m_s: best.dvTotal,
    allFlybysOk: true,
    recommended: false,
    note: 'Local multi-leg seed · not global tour design · not flight-certified',
  };
}

/**
 * Rank gravity-assist suggestions vs direct baseline.
 * @param {object} origin
 * @param {object} dest
 * @param {number} depHint sim seconds
 * @param {object} [routeOpts]
 * @param {object} [opts]
 * @returns {{ direct: object|null, suggestions: object[], generated_at: string, product_class: string }}
 */
export function suggestAssistPaths(origin, dest, depHint, routeOpts = {}, opts = {}) {
  const direct = evaluateDirectBaseline(origin, dest, depHint, routeOpts);
  const bodies = opts.candidates || pickAssistCandidates(origin, dest);
  const assists = [];
  for (const b of bodies) {
    try {
      const c = evaluateAssistCandidate(origin, dest, b, depHint, routeOpts, opts);
      if (c) assists.push(c);
    } catch {
      /* skip failed candidate */
    }
  }

  // Prefer lower heliocentric multi-leg Δv; mark best assist that beats direct (if any)
  assists.sort((a, b) => a.dvTotal_m_s - b.dvTotal_m_s);
  const bestAssist = assists[0] || null;
  if (bestAssist) {
    if (!direct || bestAssist.dvTotal_m_s < direct.dvTotal_m_s * 0.98) {
      bestAssist.recommended = true;
      bestAssist.summary += ' · lower Need than direct (this seed)';
    } else {
      bestAssist.recommended = true;
      bestAssist.summary += ' · best assist seed (direct still lower Need)';
    }
  } else if (direct) {
    direct.recommended = true;
    direct.summary += ' · no feasible assist seed found';
  }

  const suggestions = [];
  if (direct) suggestions.push(direct);
  for (const a of assists) {
    if (suggestions.length >= (opts.maxSuggestions ?? GA_SUGGEST_MAX)) break;
    if (!suggestions.some((s) => s.id === a.id)) suggestions.push(a);
  }
  // Re-sort: recommended first, then by dv
  suggestions.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return a.dvTotal_m_s - b.dvTotal_m_s;
  });

  return {
    direct,
    suggestions,
    candidates_tried: bodies.map((b) => b.name),
    generated_at: new Date().toISOString(),
    product_class: 'preliminary-not-flight-certified',
    note: 'Suggestions are coarse local multi-leg seeds. Accept applies flybys + dates; you may keep or edit manually.',
  };
}
