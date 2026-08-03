/**
 * Moon-system tour sketch helpers (same-SOI multi-stop seeds).
 * Parent-centered concept — not CR3BP, not flight-certified.
 */

import { listMoons } from '../data/catalog.js';
import { isPlanetRelativeRoute } from './planet-relative.js';

/**
 * List co-parent moons for a route body (or parent planet).
 * @param {object} body
 * @returns {object[]}
 */
export function coParentMoons(body) {
  if (!body) return [];
  const parentName = body.parent && body.parent !== 'Sun' ? body.parent : body.name;
  return listMoons().filter((m) => (m.parent || '') === parentName);
}

/**
 * Suggest same-SOI itinerary templates (2–3 moon hops).
 * @param {object} origin
 * @param {object} dest
 * @returns {{ templates: object[], product_class: string, note: string }}
 */
export function moonSystemTemplates(origin, dest) {
  if (!origin || !dest) {
    return empty('Set origin and destination');
  }
  if (!isPlanetRelativeRoute(origin, dest)) {
    return empty('Moon-system sketch applies only to same-SOI (planet-relative) pairs');
  }

  const moons = coParentMoons(origin);
  const oName = origin.name;
  const dName = dest.name;
  const mid = moons.filter((m) => m.name !== oName && m.name !== dName).slice(0, 4);

  const templates = [
    {
      id: 'moon-direct',
      kind: 'direct',
      label: `${oName} → ${dName} (parent-centered direct)`,
      bodies: [],
      rationale: 'Single parent-centered Lambert · not CR3BP',
    },
  ];

  for (const m of mid.slice(0, 2)) {
    templates.push({
      id: `moon-via-${(m.id || m.name).toLowerCase()}`,
      kind: 'via',
      label: `${oName} → ${m.name} → ${dName}`,
      bodies: [m],
      rationale: `Via ${m.name} within parent SOI · sketch only · not CR3BP tour design`,
    });
  }

  if (mid.length >= 2) {
    templates.push({
      id: 'moon-dual-via',
      kind: 'via-dual',
      label: `${oName} → ${mid[0].name} → ${mid[1].name} → ${dName}`,
      bodies: [mid[0], mid[1]],
      rationale: 'Dual-moon hop sketch · not a global moon-tour optimum',
    });
  }

  return {
    templates,
    parent: origin.parent && origin.parent !== 'Sun' ? origin.parent : origin.name,
    product_class: 'preliminary-not-flight-certified',
    note: 'Moon-system templates are same-SOI sketches — not CR3BP, not flight-certified.',
  };
}

function empty(msg) {
  return {
    templates: [],
    product_class: 'preliminary-not-flight-certified',
    note: msg,
  };
}

/**
 * Bodies in catalog that are moons of a named parent.
 */
export function listMoonsOf(parentName) {
  if (!parentName) return [];
  return listMoons().filter((m) => (m.parent || '').toLowerCase() === String(parentName).toLowerCase());
}

/** Routeable moon-system pairs hint for UI. */
export function moonSystemRouteHint() {
  const jup = listMoonsOf('Jupiter').slice(0, 4).map((m) => m.name);
  return {
    examples: jup.length >= 2 ? [`${jup[0]} → ${jup[1]}`, `${jup[1]} → ${jup[2] || jup[0]}`] : ['Europa → Io'],
    note: 'Use planet-relative mode (auto for same SOI). Not CR3BP.',
  };
}
