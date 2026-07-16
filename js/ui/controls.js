import * as THREE from 'three';
import { DAY, J2000 } from '../constants.js';
import { BODIES } from '../data/bodies.js';
import { state } from '../state.js';
import { setDisplayMode } from '../display-scale.js';
import { generateOrbitPoints, hohmannTransfer } from '../physics/kepler.js';
import { camera3D, controls } from '../scene/setup.js';
import { orbitLines } from '../scene/planets.js';
import { FX, hillMeshes, potentialMesh, updateHillSpheres, updatePotentialField } from '../scene/gravity-field.js';
import { dateToInputValue, inputValueToDate, dateToSimTime, notify, simTimeToDate } from './format.js';
import { addFlyby, computeRoute, clearRoute, snapFlybyDates } from './route-planner.js';
import { renderRouteUI, updateTransferOrbitVisual } from './route-display.js';
import { updateViewBadge } from './share.js';
import { selectBody } from './selection.js';
import { timeState } from './time-system.js';

export function wireControls() {
  document.getElementById('btn-pause').onclick = () => timeState.setSpeed(3);
  document.getElementById('btn-play').onclick = () => timeState.setSpeed(4);
  document.getElementById('btn-rev').onclick = () => timeState.setSpeed(2);
  document.getElementById('btn-fwd-fast').onclick = () => {
    if (timeState.speedIndex <= 4) timeState.setSpeed(5);
    else timeState.setSpeed(Math.min(timeState.speedIndex + 1, 10));
  };
  document.getElementById('btn-rev-fast').onclick = () => {
    if (timeState.speedIndex >= 3) timeState.setSpeed(1);
    else timeState.setSpeed(Math.max(timeState.speedIndex - 1, 0));
  };
  document.getElementById('btn-today').onclick = () => {
    timeState.simTime = (Date.now() - J2000) / 1000;
    timeState.setSpeed(3);
    notify('TIME RESET TO CURRENT DATE');
  };
  document.getElementById('speed-slider').oninput = (e) => timeState.setSpeed(parseInt(e.target.value));

  document.getElementById('view-top').onclick = () => {
    state.followMode = false; camera3D.position.set(0, 20, 0.01); controls.target.set(0, 0, 0);
  };
  document.getElementById('view-side').onclick = () => {
    state.followMode = false; camera3D.position.set(0, 0.5, 20); controls.target.set(0, 0, 0);
  };
  document.getElementById('view-angle').onclick = () => {
    state.followMode = false; camera3D.position.set(8, 8, 12); controls.target.set(0, 0, 0);
  };
  document.getElementById('view-follow').onclick = () => {
    if (state.selectedBody) { state.followMode = true; notify(`FOLLOWING ${state.selectedBody.name.toUpperCase()}`); }
    else notify('SELECT A BODY FIRST');
  };
  document.getElementById('view-reset').onclick = () => {
    state.followMode = false; camera3D.position.set(0, 8, 12); controls.target.set(0, 0, 0);
  };

  document.getElementById('btn-use-sim').onclick = () => {
    document.getElementById('depart-date').value = dateToInputValue(timeState.getDate());
  };
  document.getElementById('btn-use-optimal').onclick = () => {
    if (!state.routeOrigin || !state.routeDestination) {
      notify('SET ORIGIN AND DESTINATION FIRST'); return;
    }
    const tempTransfer = hohmannTransfer(state.routeOrigin, state.routeDestination, timeState.simTime);
    const optimalSimTime = timeState.simTime + tempTransfer.timeToWindow;
    const optimalDate = simTimeToDate(optimalSimTime);
    document.getElementById('depart-date').value = dateToInputValue(optimalDate);
    timeState.simTime = optimalSimTime;
    timeState.setSpeed(3);
    timeState.updateDisplay();
    notify('JUMPED TO OPTIMAL WINDOW');
  };

  document.getElementById('depart-date').addEventListener('change', () => {
    const d = inputValueToDate(document.getElementById('depart-date').value);
    if (d && !isNaN(d.getTime())) {
      timeState.simTime = dateToSimTime(d);
      timeState.setSpeed(3);
      timeState.updateDisplay();
      // The current transferData was solved against the old departure date —
      // re-solve so the dashed line and Δv numbers match the new input.
      // Without this the user can edit the date and see the SAME old route,
      // which is exactly the kind of stale-state confusion that prompted
      // this audit pass.
      if (state.routeOrigin && state.routeDestination && state.transferData) {
        computeRoute();
      } else if (state.transferData) {
        state.transferData = null;
        state.showTransferOrbit = false;
        updateTransferOrbitVisual();
        document.getElementById('transfer-results').innerHTML = '';
        document.getElementById('mission-controls').innerHTML = '';
      }
      notify('SOLAR SYSTEM SET TO DEPARTURE DATE');
    }
  });

  document.getElementById('calc-route').onclick = computeRoute;
  document.getElementById('clear-route').onclick = clearRoute;
  document.getElementById('btn-add-flyby').onclick = addFlyby;
  document.getElementById('btn-snap-flybys').onclick = snapFlybyDates;

  // Vehicle / cost basis / display mode
  const vehSel = document.getElementById('vehicle-select');
  const abRow = document.getElementById('abstract-budget-row');
  const abInput = document.getElementById('abstract-budget');
  const basisSel = document.getElementById('cost-basis-select');
  const dispSel = document.getElementById('display-mode-select');

  function syncVehicleUI() {
    if (vehSel) vehSel.value = state.vehicleId;
    if (abRow) abRow.style.display = state.vehicleId === 'abstract' ? 'flex' : 'none';
    if (abInput) abInput.value = String(state.abstractBudget_m_s);
    if (basisSel) {
      basisSel.value = state.costBasis;
      basisSel.disabled = state.flybys.length > 0;
    }
    if (dispSel) dispSel.value = state.display.mode;
    updateViewBadge();
  }
  syncVehicleUI();

  if (vehSel) vehSel.onchange = () => {
    state.vehicleId = vehSel.value;
    if (abRow) abRow.style.display = state.vehicleId === 'abstract' ? 'flex' : 'none';
    if (state.transferData) renderRouteUI();
  };
  if (abInput) abInput.onchange = () => {
    state.abstractBudget_m_s = Math.max(500, Math.min(50000, Number(abInput.value) || 8000));
    if (state.transferData) renderRouteUI();
  };
  if (basisSel) basisSel.onchange = () => {
    if (state.flybys.length > 0) {
      basisSel.value = 'helio';
      state.costBasis = 'helio';
      notify('MISSION BASIS IS SINGLE-LEG ONLY');
      return;
    }
    state.costBasis = basisSel.value;
    if (state.transferData) renderRouteUI();
  };
  if (dispSel) dispSel.onchange = () => {
    setDisplayMode(dispSel.value);
    // Rebuild planet orbit lines with new inclination scale
    for (const [name, data] of orbitLines) {
      const body = BODIES.find(b => b.name === name);
      if (!body || !data.line) continue;
      const pts = generateOrbitPoints(body, 256).map(p => new THREE.Vector3(p.x, p.y, p.z));
      data.line.geometry.dispose();
      data.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    }
    if (state.showTransferOrbit && state.transferData) {
      if (state.transferData.isMultiLeg) {
        // re-solve visual branch via recompute is heavy; just refresh visual
        updateTransferOrbitVisual();
      } else {
        import('../physics/routing.js').then(({ solveTransferOrbit }) => {
          solveTransferOrbit(state.transferData);
          updateTransferOrbitVisual();
        });
      }
    }
    updateViewBadge();
    notify(dispSel.value === 'schematic'
      ? 'SCHEMATIC VIEW — true incl./wobble; moons still layout-scaled'
      : 'CINEMATIC VIEW — exaggerated inclinations');
  };

  document.getElementById('fx-potential').onclick = (e) => {
    FX.potential = !FX.potential;
    // Reduced-motion: keep the toggle visible but soft-disable heavy rebuilds
    // (FX.allowHeavyFx stays false). Mesh can still show a static last state.
    potentialMesh.visible = FX.potential;
    e.currentTarget.classList.toggle('active', FX.potential);
    if (FX.potential) {
      if (FX.allowHeavyFx) updatePotentialField();
      else notify('POTENTIAL WELL SOFT-DISABLED (reduced motion)');
    }
  };
  document.getElementById('fx-hill').onclick = (e) => {
    FX.hill = !FX.hill;
    for (const { mesh } of hillMeshes.values()) mesh.visible = FX.hill;
    e.currentTarget.classList.toggle('active', FX.hill);
    if (FX.hill) updateHillSpheres();
  };

  // About / methodology modal.
  {
    const overlay = document.getElementById('about-overlay');
    const open  = () => overlay.classList.add('visible');
    const close = () => overlay.classList.remove('visible');
    document.getElementById('btn-about').onclick = open;
    document.getElementById('about-close').onclick = close;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();   // click on backdrop closes
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('visible')) close();
    });
  }

  // Date/time picker overlay.
  {
    const overlay = document.getElementById('date-picker-overlay');
    const pickerInput = document.getElementById('picker-datetime');

    document.getElementById('time-display').onclick = () => {
      timeState.setSpeed(3);
      pickerInput.value = dateToInputValue(timeState.getDate());
      overlay.classList.add('visible');
    };

    function jumpToPickerDate() {
      const d = inputValueToDate(pickerInput.value);
      if (d && !isNaN(d.getTime())) {
        timeState.simTime = dateToSimTime(d);
        timeState.setSpeed(3);
        timeState.updateDisplay();
        notify('JUMPED TO ' + d.toISOString().slice(0, 10));
      }
      overlay.classList.remove('visible');
    }

    document.getElementById('picker-go').onclick = jumpToPickerDate;
    document.getElementById('picker-cancel').onclick = () => overlay.classList.remove('visible');

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('visible')) {
        overlay.classList.remove('visible');
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (overlay.classList.contains('visible') &&
          !overlay.contains(e.target) &&
          e.target.id !== 'time-display') {
        overlay.classList.remove('visible');
      }
    });

    pickerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); jumpToPickerDate(); }
    });

    const presetDates = {
      today:    () => new Date(),
      j2000:    () => new Date(Date.UTC(2000, 0, 1, 12, 0, 0)),
      y2030:    () => new Date(Date.UTC(2030, 0, 1)),
      y2040:    () => new Date(Date.UTC(2040, 0, 1)),
      y2050:    () => new Date(Date.UTC(2050, 0, 1)),
      apollo11: () => new Date(Date.UTC(1969, 6, 16, 13, 32, 0)),
      voyager1: () => new Date(Date.UTC(1977, 8, 5, 12, 56, 0)),
      y1900:    () => new Date(Date.UTC(1900, 0, 1)),
      y2100:    () => new Date(Date.UTC(2100, 0, 1)),
    };
    overlay.querySelectorAll('.preset-btn').forEach(btn => {
      btn.onclick = () => {
        const fn = presetDates[btn.dataset.preset];
        if (fn) pickerInput.value = dateToInputValue(fn());
      };
    });
  }

  // Global keyboard shortcuts.
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        timeState.setSpeed(timeState.timeScale === 0 ? 4 : 3);
        break;
      case '+': case '=': timeState.setSpeed(Math.min(timeState.speedIndex + 1, 10)); break;
      case '-': case '_': timeState.setSpeed(Math.max(timeState.speedIndex - 1, 0)); break;
      case 'Escape': selectBody(null); state.followMode = false; break;
      case 'f': if (state.selectedBody) { state.followMode = true; notify(`FOLLOWING ${state.selectedBody.name.toUpperCase()}`); } break;
    }
  });
}
