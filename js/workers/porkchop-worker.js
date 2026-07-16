// Module worker for progressive porkchop sweeps.
// Main posts only catalog ids + gridSpec; bodies resolved via findById.

import { findById } from '../data/catalog.js';
import { fillGridRow } from '../physics/porkchop-grid.js';

/** @type {number | null} */
let activeRequestId = null;
/** @type {Set<number>} */
const cancelled = new Set();

function isCancelled(requestId) {
  return cancelled.has(requestId) || activeRequestId !== requestId;
}

function clearRequest(requestId) {
  cancelled.delete(requestId);
  if (activeRequestId === requestId) activeRequestId = null;
}

/**
 * Yield so cancel messages can be processed between rows.
 */
function yieldTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function runSweep(msg) {
  const { requestId, body1Id, body2Id, gridSpec } = msg;
  activeRequestId = requestId;
  cancelled.delete(requestId);

  const body1 = findById(body1Id);
  const body2 = findById(body2Id);
  if (!body1 || !body2) {
    const missing = [!body1 && body1Id, !body2 && body2Id].filter(Boolean).join(', ');
    self.postMessage({
      type: 'error',
      requestId,
      message: `Unknown body id(s): ${missing}`,
    });
    clearRequest(requestId);
    return;
  }

  const { nx, ny } = gridSpec;
  const data = new Float64Array(nx * ny);
  const c3 = new Float64Array(nx * ny);
  const vinf = new Float64Array(nx * ny);

  let minDv = Infinity, maxDv = -Infinity;
  let minC3 = Infinity, maxC3 = -Infinity;
  let minVI = Infinity, maxVI = -Infinity;
  let minCell = null;

  for (let iy = 0; iy < ny; iy++) {
    if (isCancelled(requestId)) {
      self.postMessage({ type: 'cancelled', requestId });
      clearRequest(requestId);
      return;
    }

    const row = fillGridRow(body1, body2, gridSpec, iy, data, c3, vinf);

    if (row.minIx >= 0 && row.minDv < minDv) {
      minDv = row.minDv;
      minCell = { ix: row.minIx, iy };
    }
    if (row.maxDv > maxDv) maxDv = row.maxDv;
    if (row.minC3 < minC3) minC3 = row.minC3;
    if (row.maxC3 > maxC3) maxC3 = row.maxC3;
    if (row.minVI < minVI) minVI = row.minVI;
    if (row.maxVI > maxVI) maxVI = row.maxVI;

    const dvRow = new Float64Array(nx);
    const c3Row = new Float64Array(nx);
    const vinfRow = new Float64Array(nx);
    for (let ix = 0; ix < nx; ix++) {
      const idx = iy * nx + ix;
      dvRow[ix] = data[idx];
      c3Row[ix] = c3[idx];
      vinfRow[ix] = vinf[idx];
    }

    // Transfer buffers to avoid structured-clone cost on progressive rows.
    self.postMessage(
      {
        type: 'row',
        requestId,
        iy,
        dv: dvRow,
        c3: c3Row,
        vinf: vinfRow,
      },
      [dvRow.buffer, c3Row.buffer, vinfRow.buffer],
    );

    await yieldTick();
  }

  if (isCancelled(requestId)) {
    self.postMessage({ type: 'cancelled', requestId });
    clearRequest(requestId);
    return;
  }

  self.postMessage({
    type: 'done',
    requestId,
    minCell,
    stats: {
      dvMin: minDv,
      dvMax: maxDv,
      c3Min: minC3,
      c3Max: maxC3,
      vinfMin: minVI,
      vinfMax: maxVI,
    },
  });
  clearRequest(requestId);
}

self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'cancel') {
    cancelled.add(msg.requestId);
    return;
  }

  if (msg.type === 'sweep') {
    // Cancel any in-flight sweep when a new one starts.
    if (activeRequestId != null && activeRequestId !== msg.requestId) {
      cancelled.add(activeRequestId);
    }
    runSweep(msg).catch((err) => {
      self.postMessage({
        type: 'error',
        requestId: msg.requestId,
        message: err?.message || String(err),
      });
      clearRequest(msg.requestId);
    });
  }
};
