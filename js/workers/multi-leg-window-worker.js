// Module worker: coarse multi-leg launch-window search.
// Main posts catalog body ids + flyby hints; worker returns best seed or null.

import { findById } from '../data/catalog.js';
// Import routing for bindSolveMultiLegRoute side-effect + findMultiLegWindow export
import { findMultiLegWindow } from '../physics/routing.js';
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
    originId,
    destId,
    flybyHints, // [{ bodyId, simTime }]
    depHint,
    routeOpts = {},
  } = msg;

  activeRequestId = requestId;
  cancelled.delete(requestId);

  const origin = findById(originId);
  const dest = findById(destId);
  if (!origin || !dest) {
    self.postMessage({
      type: 'error',
      requestId,
      message: `Unknown body id(s): ${[!origin && originId, !dest && destId].filter(Boolean).join(', ')}`,
    });
    clearRequest(requestId);
    return;
  }

  const hints = [];
  for (const h of flybyHints || []) {
    const body = findById(h.bodyId);
    if (!body) {
      self.postMessage({
        type: 'error',
        requestId,
        message: `Unknown flyby body id: ${h.bodyId}`,
      });
      clearRequest(requestId);
      return;
    }
    hints.push({ body, simTime: h.simTime });
  }

  try {
    if (routeOpts.ephemerisBackend === 'sample-de' || routeOpts.backend === 'sample-de') {
      if (!routeOpts.classroomMode) await ensureSampleTableLoaded();
    }
    if (isCancelled(requestId)) {
      self.postMessage({ type: 'cancelled', requestId });
      clearRequest(requestId);
      return;
    }

    const result = findMultiLegWindow(origin, dest, hints, depHint, routeOpts, {
      shouldCancel: () => isCancelled(requestId),
      onProgress: ({ i, n }) => {
        if (i === 1 || i === n || i % 4 === 0) {
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
