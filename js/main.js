// Entry point. Imports module side-effects (scene construction, DOM wiring) in
// dependency order, then starts the render loop.

import { SUN_WOBBLE_EXAGGERATION } from './constants.js';
import { state } from './state.js';

// Scene construction (each import builds its piece of the THREE.js scene).
import './scene/setup.js';
import { sunMesh } from './scene/sun.js';
import './scene/grid.js';
import './scene/asteroid-belt.js';
import { planetMeshes } from './scene/planets.js';
import './scene/moons.js';
import './scene/spacecraft.js';
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
import { dateToInputValue } from './ui/format.js';
import { bindMissionHandlers } from './ui/route-display.js';
import { bindAbortHandler, setRouteDestination, setRouteOrigin } from './ui/route-planner.js';
import { timeState } from './ui/time-system.js';

// Mission + animation.
import { abortMission, launchMission } from './mission.js';
import { animate } from './animation.js';

// Wire dependency-injected handlers (breaks the route ↔ mission cycle).
bindMissionHandlers({ launch: launchMission, abort: abortMission });
bindAbortHandler(abortMission);
bindRouteSetters({ origin: setRouteOrigin, destination: setRouteDestination });

// Build body list, set initial time + departure-date input, fade help hint.
buildBodyList();
setupRouteDropTargets();
wireControls();
wireInput();
wirePorkchop();
loadStarField();

timeState.setSpeed(3);
timeState.updateDisplay();
document.getElementById('depart-date').value = dateToInputValue(timeState.getDate());

setTimeout(() => { document.getElementById('help-hint').style.opacity = '0'; }, 8000);

// Test hook — exposes live scene state to automation (Playwright, Puppeteer).
window.__HELIOS = {
  get scene() { return scene; },
  get sunMesh() { return sunMesh; },
  get planetMeshes() { return planetMeshes; },
  get bodyPositions() { return state.bodyPositions; },
  get transferMarkers() { return transferMarkers; },
  // transferLine is recreated each compute. ES module bindings are live, so
  // re-reading the namespace import returns the current value.
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
  getSunBarycentricOffset,
  getBodyPosition3D,
};

animate();
