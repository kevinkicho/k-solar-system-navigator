// Module worker: nearest-feasible window search (~1400 Lamberts).
// Main posts catalog body ids + hints; worker returns best cell or null.

import { findById } from '../data/catalog.js';
import { findNearestFeasibleTransfer } from '../physics/nearest-feasible-search.js';
import { ensureSampleTableLoaded } from '../physics/ephemeris-sample.js';

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

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  if (msg.type === 'cancel' && msg.requestId != null) {
    cancelled.add(msg.requestId);
    return;
  }
  if (msg.type !== 'search') return;

  const {
    requestId,
    body1Id,
    body2Id,
    depHint,
    tofHint,
    backend = 'approx',
    classroomMode = false,
    allowPast = false,
  } = msg;

  activeRequestId = requestId;
  cancelled.delete(requestId);

  const body1 = findById(body1Id);
  const body2 = findById(body2Id);
  if (!body1 || !body2) {
    self.postMessage({
      type: 'error',
      requestId,
      message: `Unknown body id(s): ${[!body1 && body1Id, !body2 && body2Id].filter(Boolean).join(', ')}`,
    });
    clearRequest(requestId);
    return;
  }

  try {
    if (backend === 'sample-de' && !classroomMode) {
      await ensureSampleTableLoaded();
    }
    if (isCancelled(requestId)) {
      self.postMessage({ type: 'cancelled', requestId });
      clearRequest(requestId);
      return;
    }

    const result = findNearestFeasibleTransfer(body1, body2, depHint, tofHint, {
      backend,
      classroomMode,
      allowPast,
      shouldCancel: () => isCancelled(requestId),
      onProgress: ({ i, n }) => {
        if (i === 1 || i === n || i % 5 === 0) {
          self.postMessage({ type: 'progress', requestId, i, n });
        }
      },
    });

    if (isCancelled(requestId)) {
      self.postMessage({ type: 'cancelled', requestId });
    } else {
      self.postMessage({ type: 'done', requestId, result });
    }
  } catch (e) {
    self.postMessage({
      type: 'error',
      requestId,
      message: e?.message || String(e),
    });
  } finally {
    clearRequest(requestId);
  }
};
