/**
 * Intelligent itinerary suggestion engine (offline).
 */
import { BODIES } from '../js/data/bodies.js';
import { DAY, J2000 } from '../js/constants.js';
import {
  itineraryTemplates,
  suggestItineraries,
} from '../js/physics/itinerary-suggest.js';
import '../js/physics/routing.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const jupiter = BODIES.find((b) => b.name === 'Jupiter');
const dep = (Date.UTC(2031, 0, 10, 12) - J2000) / 1000;

// Templates: Earth→Mars should include direct + Venus assist option
const tEvm = itineraryTemplates(earth, mars);
assert(tEvm.length >= 1, 'templates for Earth→Mars');
assert(tEvm.some((t) => t.kind === 'direct'), 'direct template');
assert(tEvm.some((t) => /venus/i.test(t.label) || t.id === 'itin-evm'), 'EVM-class template');

// Outer: Earth→Jupiter should expose multi-stop family options
const tEj = itineraryTemplates(earth, jupiter);
assert(tEj.length >= 2, 'outer templates');
assert(tEj.some((t) => t.kind === 'direct'), 'direct for outer');

// Ranked pack
const pack = suggestItineraries(earth, mars, dep, { ephemerisBackend: 'approx' }, {
  thorough: false,
});
assert(pack.product_class === 'preliminary-not-flight-certified', 'product class');
assert(/not a global/i.test(pack.note || ''), 'seed honesty note');
assert(Array.isArray(pack.suggestions), 'suggestions array');
assert(pack.suggestions.length >= 1, 'at least one itinerary seed');
const rec = pack.suggestions.filter((s) => s.recommended);
assert(rec.length === 1, 'exactly one recommended');
assert(rec[0].dvTotal_m_s > 0, 'recommended has Need');
assert(Array.isArray(rec[0].stops) && rec[0].stops.length >= 2, 'stops list');

// Earth→Jupiter pack structure (may be only direct if multi-leg windows miss)
const packJ = suggestItineraries(earth, jupiter, dep, { ephemerisBackend: 'approx' }, {
  thorough: false,
});
assert(Array.isArray(packJ.suggestions), 'jupiter pack list');
assert(packJ.suggestions.every((s) => s.kind?.startsWith('itinerary') || s.kind === 'direct'), 'kinds');

console.log('itinerary_suggest: ok', {
  earthMarsTemplates: tEvm.map((t) => t.id),
  nSuggestMars: pack.suggestions.length,
  rec: rec[0]?.itineraryLabel || rec[0]?.label,
  nSuggestJupiter: packJ.suggestions.length,
});
