import { AU, DAY, G_CONST, PI, TWO_PI } from '../constants.js';
import { SUN_DATA } from '../data/bodies.js';
import { state } from '../state.js';
import { getBodyPosition3D, getBodyVelocity3D, hohmannTransfer } from '../physics/kepler.js';
import { solveLambertBestBranch } from '../physics/lambert.js';
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

  function repaintAll() {
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!pcState) return;
    const { data, dvMin, dvMax } = pcState;
    for (let iy = 0; iy < GRID_Y; iy++) {
      for (let ix = 0; ix < GRID_X; ix++) {
        const dv = data[iy * GRID_X + ix];
        if (!isFinite(dv)) {
          paintCell(ix, iy, 'rgba(30,30,36,0.6)');
        } else {
          const [r,g,b] = dvColor((dv - dvMin) / (dvMax - dvMin));
          paintCell(ix, iy, `rgb(${r},${g},${b})`);
        }
      }
    }
    if (pcState.minCell) drawCross(pcState.minCell.ix, pcState.minCell.iy, '#ffffff', 10);
    if (pcState.selectedCell) drawCross(pcState.selectedCell.ix, pcState.selectedCell.iy, '#00d4ff', 12);
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

  function synodicPeriod(b1, b2) {
    const n1 = TWO_PI / b1.period, n2 = TWO_PI / b2.period;
    const dn = Math.abs(n1 - n2);
    return dn > 1e-20 ? TWO_PI / dn : b1.period;
  }

  function beginSweep(body1, body2, departStart) {
    const mu = G_CONST * SUN_DATA.mass;
    const aT = (body1.a + body2.a) * AU / 2;
    const hohmannTof = PI * Math.sqrt(aT*aT*aT / mu);
    const synodic = synodicPeriod(body1, body2);
    const departSpan = Math.max(2 * 365.25 * DAY, Math.min(3 * synodic, 10 * 365.25 * DAY));
    const departEnd = departStart + departSpan;
    const tofMin = Math.max(10 * DAY, 0.35 * hohmannTof);
    const tofMax = 2.2 * hohmannTof;
    const data = new Float64Array(GRID_X * GRID_Y);

    pcState = {
      body1, body2, departStart, departEnd, tofMin, tofMax,
      data, dvMin: Infinity, dvMax: -Infinity,
      hohmannTof, minCell: null, selectedCell: null,
    };
    renderAxes(pcState);
    routeLabel.innerHTML = `${body1.name.toUpperCase()} &rarr; ${body2.name.toUpperCase()} &middot; ${fmt(simTimeToDate(departStart))} + ${(departSpan / (365.25 * DAY)).toFixed(1)}yr`;
    repaintAll();
    progressFill.style.width = '0%';
    applyBtn.disabled = true;
    document.getElementById('pc-depart').textContent = '—';
    document.getElementById('pc-transit').textContent = '—';
    document.getElementById('pc-arrive').textContent = '—';
    document.getElementById('pc-dv').textContent = '—';

    running = true;
    let iy = 0, ix = 0;
    let minDv = Infinity, minIdx = null, maxDv = -Infinity;
    function step() {
      if (!running) return;
      const endTime = performance.now() + 14;
      while (performance.now() < endTime && iy < GRID_Y) {
        const tof = tofMin + ((iy + 0.5) / GRID_Y) * (tofMax - tofMin);
        const dep = departStart + ((ix + 0.5) / GRID_X) * (departEnd - departStart);
        const d = getBodyPosition3D(body1, dep, false);
        const a = getBodyPosition3D(body2, dep + tof, false);
        const r1v = [d.x*AU, d.y*AU, d.z*AU];
        const r2v = [a.x*AU, a.y*AU, a.z*AU];
        const vb1 = getBodyVelocity3D(body1, dep, false);
        const vb2 = getBodyVelocity3D(body2, dep + tof, false);
        const best = solveLambertBestBranch(r1v, r2v, tof, mu, vb1, vb2);
        let dv = NaN;
        if (best) {
          dv = best.cost;
          if (dv < minDv) { minDv = dv; minIdx = { ix, iy }; }
          if (dv > maxDv) maxDv = dv;
        }
        data[iy * GRID_X + ix] = dv;
        ix++;
        if (ix >= GRID_X) { ix = 0; iy++; }
      }
      if (minDv < Infinity) {
        pcState.dvMin = minDv;
        pcState.dvMax = Math.min(maxDv, 3 * minDv);
      }
      pcState.minCell = minIdx;
      repaintAll();
      progressFill.style.width = (100 * iy / GRID_Y).toFixed(1) + '%';
      document.getElementById('pc-scale-min').textContent = isFinite(pcState.dvMin) ? (pcState.dvMin/1000).toFixed(1) + ' km/s' : '—';
      document.getElementById('pc-scale-max').textContent = isFinite(pcState.dvMax) ? '≥ ' + (pcState.dvMax/1000).toFixed(1) + ' km/s' : '—';
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
    const dep = pcState.departStart + ((ix + 0.5) / GRID_X) * (pcState.departEnd - pcState.departStart);
    const tof = pcState.tofMin + ((iy + 0.5) / GRID_Y) * (pcState.tofMax - pcState.tofMin);
    const dv = pcState.data[iy * GRID_X + ix];
    return { dep, tof, dv };
  }

  function showSelection(cell) {
    const { dep, tof, dv } = cellInfo(cell.ix, cell.iy);
    document.getElementById('pc-depart').textContent = fmt(simTimeToDate(dep));
    document.getElementById('pc-transit').textContent = (tof / DAY).toFixed(0) + ' days';
    document.getElementById('pc-arrive').textContent  = fmt(simTimeToDate(dep + tof));
    document.getElementById('pc-dv').textContent = isFinite(dv) ? (dv / 1000).toFixed(2) + ' km/s' : 'no solution';
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

    state.transferData = hohmannTransfer(pcState.body1, pcState.body2, dep);
    state.transferData.transferTime = tof;
    state.transferData.arrivalSimTime = dep + tof;
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('visible')) {
      running = false;
      overlay.classList.remove('visible');
    }
  });
}
