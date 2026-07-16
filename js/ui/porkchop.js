import { DAY } from '../constants.js';
import { bodyId, findById } from '../data/catalog.js';
import { state } from '../state.js';
import { hohmannTransfer } from '../physics/kepler.js';
import {
  cellTimes, defaultGridSpec, fillGridRow, refineGridSpec,
} from '../physics/porkchop-grid.js';
import { solveTransferOrbit } from '../physics/routing.js';
import { dateToInputValue, notify, simTimeToDate } from './format.js';
import { renderRouteUI, updateTransferOrbitVisual } from './route-display.js';
import { timeState } from './time-system.js';

const REFINE_N = 40;
// Allow refine min to be slightly worse than coarse only by numerical noise.
const REFINE_DV_NOISE = 1e-3; // m/s

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

  // Worker state: module Worker preferred; main-thread rAF fallback on failure.
  let worker = null;
  let workerReady = false;
  let requestSeq = 0;
  let activeRequestId = 0;

  function tryCreateWorker() {
    if (typeof Worker === 'undefined') return false;
    try {
      const w = new Worker(
        new URL('../workers/porkchop-worker.js', import.meta.url),
        { type: 'module' },
      );
      w.onerror = () => {
        // Module workers may fail under file:// or bad MIME — fall back.
        workerReady = false;
        try { w.terminate(); } catch (_) { /* ignore */ }
        if (worker === w) worker = null;
      };
      worker = w;
      workerReady = true;
      return true;
    } catch (_) {
      worker = null;
      workerReady = false;
      return false;
    }
  }
  tryCreateWorker();

  function cancelActiveSweep() {
    if (activeRequestId && worker && workerReady) {
      try {
        worker.postMessage({ type: 'cancel', requestId: activeRequestId });
      } catch (_) { /* ignore */ }
    }
    activeRequestId = 0;
    running = false;
  }

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

  function applyRowStats(row, acc) {
    if (row.minIx >= 0 && row.minDv < acc.minDv) {
      acc.minDv = row.minDv;
      acc.minIdx = { ix: row.minIx, iy: row.iy };
    }
    if (row.maxDv > acc.maxDv) acc.maxDv = row.maxDv;
    if (row.minC3 < acc.minC3) acc.minC3 = row.minC3;
    if (row.maxC3 > acc.maxC3) acc.maxC3 = row.maxC3;
    if (row.minVI < acc.minVI) acc.minVI = row.minVI;
    if (row.maxVI > acc.maxVI) acc.maxVI = row.maxVI;
  }

  function pushStatsToState(acc) {
    if (acc.minDv < Infinity) {
      pcState.dvMin = acc.minDv;
      pcState.dvMax = Math.min(acc.maxDv, 3 * acc.minDv);
      pcState.c3Min = acc.minC3;
      pcState.c3Max = Math.min(acc.maxC3, 3 * acc.minC3);
      pcState.vinfMin = acc.minVI;
      pcState.vinfMax = Math.min(acc.maxVI, 3 * acc.minVI);
    }
    pcState.minCell = acc.minIdx;
  }

  /**
   * Progressive grid fill on the main thread (rAF slices). Used as fallback
   * when module Workers are unavailable, and for refine neighborhoods.
   */
  function fillGridMainThread(body1, body2, gridSpec, data, c3, vinf, opts = {}) {
    const { ny } = gridSpec;
    const onProgress = opts.onProgress || null;
    const requestId = opts.requestId;
    return new Promise((resolve) => {
      let iy = 0;
      const acc = {
        minDv: Infinity, maxDv: -Infinity,
        minC3: Infinity, maxC3: -Infinity,
        minVI: Infinity, maxVI: -Infinity,
        minIdx: null,
      };
      function step() {
        if (requestId != null && requestId !== activeRequestId) {
          resolve(null);
          return;
        }
        if (!running && opts.requireRunning) {
          resolve(null);
          return;
        }
        const endTime = performance.now() + 14;
        while (performance.now() < endTime && iy < ny) {
          const row = fillGridRow(body1, body2, gridSpec, iy, data, c3, vinf);
          applyRowStats(row, acc);
          iy++;
        }
        if (onProgress) onProgress(iy, ny, acc);
        if (iy < ny) requestAnimationFrame(step);
        else resolve(acc);
      }
      requestAnimationFrame(step);
    });
  }

  /**
   * Run a sweep via module Worker. Progressive row messages fill `data`/`c3`/`vinf`.
   * Returns acc or null if cancelled / stale / error.
   */
  function fillGridWorker(body1Id, body2Id, gridSpec, data, c3, vinf, opts = {}) {
    const { nx, ny } = gridSpec;
    const requestId = opts.requestId;
    const onProgress = opts.onProgress || null;

    return new Promise((resolve) => {
      if (!worker || !workerReady) {
        resolve(null);
        return;
      }

      const acc = {
        minDv: Infinity, maxDv: -Infinity,
        minC3: Infinity, maxC3: -Infinity,
        minVI: Infinity, maxVI: -Infinity,
        minIdx: null,
      };
      let finished = false;

      function cleanup() {
        if (finished) return;
        finished = true;
        worker.removeEventListener('message', onMsg);
        worker.removeEventListener('error', onErr);
      }

      function onErr() {
        cleanup();
        workerReady = false;
        resolve(null);
      }

      function onMsg(ev) {
        const msg = ev.data;
        // Ignore other requests and abandoned sweeps (cancel bumps activeRequestId).
        if (!msg || msg.requestId !== requestId) return;
        if (requestId !== activeRequestId) {
          if (msg.type === 'done' || msg.type === 'cancelled' || msg.type === 'error') {
            cleanup();
            resolve(null);
          }
          return;
        }

        if (msg.type === 'row') {
          const iy = msg.iy;
          let rowMinDv = Infinity, rowMinIx = -1;
          let rowMaxDv = -Infinity;
          let rowMinC3 = Infinity, rowMaxC3 = -Infinity;
          let rowMinVI = Infinity, rowMaxVI = -Infinity;
          for (let ix = 0; ix < nx; ix++) {
            const idx = iy * nx + ix;
            const dv = msg.dv[ix];
            const c3v = msg.c3[ix];
            const vi = msg.vinf[ix];
            data[idx] = dv;
            c3[idx] = c3v;
            vinf[idx] = vi;
            if (isFinite(dv)) {
              if (dv < rowMinDv) { rowMinDv = dv; rowMinIx = ix; }
              if (dv > rowMaxDv) rowMaxDv = dv;
            }
            if (isFinite(c3v)) {
              if (c3v < rowMinC3) rowMinC3 = c3v;
              if (c3v > rowMaxC3) rowMaxC3 = c3v;
            }
            if (isFinite(vi)) {
              if (vi < rowMinVI) rowMinVI = vi;
              if (vi > rowMaxVI) rowMaxVI = vi;
            }
          }
          applyRowStats({
            minDv: rowMinDv, maxDv: rowMaxDv, minIx: rowMinIx, iy,
            minC3: rowMinC3, maxC3: rowMaxC3,
            minVI: rowMinVI, maxVI: rowMaxVI,
          }, acc);
          if (onProgress) onProgress(iy + 1, ny, acc);
          return;
        }

        if (msg.type === 'done') {
          cleanup();
          if (msg.minCell) acc.minIdx = msg.minCell;
          if (msg.stats) {
            if (msg.stats.dvMin < acc.minDv) acc.minDv = msg.stats.dvMin;
            if (msg.stats.dvMax > acc.maxDv) acc.maxDv = msg.stats.dvMax;
            if (msg.stats.c3Min < acc.minC3) acc.minC3 = msg.stats.c3Min;
            if (msg.stats.c3Max > acc.maxC3) acc.maxC3 = msg.stats.c3Max;
            if (msg.stats.vinfMin < acc.minVI) acc.minVI = msg.stats.vinfMin;
            if (msg.stats.vinfMax > acc.maxVI) acc.maxVI = msg.stats.vinfMax;
          }
          resolve(acc);
          return;
        }

        if (msg.type === 'cancelled') {
          cleanup();
          resolve(null);
          return;
        }

        if (msg.type === 'error') {
          cleanup();
          console.warn('[porkchop-worker]', msg.message);
          resolve(null);
        }
      }

      worker.addEventListener('message', onMsg);
      worker.addEventListener('error', onErr);
      try {
        worker.postMessage({
          type: 'sweep',
          requestId,
          body1Id,
          body2Id,
          gridSpec: {
            departStart: gridSpec.departStart,
            departEnd: gridSpec.departEnd,
            tofMin: gridSpec.tofMin,
            tofMax: gridSpec.tofMax,
            nx: gridSpec.nx,
            ny: gridSpec.ny,
          },
        });
      } catch (err) {
        cleanup();
        workerReady = false;
        resolve(null);
      }
    });
  }

  async function runGridFill(body1, body2, body1Id, body2Id, gridSpec, data, c3, vinf, opts) {
    if (workerReady && worker) {
      const acc = await fillGridWorker(body1Id, body2Id, gridSpec, data, c3, vinf, opts);
      if (acc) return acc;
      // Worker failed mid-flight or unavailable — fall through to main thread
      // only if this request is still active.
      if (opts.requestId != null && opts.requestId !== activeRequestId) return null;
    }
    return fillGridMainThread(body1, body2, gridSpec, data, c3, vinf, {
      ...opts,
      requireRunning: true,
    });
  }

  /**
   * Dense 40×40 neighborhood at ¼ coarse cell spacing around (ix, iy).
   * Updates selectedCell with refined dep/tof/metrics when refine improves
   * or matches coarse within numerical noise.
   */
  async function refineAroundSelection(ix, iy, requestId) {
    if (!pcState || requestId !== activeRequestId) return;
    const body1 = pcState.body1;
    const body2 = pcState.body2;
    const body1Id = pcState.body1Id;
    const body2Id = pcState.body2Id;
    const coarseInfo = cellInfo(ix, iy);
    if (!isFinite(coarseInfo.dv)) return;

    const rSpec = refineGridSpec(pcState.gridSpec, ix, iy, REFINE_N);
    const rn = REFINE_N;
    const data = new Float64Array(rn * rn);
    const c3 = new Float64Array(rn * rn);
    const vinf = new Float64Array(rn * rn);

    // Prefer main-thread for small refine (avoids cancel races with worker).
    const acc = await fillGridMainThread(body1, body2, rSpec, data, c3, vinf, {
      requestId,
      requireRunning: false,
    });

    if (!acc || requestId !== activeRequestId || !pcState) return;

    let best = {
      dep: coarseInfo.dep,
      tof: coarseInfo.tof,
      dv: coarseInfo.dv,
      c3: coarseInfo.c3,
      vinf: coarseInfo.vinf,
      refined: false,
    };

    if (acc.minIdx && acc.minDv <= coarseInfo.dv + REFINE_DV_NOISE) {
      const { dep, tof } = cellTimes(rSpec, acc.minIdx.ix, acc.minIdx.iy);
      const idx = acc.minIdx.iy * rn + acc.minIdx.ix;
      best = {
        dep,
        tof,
        dv: data[idx],
        c3: c3[idx],
        vinf: vinf[idx],
        refined: true,
      };
    }

    // Ensure refine never reports worse than coarse beyond noise: clamp to coarse if needed.
    if (!(best.dv <= coarseInfo.dv + REFINE_DV_NOISE)) {
      best = {
        dep: coarseInfo.dep,
        tof: coarseInfo.tof,
        dv: coarseInfo.dv,
        c3: coarseInfo.c3,
        vinf: coarseInfo.vinf,
        refined: false,
      };
    }

    const sel = { ix, iy, ...best };
    pcState.selectedCell = sel;
    if (pcState.minCell && pcState.minCell.ix === ix && pcState.minCell.iy === iy) {
      pcState.minCell = { ...pcState.minCell, ...best };
    }
    showSelection(sel);
    applyBtn.disabled = false;
    repaintAll();
  }

  async function beginSweep(originBody, destBody, departStart) {
    cancelActiveSweep();

    const body1Id = bodyId(originBody);
    const body2Id = bodyId(destBody);
    // Resolve via catalog for worker/fallback consistency; fall back to passed objects.
    const body1 = findById(body1Id) || originBody;
    const body2 = findById(body2Id) || destBody;
    if (!body1Id || !body2Id) {
      notify('UNKNOWN ORIGIN OR DESTINATION ID');
      return;
    }

    const requestId = ++requestSeq;
    activeRequestId = requestId;
    running = true;

    const gridSpec = defaultGridSpec(body1, body2, departStart, GRID_X, GRID_Y);
    const data = new Float64Array(GRID_X * GRID_Y);
    const c3   = new Float64Array(GRID_X * GRID_Y);
    const vinf = new Float64Array(GRID_X * GRID_Y);

    pcState = {
      body1, body2,
      body1Id, body2Id,
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

    const acc = await runGridFill(body1, body2, body1Id, body2Id, gridSpec, data, c3, vinf, {
      requestId,
      onProgress: (iyDone, ny, a) => {
        if (requestId !== activeRequestId || !pcState) return;
        pushStatsToState(a);
        repaintAll();
        updateLegend();
        progressFill.style.width = (100 * iyDone / ny).toFixed(1) + '%';
      },
    });

    if (requestId !== activeRequestId || !pcState) return;

    if (!acc) {
      // Stale cancel or hard failure after fallback also failed.
      running = false;
      return;
    }

    pushStatsToState(acc);
    progressFill.style.width = '100%';
    running = false;

    if (acc.minIdx) {
      pcState.selectedCell = { ...acc.minIdx };
      showSelection(pcState.selectedCell);
      applyBtn.disabled = false;
      repaintAll();
      updateLegend();
      // Refine neighborhood around coarse global minimum.
      await refineAroundSelection(acc.minIdx.ix, acc.minIdx.iy, requestId);
    } else {
      repaintAll();
      updateLegend();
    }
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
    // Prefer refined times stored on selectedCell / minCell for that coarse index.
    const sel = pcState.selectedCell;
    if (sel && sel.ix === ix && sel.iy === iy && sel.dep != null && isFinite(sel.dv)) {
      return { dep: sel.dep, tof: sel.tof, dv: sel.dv, c3: sel.c3, vinf: sel.vinf };
    }
    const { dep, tof } = cellTimes(pcState.gridSpec, ix, iy);
    const dv  = pcState.data[iy * GRID_X + ix];
    const c3v = pcState.c3[iy   * GRID_X + ix];
    const vi  = pcState.vinf[iy * GRID_X + ix];
    return { dep, tof, dv, c3: c3v, vinf: vi };
  }

  function showSelection(cell) {
    const info = (cell.dep != null && isFinite(cell.dv))
      ? { dep: cell.dep, tof: cell.tof, dv: cell.dv, c3: cell.c3, vinf: cell.vinf }
      : cellInfo(cell.ix, cell.iy);
    const { dep, tof, dv, c3: c3v, vinf: vi } = info;
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
    if (!pcState || running) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    const { dv } = cellInfo(c.ix, c.iy);
    if (!isFinite(dv)) { notify('NO LAMBERT SOLUTION AT THIS CELL'); return; }
    pcState.selectedCell = { ...c };
    showSelection(c);
    applyBtn.disabled = false;
    repaintAll();
    // Bump request id so an in-flight refine for another cell is abandoned.
    const rid = ++requestSeq;
    activeRequestId = rid;
    refineAroundSelection(c.ix, c.iy, rid);
  });

  document.getElementById('pc-close').onclick = () => {
    cancelActiveSweep();
    overlay.classList.remove('visible');
  };
  applyBtn.onclick = () => {
    if (!pcState || !pcState.selectedCell) return;
    const sel = pcState.selectedCell;
    const info = (sel.dep != null && isFinite(sel.dv))
      ? sel
      : cellInfo(sel.ix, sel.iy);
    const { dep, tof } = info;

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
    cancelActiveSweep();
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
      cancelActiveSweep();
      overlay.classList.remove('visible');
    }
  });
}
