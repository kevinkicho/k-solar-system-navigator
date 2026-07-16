import { DAY } from '../constants.js';
import { state } from '../state.js';
import { hohmannTransfer } from '../physics/kepler.js';
import {
  cellTimes, defaultGridSpec, fillGridRow,
} from '../physics/porkchop-grid.js';
import { solveTransferOrbit } from '../physics/routing.js';
import { dateToInputValue, notify, simTimeToDate } from './format.js';
import { renderRouteUI, updateTransferOrbitVisual } from './route-display.js';
import { timeState } from './time-system.js';

export function wirePorkchop() {
  const GRID_X = 65;
  const GRID_Y = 52;
  const canvas = document.getElementById('porkchop-canvas');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('porkchop-overlay');
  const progressFill = document.getElementById('pc-progress-fill');
  const applyBtn = document.getElementById('pc-apply');
  const routeLabel = document.getElementById('pc-route-label');
  const xaxisEl = document.getElementById('pc-xaxis');
  const yaxisEl = document.getElementById('pc-yaxis');
  const fmt = d => d.toISOString().slice(0,10);

  let pcState = null;
  let running = false;
  // Active heatmap metric: 'dv' (total Δv), 'c3' (departure energy), or 'vinf' (arrival V∞).
  let metric = 'dv';

  function dvColor(t) {
    t = Math.max(0, Math.min(1, t));
    const stops = [
      [0.00,   0, 230, 118],
      [0.20, 155, 210,   0],
      [0.40, 255, 210,   0],
      [0.60, 255, 152,   0],
      [0.80, 255,  90,  60],
      [1.00, 255,  45,  85],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t <= stops[i+1][0]) {
        const f = (t - stops[i][0]) / (stops[i+1][0] - stops[i][0]);
        const a = stops[i], b = stops[i+1];
        return [(a[1]+(b[1]-a[1])*f)|0, (a[2]+(b[2]-a[2])*f)|0, (a[3]+(b[3]-a[3])*f)|0];
      }
    }
    return [255, 45, 85];
  }

  function paintCell(ix, iy, color) {
    const cw = canvas.width / GRID_X;
    const ch = canvas.height / GRID_Y;
    const px = Math.floor(ix * cw);
    const py = canvas.height - Math.floor((iy + 1) * ch);
    const pw = Math.ceil(cw) + 1;
    const ph = Math.ceil(ch) + 1;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, pw, ph);
  }

  function drawCross(ix, iy, color, size) {
    const cw = canvas.width / GRID_X;
    const ch = canvas.height / GRID_Y;
    const cx = ix * cw + cw / 2;
    const cy = canvas.height - (iy + 0.5) * ch;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - size, cy); ctx.lineTo(cx + size, cy);
    ctx.moveTo(cx, cy - size); ctx.lineTo(cx, cy + size);
    ctx.stroke();
  }

  // Pull the storage array + min/max for the currently-active metric.
  function activeArray() {
    if (!pcState) return null;
    if (metric === 'c3')   return { arr: pcState.c3,   lo: pcState.c3Min,   hi: pcState.c3Max };
    if (metric === 'vinf') return { arr: pcState.vinf, lo: pcState.vinfMin, hi: pcState.vinfMax };
    return                       { arr: pcState.data, lo: pcState.dvMin,   hi: pcState.dvMax };
  }

  function repaintAll() {
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!pcState) return;
    const a = activeArray();
    if (!a || !isFinite(a.lo) || !isFinite(a.hi) || a.hi === a.lo) {
      // No data yet (pre-sweep) — fill empty cells with the placeholder color.
      for (let iy = 0; iy < GRID_Y; iy++) for (let ix = 0; ix < GRID_X; ix++) {
        paintCell(ix, iy, 'rgba(30,30,36,0.6)');
      }
    } else {
      for (let iy = 0; iy < GRID_Y; iy++) {
        for (let ix = 0; ix < GRID_X; ix++) {
          const v = a.arr[iy * GRID_X + ix];
          if (!isFinite(v)) {
            paintCell(ix, iy, 'rgba(30,30,36,0.6)');
          } else {
            const [r,g,b] = dvColor((v - a.lo) / (a.hi - a.lo));
            paintCell(ix, iy, `rgb(${r},${g},${b})`);
          }
        }
      }
    }
    // Global minimum is always taken from total-Δv (the "USE SELECTED" target).
    if (pcState.minCell) drawCross(pcState.minCell.ix, pcState.minCell.iy, '#ffffff', 10);
    if (pcState.selectedCell) drawCross(pcState.selectedCell.ix, pcState.selectedCell.iy, '#00d4ff', 12);
  }

  function updateLegend() {
    const a = activeArray();
    if (!a || !isFinite(a.lo)) {
      document.getElementById('pc-scale-min').textContent = '—';
      document.getElementById('pc-scale-max').textContent = '—';
      return;
    }
    const fmtMetric = (v) => {
      if (metric === 'c3')   return (v / 1e6).toFixed(1) + ' km²/s²';   // C3 in km²/s²
      return (v / 1000).toFixed(1) + ' km/s';                            // dv & vinf
    };
    document.getElementById('pc-scale-min').textContent = fmtMetric(a.lo);
    document.getElementById('pc-scale-max').textContent = '≥ ' + fmtMetric(a.hi);
  }

  function renderAxes(st) {
    xaxisEl.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const f = i / 5;
      const t = st.departStart + f * (st.departEnd - st.departStart);
      const s = document.createElement('span');
      s.textContent = fmt(simTimeToDate(t));
      xaxisEl.appendChild(s);
    }
    yaxisEl.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const f = i / 4;
      const tof = st.tofMax - f * (st.tofMax - st.tofMin);
      const s = document.createElement('span');
      s.textContent = (tof / DAY).toFixed(0) + 'd';
      yaxisEl.appendChild(s);
    }
  }

  function beginSweep(body1, body2, departStart) {
    const gridSpec = defaultGridSpec(body1, body2, departStart, GRID_X, GRID_Y);
    const data = new Float64Array(GRID_X * GRID_Y);
    const c3   = new Float64Array(GRID_X * GRID_Y);
    const vinf = new Float64Array(GRID_X * GRID_Y);

    pcState = {
      body1, body2,
      departStart: gridSpec.departStart,
      departEnd: gridSpec.departEnd,
      tofMin: gridSpec.tofMin,
      tofMax: gridSpec.tofMax,
      gridSpec,
      data, c3, vinf,
      dvMin:   Infinity, dvMax:   -Infinity,
      c3Min:   Infinity, c3Max:   -Infinity,
      vinfMin: Infinity, vinfMax: -Infinity,
      hohmannTof: gridSpec.hohmannTof, minCell: null, selectedCell: null,
    };
    renderAxes(pcState);
    routeLabel.innerHTML = `${body1.name.toUpperCase()} &rarr; ${body2.name.toUpperCase()} &middot; ${fmt(simTimeToDate(departStart))} + ${(gridSpec.departSpan / (365.25 * DAY)).toFixed(1)}yr`;
    repaintAll();
    progressFill.style.width = '0%';
    applyBtn.disabled = true;
    document.getElementById('pc-depart').textContent = '—';
    document.getElementById('pc-transit').textContent = '—';
    document.getElementById('pc-arrive').textContent = '—';
    document.getElementById('pc-dv').textContent = '—';
    document.getElementById('pc-c3').textContent = '—';
    document.getElementById('pc-vinf').textContent = '—';

    running = true;
    let iy = 0;
    let minDv = Infinity, minIdx = null, maxDv = -Infinity;
    let minC3 = Infinity, maxC3 = -Infinity;
    let minVI = Infinity, maxVI = -Infinity;
    function step() {
      if (!running) return;
      const endTime = performance.now() + 14;
      while (performance.now() < endTime && iy < GRID_Y) {
        const row = fillGridRow(body1, body2, gridSpec, iy, data, c3, vinf);
        if (row.minIx >= 0 && row.minDv < minDv) {
          minDv = row.minDv;
          minIdx = { ix: row.minIx, iy };
        }
        if (row.maxDv > maxDv) maxDv = row.maxDv;
        if (row.minC3 < minC3) minC3 = row.minC3;
        if (row.maxC3 > maxC3) maxC3 = row.maxC3;
        if (row.minVI < minVI) minVI = row.minVI;
        if (row.maxVI > maxVI) maxVI = row.maxVI;
        iy++;
      }
      if (minDv < Infinity) {
        pcState.dvMin = minDv;     pcState.dvMax = Math.min(maxDv, 3 * minDv);
        pcState.c3Min = minC3;     pcState.c3Max = Math.min(maxC3, 3 * minC3);
        pcState.vinfMin = minVI;   pcState.vinfMax = Math.min(maxVI, 3 * minVI);
      }
      pcState.minCell = minIdx;
      repaintAll();
      updateLegend();
      progressFill.style.width = (100 * iy / GRID_Y).toFixed(1) + '%';
      if (iy < GRID_Y) requestAnimationFrame(step);
      else {
        running = false;
        progressFill.style.width = '100%';
        if (minIdx) {
          pcState.selectedCell = minIdx;
          showSelection(minIdx);
          applyBtn.disabled = false;
        }
        repaintAll();
      }
    }
    requestAnimationFrame(step);
  }

  function cellAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cx = (clientX - rect.left) / rect.width;
    const cy = 1 - (clientY - rect.top) / rect.height;
    if (cx < 0 || cx > 1 || cy < 0 || cy > 1) return null;
    const ix = Math.max(0, Math.min(GRID_X - 1, Math.floor(cx * GRID_X)));
    const iy = Math.max(0, Math.min(GRID_Y - 1, Math.floor(cy * GRID_Y)));
    return { ix, iy };
  }

  function cellInfo(ix, iy) {
    const { dep, tof } = cellTimes(pcState.gridSpec, ix, iy);
    const dv  = pcState.data[iy * GRID_X + ix];
    const c3v = pcState.c3[iy   * GRID_X + ix];
    const vi  = pcState.vinf[iy * GRID_X + ix];
    return { dep, tof, dv, c3: c3v, vinf: vi };
  }

  function showSelection(cell) {
    const { dep, tof, dv, c3: c3v, vinf: vi } = cellInfo(cell.ix, cell.iy);
    document.getElementById('pc-depart').textContent = fmt(simTimeToDate(dep));
    document.getElementById('pc-transit').textContent = (tof / DAY).toFixed(0) + ' days';
    document.getElementById('pc-arrive').textContent  = fmt(simTimeToDate(dep + tof));
    document.getElementById('pc-dv').textContent   = isFinite(dv)  ? (dv  / 1000).toFixed(2) + ' km/s'  : '—';
    document.getElementById('pc-c3').textContent   = isFinite(c3v) ? (c3v / 1e6 ).toFixed(1) + ' km²/s²' : '—';
    document.getElementById('pc-vinf').textContent = isFinite(vi)  ? (vi  / 1000).toFixed(2) + ' km/s'  : '—';
  }

  canvas.addEventListener('mousemove', (e) => {
    if (!pcState) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    showSelection(c);
  });
  canvas.addEventListener('mouseleave', () => {
    if (!pcState || !pcState.selectedCell) return;
    showSelection(pcState.selectedCell);
  });
  canvas.addEventListener('click', (e) => {
    if (!pcState) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    const { dv } = cellInfo(c.ix, c.iy);
    if (!isFinite(dv)) { notify('NO LAMBERT SOLUTION AT THIS CELL'); return; }
    pcState.selectedCell = c;
    showSelection(c);
    applyBtn.disabled = false;
    repaintAll();
  });

  document.getElementById('pc-close').onclick = () => {
    running = false;
    overlay.classList.remove('visible');
  };
  applyBtn.onclick = () => {
    if (!pcState || !pcState.selectedCell) return;
    const { dep, tof } = cellInfo(pcState.selectedCell.ix, pcState.selectedCell.iy);

    document.getElementById('depart-date').value = dateToInputValue(simTimeToDate(dep));
    timeState.simTime = dep;
    timeState.setSpeed(3);
    timeState.updateDisplay();

    state.userTofDays = tof / DAY;
    state.transferData = hohmannTransfer(pcState.body1, pcState.body2, dep);
    state.transferData.transferTime = tof;
    state.transferData.arrivalSimTime = dep + tof;
    state.transferData.departureSimTime = dep;
    solveTransferOrbit(state.transferData);
    state.showTransferOrbit = true;
    updateTransferOrbitVisual();

    overlay.classList.remove('visible');
    running = false;
    renderRouteUI();
    notify('LAUNCH WINDOW APPLIED');
  };

  document.getElementById('find-windows').onclick = () => {
    if (!state.routeOrigin || !state.routeDestination) {
      notify('SET ORIGIN AND DESTINATION FIRST'); return;
    }
    overlay.classList.add('visible');
    beginSweep(state.routeOrigin, state.routeDestination, timeState.simTime);
  };

  // Metric toggle buttons (Δv / C3 / V∞ arrive).
  for (const btn of document.querySelectorAll('.pc-metric-btn')) {
    btn.addEventListener('click', () => {
      metric = btn.dataset.metric;
      for (const b of document.querySelectorAll('.pc-metric-btn')) {
        b.classList.toggle('active', b === btn);
      }
      repaintAll();
      updateLegend();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('visible')) {
      running = false;
      overlay.classList.remove('visible');
    }
  });
}
