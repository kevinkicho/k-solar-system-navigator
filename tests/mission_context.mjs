/**
 * Mission context + next-actions unit tests (AI core).
 */
import {
  buildRichMissionContext,
  formatContextForPrompt,
  ruleBasedNextActions,
} from '../js/agent/mission-context.js';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ MISSION CONTEXT (AI CORE) ━━━');

const empty = buildRichMissionContext({});
check('empty has product class', empty.product?.not_flight_certified === true);
const nextEmpty = ruleBasedNextActions(empty);
check('empty suggests set origin', nextEmpty.some((a) => a.id === 'set_origin'));

const readyState = {
  routeOrigin: { name: 'Earth' },
  routeDestination: { name: 'Mars' },
  vehicleId: 'sh-starship',
  starshipArch: 'unrefueled',
  fidelityLevel: 'L3-plan',
  ephemerisBackend: 'sample-de',
  pathGeometry: 'physical',
  transferData: {
    lambertOk: true,
    dvTotal_lambert: 6200,
    dossier: {
      status: 'pass',
      mission_ready: true,
      launch_enabled: true,
      gates: [{ code: 'G_LAMBERT', level: 'ok', message: 'ok' }],
    },
  },
};
const ctx = buildRichMissionContext(readyState);
check('route origin Earth', ctx.route.origin === 'Earth');
check('transfer present', !!ctx.transfer);
check('mission ready', ctx.dossier?.mission_ready === true);
const nextReady = ruleBasedNextActions(ctx);
check('ready suggests fly study', nextReady.some((a) => a.id === 'fly_study'));
check('prompt context non-empty', formatContextForPrompt(ctx).length > 50);
check('prompt mentions preliminary', /preliminary|not flight/i.test(formatContextForPrompt(ctx)));

const nogo = buildRichMissionContext({
  routeOrigin: { name: 'Earth' },
  routeDestination: { name: 'Jupiter' },
  transferData: {
    lambertOk: true,
    dossier: {
      status: 'fail',
      mission_ready: false,
      gates: [{ code: 'G_VEHICLE', level: 'fail', message: 'margin' }],
    },
  },
});
check('nogo suggests review gates', ruleBasedNextActions(nogo).some((a) => a.id === 'review_gates'));

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('mission_context: ok');
