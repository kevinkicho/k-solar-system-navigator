/**
 * Curated classroom / teaching share demos.
 * Hashes use share-codec v1; recomputed on load — never trust stored Δv.
 * Live base: https://k-solar-system-navigator.web.app/
 */

import { encodePlanRequestObject } from '../ui/share-codec.js';

/** @typedef {{ id: string, title: string, summary: string, query?: string, hash: string, tags?: string[] }} DemoLink */

/**
 * Build a v1 share hash from a compact plan object.
 * @param {object} plan
 * @returns {string|null}
 */
export function buildDemoHash(plan) {
  return encodePlanRequestObject(plan);
}

/**
 * @param {string} [baseUrl] site origin without trailing slash
 * @param {DemoLink} demo
 */
export function buildDemoUrl(baseUrl, demo) {
  const base = (baseUrl || 'https://k-solar-system-navigator.web.app').replace(/\/$/, '');
  const q = demo.query ? `?${demo.query.replace(/^\?/, '')}` : '';
  const hash = demo.hash.startsWith('#') ? demo.hash : `#${demo.hash}`;
  return `${base}${q}${hash}`;
}

/**
 * Curated demos for README, About, and classroom packs.
 * @type {DemoLink[]}
 */
export const CLASSROOM_DEMOS = [
  {
    id: 'mars-2026',
    title: 'Earth → Mars · 2026 window',
    summary: 'Product default sample-DE · unrefueled Starship arch · ~258 d transit',
    hash: buildDemoHash({
      o: 'earth',
      d: 'mars',
      dep: '2026-11-21',
      tof: 258,
      veh: 'sh-starship',
      arch: 'unrefueled',
      basis: 'helio',
      view: 'cinematic',
      eph: 'sample',
    }) || '#v=1&o=earth&d=mars&dep=2026-11-21&tof=258&veh=sh-starship&arch=unrefueled&basis=helio&view=cinematic&eph=sample',
    tags: ['interplanetary', 'product'],
  },
  {
    id: 'mars-2033-ideal',
    title: 'Earth → Mars · 2033 min-energy',
    summary: 'Ideal Hohmann-class opportunity for teaching windows',
    hash: buildDemoHash({
      o: 'earth',
      d: 'mars',
      dep: '2033-04-22',
      tof: 259,
      veh: 'sh-starship',
      arch: 'unrefueled',
      basis: 'helio',
      view: 'cinematic',
      eph: 'sample',
    }) || '#v=1&o=earth&d=mars&dep=2033-04-22&tof=259',
    tags: ['interplanetary', 'window'],
  },
  {
    id: 'venus-direct',
    title: 'Earth → Venus · inner transfer',
    summary: 'Short-period inner-planet route',
    hash: buildDemoHash({
      o: 'earth',
      d: 'venus',
      dep: '2026-10-01',
      tof: 146,
      veh: 'sh-starship',
      arch: 'unrefueled',
      basis: 'helio',
      view: 'cinematic',
      eph: 'sample',
    }) || '#v=1&o=earth&d=venus&dep=2026-10-01&tof=146',
    tags: ['interplanetary', 'inner'],
  },
  {
    id: 'classroom-mars',
    title: 'Classroom · Earth → Mars',
    summary: 'Forces L1 offline + schematic + abstract budget (`?mode=classroom`)',
    query: 'mode=classroom',
    hash: buildDemoHash({
      o: 'earth',
      d: 'mars',
      dep: '2026-11-21',
      tof: 258,
      veh: 'abstract',
      ab: 50000,
      basis: 'helio',
      view: 'schematic',
    }) || '#v=1&o=earth&d=mars&dep=2026-11-21&tof=258&veh=abstract&ab=50000&view=schematic',
    tags: ['classroom', 'L1'],
  },
  {
    id: 'f9-mars-cargo',
    title: 'Falcon 9 · Earth → Mars cargo sketch',
    summary: 'Illustrative F9 C₃ table · 1000 kg cargo · not SpaceX-certified',
    hash: buildDemoHash({
      o: 'earth',
      d: 'mars',
      dep: '2026-11-21',
      tof: 258,
      veh: 'falcon9',
      f9v: 'expendable',
      cargo: 1000,
      basis: 'helio',
      view: 'cinematic',
      eph: 'sample',
    }) || '#v=1&o=earth&d=mars&dep=2026-11-21&tof=258&veh=falcon9&cargo=1000&eph=sample',
    tags: ['cargo', 'F9'],
  },
  {
    id: 'em-l2-sketch',
    title: 'Earth → EM-L2 · waypoint sketch',
    summary: 'Collinear L2 waypoint — geometric only, not CR3BP',
    hash: buildDemoHash({
      o: 'earth',
      d: 'em-l2',
      dep: '2026-07-01',
      tof: 30,
      veh: 'abstract',
      ab: 50000,
      basis: 'helio',
      view: 'schematic',
      eph: 'sample',
    }) || '#v=1&o=earth&d=em-l2&dep=2026-07-01&tof=30&veh=abstract&ab=50000',
    tags: ['waypoint', 'educational'],
  },
  {
    id: 'jupiter-via-mars',
    title: 'Earth → Mars flyby → Jupiter',
    summary: 'Multi-leg gravity-assist seed — coarse local, not global optimum',
    hash: buildDemoHash({
      o: 'earth',
      d: 'jupiter',
      dep: '2031-01-10',
      fb: [{ id: 'mars', date: '2031-10-01' }],
      veh: 'abstract',
      ab: 50000,
      basis: 'helio',
      view: 'cinematic',
      eph: 'sample',
    }) || '#v=1&o=earth&d=jupiter&dep=2031-01-10&fb=mars@2031-10-01&veh=abstract&ab=50000',
    tags: ['multi-leg', 'GA'],
  },
  {
    id: 'ops-mars',
    title: 'OPS review · Earth → Mars',
    summary: 'Same route with OPS query for light-time / educational OEM workflow',
    query: 'ops=1',
    hash: buildDemoHash({
      o: 'earth',
      d: 'mars',
      dep: '2026-11-21',
      tof: 258,
      veh: 'sh-starship',
      arch: 'unrefueled',
      basis: 'helio',
      view: 'cinematic',
      eph: 'sample',
    }) || '#v=1&o=earth&d=mars&dep=2026-11-21&tof=258&veh=sh-starship&arch=unrefueled&eph=sample',
    tags: ['ops', 'product'],
  },
];

/**
 * Markdown table rows for README / docs.
 * @param {string} [baseUrl]
 */
export function demoLinksMarkdown(baseUrl) {
  const lines = [
    '| Demo | Open |',
    '|---|---|',
  ];
  for (const d of CLASSROOM_DEMOS) {
    const url = buildDemoUrl(baseUrl, d);
    lines.push(`| **${d.title}** — ${d.summary} | [\`${d.id}\`](${url}) |`);
  }
  return lines.join('\n');
}

/**
 * Scenario id → demo id where they align (for UI cross-links).
 */
export function demoIdForScenario(scenarioId) {
  const map = {
    'mars-2026': 'mars-2026',
    'mars-2033-ideal': 'mars-2033-ideal',
    'venus-direct': 'venus-direct',
    'em-l2-sketch': 'em-l2-sketch',
    'jupiter-via-mars': 'jupiter-via-mars',
  };
  return map[scenarioId] || null;
}

