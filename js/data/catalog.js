// Unified destination catalog: stable string ids for URL/JSON share.

import { BODIES } from './bodies.js';
import { MOONS } from './moons.js';
import { DWARFS } from './dwarfs.js';
import { NEOS } from './neos.js';
import { WAYPOINTS } from './waypoints.js';

function slugify(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, '-');
}

function annotate(list, defaults) {
  for (const b of list) {
    if (!b.id) b.id = slugify(b.name);
    if (!b.kind) b.kind = defaults.kind;
    if (b.routeable === undefined) b.routeable = true;
    if (b.selectable === undefined) b.selectable = true;
    if (b.flybyEligible === undefined) b.flybyEligible = defaults.flybyEligible;
  }
  return list;
}

annotate(BODIES, { kind: 'planet', flybyEligible: true });
annotate(MOONS, { kind: 'moon', flybyEligible: false });
annotate(DWARFS, { kind: 'dwarf', flybyEligible: true });
annotate(NEOS, { kind: 'neo', flybyEligible: false });
// Preserve per-NEO flybyEligible if already set
for (const n of NEOS) {
  if (n.flybyEligible === undefined) n.flybyEligible = false;
}
annotate(WAYPOINTS, { kind: 'waypoint', flybyEligible: false });
for (const w of WAYPOINTS) w.flybyEligible = false;

const CACHE = [...BODIES, ...MOONS, ...DWARFS, ...NEOS, ...WAYPOINTS];

export function allBodies() {
  return CACHE;
}

export function listPlanets() { return BODIES; }
export function listMoons() { return MOONS; }
export function listDwarfs() { return DWARFS; }
export function listNeos() { return NEOS; }
export function listWaypoints() { return WAYPOINTS; }

export function listRouteable() {
  return CACHE.filter(b => b.routeable !== false);
}

export function listFlybyEligible() {
  return CACHE.filter(b => b.flybyEligible);
}

export function findById(id) {
  if (!id) return null;
  const key = String(id).toLowerCase();
  return CACHE.find(b => b.id === key) || null;
}

export function findByName(name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  return CACHE.find(b => b.name.toLowerCase() === n) || null;
}

export function findByIdOrName(key) {
  if (!key) return null;
  return findById(key) || findByName(key);
}

/** Prefer id, fall back to name for legacy flyby entries. */
export function resolveFlybyBody(entry) {
  if (!entry) return null;
  if (entry.bodyId) return findById(entry.bodyId);
  if (entry.bodyName) return findByName(entry.bodyName);
  if (typeof entry === 'string') return findByIdOrName(entry);
  return null;
}

export function bodyId(body) {
  if (!body) return null;
  return body.id || slugify(body.name);
}
