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

  // Rank: lower Need first; slight preference for fewer stops when similar
  suggestions.sort((a, b) => {
    const da = a.dvTotal_m_s ?? 1e15;
    const db = b.dvTotal_m_s ?? 1e15;
    if (Math.abs(da - db) < 200) {
      return (a.stops?.length || 2) - (b.stops?.length || 2);
    }
    return da - db;
  });

  if (suggestions[0]) {
    suggestions[0].recommended = true;
    suggestions[0].summary = (suggestions[0].summary || '') + ' · RECOMMENDED itinerary seed';
  }

  return {
    product_class: 'preliminary-not-flight-certified',
    note: 'Intelligent itinerary suggestions are local multi-leg seeds — not a global tour optimizer, not flight-certified.',
    direct,
    suggestions,
    generated_at: new Date().toISOString(),
    thorough: !!opts.thorough,
  };
}
