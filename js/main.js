// Entry point. Imports module side-effects (scene construction, DOM wiring) in
// dependency order, then starts the render loop.

import { SUN_WOBBLE_EXAGGERATION } from './constants.js';
import { state, applyProductVehicleDefaults } from './state.js';
import { setDisplayMode } from './display-scale.js';
import * as catalog from './data/catalog.js';

// Scene construction (each import builds its piece of the THREE.js scene).
import './scene/setup.js';
import { sunMesh } from './scene/sun.js';
import './scene/grid.js';
import './scene/asteroid-belt.js';
import { planetMeshes } from './scene/planets.js';
import './scene/moons.js';
import './scene/spacecraft.js';
import './scene/extra-bodies.js';
import { FX, hillMeshes, potentialMesh } from './scene/gravity-field.js';
import './scene/selection-ring.js';
import { shipGroup } from './scene/ship.js';
import * as TransferVisual from './scene/transfer-visual.js';
import { flybyMarkers, transferMarkers } from './scene/transfer-visual.js';
import { scene } from './scene/setup.js';
import { loadStarField } from './scene/stars.js';

// Physics imports (used below for window.__HELIOS test hook).
import { getBodyPosition3D, getSunBarycentricOffset } from './physics/kepler.js';

// UI wiring.
import { buildBodyList, bindRouteSetters, setupRouteDropTargets } from './ui/body-list.js';
import { wireControls } from './ui/controls.js';
import { wireInput } from './ui/input.js';
import { wirePorkchop } from './ui/porkchop.js';
import { wireScenarios } from './ui/scenarios.js';
import { dateToInputValue, notify } from './ui/format.js';
import { bindMissionHandlers } from './ui/route-display.js';
import { bindAbortHandler, setRouteDestination, setRouteOrigin } from './ui/route-planner.js';
import { tryApplyHashOnLoad, updateViewBadge } from './ui/share.js';
import { wireMissionImport } from './ui/mission-import.js';
import { wireRecentRoutes } from './ui/recent-routes.js';
import { timeState } from './ui/time-system.js';
import { buildMeasurementCard } from './ui/measurement-card.js';
import { wireVehicleLab } from './ui/vehicle-lab.js';
import { wireAgentChat } from './ui/agent-chat.js';
import { wireRailUi } from './ui/rail-ui.js';
import { wireBodyPicker } from './ui/body-picker.js';
import { wireBodyDossier } from './ui/body-dossier-modal.js';
import { wireSurfacePointUi } from './ui/surface-point-ui.js';
import { wireFirebaseUi } from './ui/firebase-ui.js';
import { wireMapMode } from './ui/map-mode.js';
import { wireTrajectoryHud } from './ui/trajectory-hud.js';
import { wireQualityTier } from './ui/quality-tier.js';
import { wireCameraFocus } from './ui/camera-focus.js';
import { wirePhysicsView } from './ui/physics-view.js';
import { wireFlightOpsUi } from './ui/flight-ops-ui.js';
import { applyBodyScales } from './scene/body-scale.js';
import { applyProductTheme, syncFidelityChip, syncProductClassFooters } from './ui/product-chrome.js';

// Mission + animation.
import { abortMission, launchMission, wireMissionStudyBar } from './mission.js';
import { animate } from './animation.js';

// Wire dependency-injected handlers (breaks the route ↔ mission cycle).
bindMissionHandlers({ launch: launchMission });
bindAbortHandler(abortMission);
bindRouteSetters({ origin: setRouteOrigin, destination: setRouteDestination });
wireMissionStudyBar();

