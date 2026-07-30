/**
 * Industrial reference mission share hashes (offline).
 */
import {
  REFERENCE_MISSIONS, CLASSROOM_DEMOS, buildDemoUrl, buildDemoHash,
  demoLinksMarkdown, PRIMARY_APP_URL,
} from '../js/data/demo-links.js';
import { parsePlanRequest } from '../js/ui/share-codec.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

assert(Array.isArray(CLASSROOM_DEMOS) && CLASSROOM_DEMOS.length === 0, 'classroom demos removed');
assert(REFERENCE_MISSIONS.length >= 5, 'at least 5 reference missions');
const ids = new Set();
for (const d of REFERENCE_MISSIONS) {
  assert(d.id && d.title && d.hash, `mission fields ${d.id}`);
  assert(!ids.has(d.id), `unique id ${d.id}`);
  ids.add(d.id);
  assert(d.hash.startsWith('#'), `hash starts with # (${d.id})`);
  assert(!/classroom|teaching|educational-only/i.test(d.summary || ''), `no teaching tone ${d.id}`);
  const req = parsePlanRequest(d.hash);
  assert(req, `parseable hash ${d.id}`);
  assert(req.originId && req.destId && req.depDate, `o/d/dep ${d.id}`);
}

assert(!ids.has('classroom-mars'), 'no classroom-mars');
const url = buildDemoUrl(undefined, REFERENCE_MISSIONS[0]);
assert(url.startsWith(PRIMARY_APP_URL), 'primary App Hosting URL');
assert(url.includes('#v=1'), 'url has hash');

const h = buildDemoHash({
  o: 'earth', d: 'mars', dep: '2026-11-21', tof: 258,
  veh: 'sh-starship', arch: 'unrefueled', basis: 'helio', view: 'cinematic', eph: 'sample',
});
assert(h && parsePlanRequest(h), 'buildDemoHash round-trip');

const md = demoLinksMarkdown();
assert(/Earth → Mars/.test(md) && /\|/.test(md), 'markdown table');

console.log('demo_links: ok', REFERENCE_MISSIONS.length, 'reference missions');
