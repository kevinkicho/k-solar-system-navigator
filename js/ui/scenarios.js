import { J2000 } from '../constants.js';
import { findByIdOrName } from '../data/catalog.js';
import { SCENARIOS } from '../data/scenarios.js';
import { state } from '../state.js';
import { dateToInputValue, notify } from './format.js';
import {
  computeRoute, renderFlybyList, setRouteDestination, setRouteOrigin,
} from './route-planner.js';
import { timeState } from './time-system.js';

export function wireScenarios() {
  const select = document.getElementById('scenario-select');
  const summary = document.getElementById('scenario-summary');
  if (!select) return;

  // Populate options.
  for (const sc of SCENARIOS) {
    const opt = document.createElement('option');
    opt.value = sc.id;
    opt.textContent = sc.name;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    const id = select.value;
    if (!id) { summary.textContent = ''; return; }
    const sc = SCENARIOS.find(s => s.id === id);
    if (!sc) return;

    summary.textContent = sc.summary;

    const origin = findByIdOrName(sc.origin);
    const dest   = findByIdOrName(sc.destination);
    if (!origin || !dest) {
      notify('SCENARIO ORIGIN/DEST UNKNOWN');
      return;
    }

    // setRouteOrigin clears flybys, so set them after.
    setRouteOrigin(origin);
    setRouteDestination(dest);

    // Departure date.
    const departDate = new Date(sc.departureUTC);
    document.getElementById('depart-date').value = dateToInputValue(departDate);

    // Jump simulation to the departure moment so the planets appear in the
    // configuration the trajectory was designed against.
    timeState.simTime = (sc.departureUTC - J2000) / 1000;
    timeState.setSpeed(3);
    timeState.updateDisplay();

    // Add any flybys (in chronological order).
    state.flybys = sc.flybys.map(f => {
      const b = findByIdOrName(f.bodyName || f.bodyId);
      return {
        bodyId: b?.id || f.bodyId,
        bodyName: b?.name || f.bodyName,
        simTime: (f.dateUTC - J2000) / 1000,
      };
    });
    renderFlybyList();

    // Auto-compute so scenarios are one-click demos.
    try {
      computeRoute();
    } catch (e) {
      console.error(e);
      notify(`SCENARIO LOADED: ${sc.name.toUpperCase()} (compute failed — try SNAP)`);
      return;
    }
    notify(`SCENARIO LOADED + COMPUTED: ${sc.name.toUpperCase()}`);
  });
}
