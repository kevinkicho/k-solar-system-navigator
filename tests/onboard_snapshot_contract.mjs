// Pure summarizeTransfer / canLaunchMission contracts (no DOM/Three).

import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const { summarizeTransfer, buildMissionSnapshot } = await import(
  pathToFileURL(resolve(ROOT, 'js/agent/transfer-summary.js')).href
);
const { canLaunchMission } = await import(
  pathToFileURL(resolve(ROOT, 'js/mission-gates.js')).href
);

let passed = 0, failed = 0;
function check(label, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n━━━ ONBOARD SNAPSHOT / LAUNCH GATES ━━━');

check('summarizeTransfer null', summarizeTransfer(null) === null);

const bad = summarizeTransfer({
  planDossier: { mission_ready: true, overall: 'pass' },
  dvTotal: 1000,
});
check('wrong planDossier field → missionReady null', bad.missionReady === null);

const good = summarizeTransfer({
  dossier: { mission_ready: true, launch_enabled: true, status: 'pass' },
  dvTotal_lambert: 5500,
  lambertOk: true,
});
check('td.dossier.mission_ready true', good.missionReady === true);
check('quality uses status not overall', good.quality === 'pass');
check('deltaV from dvTotal_lambert', good.deltaV_m_s === 5500);

const snap = buildMissionSnapshot({
  routeOrigin: { name: 'Earth' },
  routeDestination: { name: 'Mars' },
  vehicleId: 'sh-starship',
  transferData: {
    dossier: { mission_ready: true, status: 'pass', launch_enabled: true },
    dvTotal_lambert: 4000,
  },
});
check('snapshot origin Earth', snap.origin === 'Earth');
check('snapshot transfer missionReady', snap.transfer?.missionReady === true);

check('canLaunch null', canLaunchMission(null).ok === false);
check('canLaunch no dossier lambert ok', canLaunchMission({ lambertOk: true }).ok === true);
check(
  'canLaunch blocked by dossier',
  canLaunchMission({
    lambertOk: true,
    dossier: { mission_ready: false, launch_enabled: false },
  }).ok === false,
);
check(
  'canLaunch launch_enabled false',
  canLaunchMission({
    lambertOk: true,
    dossier: { mission_ready: true, launch_enabled: false },
  }).ok === false,
);
check(
  'canLaunch ok',
  canLaunchMission({
    lambertOk: true,
    dossier: { mission_ready: true, launch_enabled: true },
  }).ok === true,
);

console.log(`\nSnapshot/gates: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
