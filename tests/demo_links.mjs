/**
 * Curated classroom demo share hashes (offline).
 */
import { CLASSROOM_DEMOS, buildDemoUrl, buildDemoHash, demoLinksMarkdown } from '../js/data/demo-links.js';
import { parsePlanRequest } from '../js/ui/share-codec.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

assert(CLASSROOM_DEMOS.length >= 6, 'at least 6 demos');
const ids = new Set();
for (const d of CLASSROOM_DEMOS) {
  assert(d.id && d.title && d.hash, `demo fields ${d.id}`);
  assert(!ids.has(d.id), `unique id ${d.id}`);
  ids.add(d.id);
  assert(d.hash.startsWith('#'), `hash starts with # (${d.id})`);
  const req = parsePlanRequest(d.hash);
  assert(req, `parseable hash ${d.id}`);
  assert(req.originId && req.destId && req.depDate, `o/d/dep ${d.id}`);
}

const classroom = CLASSROOM_DEMOS.find((d) => d.id === 'classroom-mars');
assert(classroom?.query === 'mode=classroom', 'classroom query');
const url = buildDemoUrl('https://example.test', classroom);
assert(url.includes('mode=classroom'), 'url has classroom');
assert(url.includes('#v=1'), 'url has hash');

const h = buildDemoHash({
  o: 'earth', d: 'mars', dep: '2026-11-21', tof: 258, veh: 'abstract', ab: 50000, basis: 'helio', view: 'schematic',
});
assert(h && parsePlanRequest(h), 'buildDemoHash round-trip');

const md = demoLinksMarkdown();
assert(/Earth → Mars/.test(md) && /\|/.test(md), 'markdown table');

console.log('demo_links: ok', CLASSROOM_DEMOS.length, 'demos');
