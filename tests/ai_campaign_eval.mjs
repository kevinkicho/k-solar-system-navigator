/**
 * AI campaign / recovery / memory eval harness (no live Ollama).
 */
import { parseCampaignHint } from '../js/agent/campaign-parse.js';
import { ruleBasedNextActions, buildRichMissionContext } from '../js/agent/mission-context.js';
import { appendMemoryTurn, getRecentMemoryTurns, memorySummaryForPrompt } from '../js/agent/memory.js';
import { recordUsage, getUsageSession, formatUsageSession } from '../js/agent/usage-session.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ AI CAMPAIGN / RECOVERY EVAL ━━━');

// NL parse
const h1 = parseCampaignHint('Plan Earth to Mars 2028 with 2 t cargo Starship Cape');
check('parse origin Earth', h1.origin === 'Earth');
check('parse dest Mars', h1.destination === 'Mars');
check('parse year', h1.departure === '2028');
check('parse cargo tonnes', h1.cargoMass_kg === 2000);
check('parse vehicle SS', h1.vehicleId === 'sh-starship');
check('parse cape', h1.launchSiteId === 'cape');

const h2 = parseCampaignHint('Falcon 9 Earth Jupiter with flyby');
check('parse F9', h2.vehicleId === 'falcon9');
check('parse suggestGa', h2.suggestGa === true);

const nogoCtx = buildRichMissionContext({
  routeOrigin: { name: 'Earth' },
  routeDestination: { name: 'Jupiter' },
  transferData: {
    lambertOk: true,
    dossier: {
      status: 'fail',
      mission_ready: false,
      gates: [
        { code: 'G_VEHICLE_MARGIN', level: 'fail', message: 'margin negative' },
        { code: 'G_SITE_DLA', level: 'fail', message: 'DLA high' },
      ],
    },
  },
});
const next = ruleBasedNextActions(nogoCtx);
check('nogo next has review or vehicle', next.some((a) => /gate|vehicle|margin|recover/i.test(a.id + a.label)));

// Memory (node: localStorage may be missing — polyfill lightly)
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

appendMemoryTurn('user', 'hello campaign');
appendMemoryTurn('assistant', 'set route done');
const turns = getRecentMemoryTurns(5);
check('memory has turns', turns.length >= 2);
check('memory summary non-empty', memorySummaryForPrompt(4).includes('user'));

// Usage session
recordUsage({ prompt_eval_count: 10, eval_count: 20, total_duration: 1e9 }, 'gemma4:31b-cloud');
const u = getUsageSession();
check('usage calls >= 1', u.calls >= 1);
check('usage format', /call/i.test(formatUsageSession(u)));

check('parseCampaignHint is pure', typeof parseCampaignHint === 'function');

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('ai_campaign_eval: ok');
