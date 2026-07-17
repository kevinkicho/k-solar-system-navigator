/**
 * Async nearest-feasible window search: module Worker preferred,
 * chunked main-thread fallback (same as porkchop pattern).
 */

import { bodyId } from '../data/catalog.js';
import {
  findNearestFeasibleTransfer,
  findNearestFeasibleTransferChunked,
} from '../physics/nearest-feasible-search.js';

let worker = null;
let workerReady = false;
let nextRequestId = 1;
/** @type {Map<number, { resolve, reject, onProgress }>} */
const pending = new Map();

function discardWorker(w) {
  try {
    w?.terminate();
  } catch {
    /* */
  }
  if (worker === w) {
    worker = null;
    workerReady = false;
  }
}

function tryCreateWorker() {
  if (typeof Worker === 'undefined') return false;
  if (worker && workerReady) return true;
  if (worker) discardWorker(worker);
  try {
    const w = new Worker(
      new URL('../workers/nearest-feasible-worker.js', import.meta.url),
      { type: 'module' },
    );
    w.onerror = () => {
      // Fail pending requests to main-thread fallback path
      for (const [id, p] of pending) {
        p.reject(Object.assign(new Error('worker error'), { code: 'WORKER_DEAD' }));
        pending.delete(id);
      }
      discardWorker(w);
    };
    w.onmessage = (ev) => {
      const msg = ev.data || {};
      const p = pending.get(msg.requestId);
      if (!p) return;
      if (msg.type === 'progress') {
        p.onProgress?.({ i: msg.i, n: msg.n });
        return;
      }
      if (msg.type === 'done') {
        pending.delete(msg.requestId);
        p.resolve(msg.result ?? null);
        return;
      }
      if (msg.type === 'cancelled') {
        pending.delete(msg.requestId);
        p.resolve(null);
        return;
      }
      if (msg.type === 'error') {
        pending.delete(msg.requestId);
        p.reject(new Error(msg.message || 'nearest-feasible worker error'));
      }
    };
    worker = w;
    workerReady = true;
    return true;
  } catch {
    worker = null;
    workerReady = false;
    return false;
  }
}

/**
 * @param {object} body1
 * @param {object} body2
 * @param {number} depHint
 * @param {number} tofHint
 * @param {object} [opts]
 * @param {(p: {i:number,n:number}) => void} [opts.onProgress]
 * @param {() => boolean} [opts.shouldCancel]
 * @returns {Promise<object|null>}
 */
export async function findNearestFeasibleTransferAsync(
  body1,
  body2,
  depHint,
  tofHint,
  opts = {},
) {
  const id1 = bodyId(body1);
  const id2 = bodyId(body2);
  const backend = opts.backend || 'approx';
  const classroomMode = !!opts.classroomMode;
  const allowPast = !!opts.allowPast;
  const onProgress = opts.onProgress;
  const shouldCancel = opts.shouldCancel;

  // Prefer worker when body ids resolve and Worker is available
  if (id1 && id2 && tryCreateWorker() && workerReady && worker) {
    const requestId = nextRequestId++;
    try {
      const result = await new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject, onProgress });
        worker.postMessage({
          type: 'search',
          requestId,
          body1Id: id1,
          body2Id: id2,
          depHint,
          tofHint,
          backend,
          classroomMode,
          allowPast,
        });
      });
      return result;
    } catch (e) {
      if (e?.code === 'WORKER_DEAD' || /worker/i.test(e?.message || '')) {
        // fall through to chunked main
      } else {
        // Unknown error — still try main-thread
        console.warn('[nearest-feasible-async]', e);
      }
    }
  }

  // Main-thread chunked fallback (keeps UI responsive)
  return findNearestFeasibleTransferChunked(body1, body2, depHint, tofHint, {
    backend,
    classroomMode,
    allowPast,
    onProgress,
    shouldCancel,
  });
}

/** Cancel all pending worker searches (best-effort). */
export function cancelNearestFeasibleSearches() {
  if (worker && workerReady) {
    for (const id of pending.keys()) {
      try {
        worker.postMessage({ type: 'cancel', requestId: id });
      } catch {
        /* */
      }
    }
  }
  for (const [, p] of pending) {
    p.resolve(null);
  }
  pending.clear();
}

// Re-export sync for callers that need offline purity
export { findNearestFeasibleTransfer };
