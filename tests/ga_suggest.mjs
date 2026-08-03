/**
 * Gravity-assist suggestion engine (offline).
 */
import { BODIES } from '../js/data/bodies.js';
import { DAY, J2000 } from '../js/constants.js';
import {
  pickAssistCandidates,
  evaluateDirectBaseline,
  evaluateAssistCandidate,
  suggestAssistPaths,
  dualFlybyTemplates,
} from '../js/physics/ga-suggest.js';
// Ensure multi-leg solver is bound
import '../js/physics/routing.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const earth = BODIES.find((b) => b.name === 'Earth');
const jupiter = BODIES.find((b) => b.name === 'Jupiter');
const mars = BODIES.find((b) => b.name === 'Mars');
const venus = BODIES.find((b) => b.name === 'Venus');
const dep = (Date.UTC(2031, 0, 10, 12) - J2000) / 1000;

const cands = pickAssistCandidates(earth, jupiter);
assert(cands.length >= 1, 'candidates for Earth→Jupiter');
assert(!cands.some((b) => b.name === 'Earth' || b.name === 'Jupiter'), 'no O/D in candidates');
assert(cands.some((b) => b.name === 'Mars' || b.name === 'Venus'), 'classic assist among candidates');

const direct = evaluateDirectBaseline(earth, jupiter, dep, { ephemerisBackend: 'approx' });
assert(direct && direct.kind === 'direct', 'direct baseline');
assert(direct.dvTotal_m_s > 5000 && direct.dvTotal_m_s < 80000, `direct dv sane ${direct.dvTotal_m_s}`);

// Single candidate (Mars) — may or may not find feasible seed; should not throw
const marsAssist = evaluateAssistCandidate(earth, jupiter, mars, dep, { ephemerisBackend: 'approx' }, {
  nDep: 8,
  nFb: 6,
});
if (marsAssist) {
  assert(marsAssist.kind === 'assist', 'assist kind');
  assert(marsAssist.flybyNames.includes('Mars'), 'mars flyby');
  assert(marsAssist.dvTotal_m_s > 0, 'assist dv');
}

const pack = suggestAssistPaths(earth, jupiter, dep, { ephemerisBackend: 'approx' }, {
  candidates: [venus, mars].filter(Boolean),
  nDep: 8,
  nFb: 6,
  maxSuggestions: 5,
  includeDual: false,
});
assert(pack.suggestions.length >= 1, 'at least direct or assist');
assert(pack.product_class === 'preliminary-not-flight-certified', 'product class');
assert(/not a global/i.test(pack.note || ''), 'seed honesty note');
const rec = pack.suggestions.filter((s) => s.recommended);
assert(rec.length === 1, 'exactly one recommended');
const duals = dualFlybyTemplates(earth, jupiter);
assert(Array.isArray(duals), 'dual templates array');

// Same SOI / inner: still returns structure
const packInner = suggestAssistPaths(earth, mars, dep, { ephemerisBackend: 'approx' }, {
  candidates: [venus],
  nDep: 6,
  nFb: 4,
});
assert(Array.isArray(packInner.suggestions), 'inner pack list');

console.log('ga_suggest: ok', {
  cands: cands.map((b) => b.name),
  nSuggest: pack.suggestions.length,
  rec: rec[0]?.label,
  marsAssist: !!marsAssist,
});
