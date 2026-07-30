/**
 * Industrial reference missions — share-hash work packages for realistic use.
 * Hashes use share-codec v1; recomputed on load — never trust stored Δv.
 * Primary deploy surface: Firebase App Hosting.
 */

import { encodePlanRequestObject } from '../ui/share-codec.js';

/** @typedef {{ id: string, title: string, summary: string, query?: string, hash: string, tags?: string[] }} ReferenceMission */

/** Canonical production URL (App Hosting). Classic Hosting remains a static fallback. */
export const PRIMARY_APP_URL = 'https://helios--k-solar-system-navigator.us-central1.hosted.app';
export const FALLBACK_HOSTING_URL = 'https://k-solar-system-navigator.web.app';

/**
 * @param {object} plan
 * @returns {string|null}
 */
export function buildDemoHash(plan) {
  return encodePlanRequestObject(plan);
}

/**
 * @param {string} [baseUrl]
 * @param {ReferenceMission} mission
 */
export function buildDemoUrl(baseUrl, mission) {
  const base = (baseUrl || PRIMARY_APP_URL).replace(/\/$/, '');
  const q = mission.query ? `?${mission.query.replace(/^\?/, '')}` : '';
  const hash = mission.hash.startsWith('#') ? mission.hash : `#${mission.hash}`;
  return `${base}${q}${hash}`;
}

/**
 * Realistic-use reference missions (product vehicle defaults, sample-DE).
 * @type {ReferenceMission[]}
 */
export const CLASSROOM_DEMOS = []; // removed — use REFERENCE_MISSIONS

/** @type {ReferenceMission[]} */
export const REFERENCE_MISSIONS = [
  {
    id: 'mars-2026',
    title: 'Earth → Mars · 2026 window',
    summary: 'L2/L3-plan sample-DE · unrefueled Starship · ~258 d transit',
    hash: buildDemoHash({
      o: 'earth', d: 'mars', dep: '2026-11-21', tof: 258,
      veh: 'sh-starship', arch: 'unrefueled', basis: 'helio', view: 'cinematic', eph: 'sample',
    }) || '#v=1&o=earth&d=mars&dep=2026-11-21&tof=258&veh=sh-starship&arch=unrefueled&eph=sample',
    tags: ['interplanetary', 'product'],
  },
  {
    id: 'mars-2033-ideal',
    title: 'Earth → Mars · 2033 min-energy',
    summary: 'Near-Hohmann opportunity for window campaign analysis',
    hash: buildDemoHash({
      o: 'earth', d: 'mars', dep: '2033-04-22', tof: 259,
      veh: 'sh-starship', arch: 'unrefueled', basis: 'helio', view: 'cinematic', eph: 'sample',
    }) || '#v=1&o=earth&d=mars&dep=2033-04-22&tof=259&veh=sh-starship&arch=unrefueled&eph=sample',
    tags: ['interplanetary', 'window'],
  },
  {
    id: 'venus-direct',
    title: 'Earth → Venus · inner transfer',
    summary: 'Short-period inner-planet injection case',
    hash: buildDemoHash({
      o: 'earth', d: 'venus', dep: '2026-10-01', tof: 146,
      veh: 'sh-starship', arch: 'unrefueled', basis: 'helio', view: 'cinematic', eph: 'sample',
    }) || '#v=1&o=earth&d=venus&dep=2026-10-01&tof=146&veh=sh-starship&arch=unrefueled&eph=sample',
    tags: ['interplanetary', 'inner'],
  },
  {
    id: 'f9-mars-cargo',
    title: 'Falcon 9 · Earth → Mars cargo',
    summary: 'F9 C₃–payload table · 1000 kg · not SpaceX-certified performance',
    hash: buildDemoHash({
      o: 'earth', d: 'mars', dep: '2026-11-21', tof: 258,
      veh: 'falcon9', f9v: 'expendable', cargo: 1000, basis: 'helio', view: 'cinematic', eph: 'sample',
    }) || '#v=1&o=earth&d=mars&dep=2026-11-21&tof=258&veh=falcon9&cargo=1000&eph=sample',
    tags: ['cargo', 'F9'],
  },
  {
    id: 'jupiter-via-mars',
    title: 'Earth → Mars flyby → Jupiter',
    summary: 'Multi-leg GA seed · local refine · not global multi-leg optimum',
    hash: buildDemoHash({
      o: 'earth', d: 'jupiter', dep: '2031-01-10',
      fb: [{ id: 'mars', date: '2031-10-01' }],
      veh: 'sh-starship', arch: 'unrefueled', basis: 'helio', view: 'cinematic', eph: 'sample',
    }) || '#v=1&o=earth&d=jupiter&dep=2031-01-10&fb=mars@2031-10-01&veh=sh-starship&arch=unrefueled&eph=sample',
    tags: ['multi-leg', 'GA'],
  },
  {
    id: 'ops-mars',
    title: 'OPS review · Earth → Mars',
    summary: 'OPS light-time / asymptote review surface (`?ops=1`)',
    query: 'ops=1',
    hash: buildDemoHash({
      o: 'earth', d: 'mars', dep: '2026-11-21', tof: 258,
      veh: 'sh-starship', arch: 'unrefueled', basis: 'helio', view: 'cinematic', eph: 'sample',
    }) || '#v=1&o=earth&d=mars&dep=2026-11-21&tof=258&veh=sh-starship&arch=unrefueled&eph=sample',
    tags: ['ops', 'product'],
  },
  {
    id: 'schematic-physical',
    title: 'Physical path · Earth → Mars',
    summary: 'Schematic display + physical geometry for path honesty review',
    hash: buildDemoHash({
      o: 'earth', d: 'mars', dep: '2026-11-21', tof: 258,
      veh: 'sh-starship', arch: 'unrefueled', basis: 'helio', view: 'schematic', eph: 'sample',
    }) || '#v=1&o=earth&d=mars&dep=2026-11-21&tof=258&veh=sh-starship&arch=unrefueled&view=schematic&eph=sample',
    tags: ['accuracy', 'physical'],
  },
];

// Back-compat alias for older imports
export const DEMO_LINKS = REFERENCE_MISSIONS;

/**
 * @param {string} [baseUrl]
 */
export function demoLinksMarkdown(baseUrl) {
  const lines = ['| Reference mission | Open |', '|---|---|'];
  for (const d of REFERENCE_MISSIONS) {
    lines.push(`| **${d.title}** — ${d.summary} | [\`${d.id}\`](${buildDemoUrl(baseUrl, d)}) |`);
  }
  return lines.join('\n');
}

export function demoIdForScenario(scenarioId) {
  const map = {
    'mars-2026': 'mars-2026',
    'mars-2033-ideal': 'mars-2033-ideal',
    'venus-direct': 'venus-direct',
    'jupiter-via-mars': 'jupiter-via-mars',
  };
  return map[scenarioId] || null;
}