// Industrial product defaults: unrefueled SS arch + L2/L3-plan sample-DE.
// Use ?firebase=0 for offline hermetic / CI only.
applyProductVehicleDefaults();
syncFidelityChip({ pending: true });
import('./physics/ephemeris-sample.js').then(async (m) => {
  await m.ensureSampleTableLoaded();
  const ephSel = document.getElementById('ephemeris-backend');
  if (ephSel) ephSel.value = 'sample-de';
  if (m.sampleTableIsSpiceDe?.()) {
    state.fidelityLevel = 'L3-plan';
  }
  syncFidelityChip();
  syncProductClassFooters();
}).catch(() => {
  syncFidelityChip();
  syncProductClassFooters();
});
// Warm Firebase + dense SPICE from Storage CDN after SPA paints
queueMicrotask(() => {
  import('./firebase/app.js').then(async ({ initFirebase, isFirebaseEnabled }) => {
    try {
      initFirebase();
      if (!isFirebaseEnabled()) return;
      const dense = await import('./physics/dense-spk-pack.js');
      const warm = await dense.warmDensePacksFromCloud([
        { name: 'Phobos' }, { name: 'Earth' }, { name: 'Moon' },
      ]);
      if (warm?.warmed) {
        console.info('[HELIOS] dense SPICE warm', warm.registry_source, warm.packs?.join?.(', '));
      }
    } catch (err) {
      console.warn('[HELIOS] dense SPICE warm', err?.message || err);
    }
  }).catch(() => {});
});
applyProductTheme();

// Build body list, set initial time + departure-date input, fade help hint.
buildBodyList();
setupRouteDropTargets();
wireControls();
wireInput();
wirePorkchop();
wireScenarios();
wireMissionImport();
wireRecentRoutes();
wireVehicleLab();
wireRailUi();
wireBodyPicker();
wireBodyDossier();
wireSurfacePointUi();
try {
  wireAgentChat(); // FAB chat + onboard agent C2 — never block app boot
} catch (err) {
  console.error('[HELIOS] agent chat failed to wire', err);
}
try {
  wireFirebaseUi(); // Auth chip + cloud plans — offline if config missing / ?firebase=0
} catch (err) {
  console.error('[HELIOS] Firebase UI failed to wire', err);
}
try {
  wireMapMode();
  wireTrajectoryHud();
  wireQualityTier();
  wireCameraFocus();
  wirePhysicsView();
  wireFlightOpsUi();
  applyBodyScales();
  try {
    import('./ui/ga-suggest-ui.js').then((m) => m.wireGaSuggestUi?.()).catch(() => {});
  } catch { /* */ }
} catch (err) {
  console.error('[HELIOS] viz/map-mode wiring failed', err);
}
loadStarField();
updateViewBadge();

timeState.setSpeed(3);
timeState.updateDisplay();
document.getElementById('depart-date').value = dateToInputValue(timeState.getDate());

// Apply share hash after UI is ready.
tryApplyHashOnLoad();

setTimeout(() => {
  const hint = document.getElementById('help-hint');
  if (hint) hint.style.opacity = '0';
}, 8000);

// Test / automation hook. Always expose scene + bodyPositions (CI Playwright).
// Sensitive execute surfaces stay gated on loopback / ?debug=1 via onboard agent.
window.__HELIOS = {
  get scene() { return scene; },
  get sunMesh() { return sunMesh; },
  get planetMeshes() { return planetMeshes; },
  get bodyPositions() { return state.bodyPositions; },
  get transferMarkers() { return transferMarkers; },
  get transferLine() { return TransferVisual.transferLine; },
  get transferData() { return state.transferData; },
  get timeState() { return timeState; },
  get SUN_WOBBLE_EXAGGERATION() { return SUN_WOBBLE_EXAGGERATION; },
  get FX() { return FX; },
  get potentialMesh() { return potentialMesh; },
  get hillMeshes() { return hillMeshes; },
  get mission() { return state.mission; },
  get flybyMarkers() { return flybyMarkers; },
  get shipGroup() { return shipGroup; },
  get state() { return state; },
  get catalog() { return catalog; },
  get display() { return state.display; },
  get fidelityLevel() { return state.fidelityLevel; },
  buildMeasurementCard,
  getSunBarycentricOffset,
  getBodyPosition3D,
};

animate();
