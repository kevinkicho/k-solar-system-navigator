/**
 * Async multi-leg window search: module Worker preferred,
 * chunked main-thread fallback.
 */

import { bodyId } from '../data/catalog.js';
import {
  findMultiLegWindow,
  findMultiLegWindowChunked,
} from '../physics/multi-leg-window-search.js';

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
      new URL('../workers/multi-leg-window-worker.js', import.meta.url),
      { type: 'module' },
    );
    w.onerror = () => {
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
        p.reject(new Error(msg.message || 'multi-leg window worker error'));
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
 * @param {object} origin
 * @param {object} dest
 * @param {{ body, simTime }[]} flybyHints
 * @param {number} depHint
 * @param {object} [routeOpts]
 * @param {object} [opts]
 */
export async function findMultiLegWindowAsync(
  origin,
  dest,
  flybyHints,
  depHint,
  routeOpts = {},
  opts = {},
) {
  const originId = bodyId(origin);
  const destId = bodyId(dest);
  const hintPayload = (flybyHints || []).map((f) => ({
    bodyId: bodyId(f.body),
    simTime: f.simTime,
  }));
  const onProgress = opts.onProgress;
  const shouldCancel = opts.shouldCancel;

  if (
    originId
    && destId
    && hintPayload.every((h) => h.bodyId)
    && tryCreateWorker()
    && workerReady
    && worker
  ) {
    const requestId = nextRequestId++;
    try {
      return await new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject, onProgress });
        worker.postMessage({
          type: 'search',
          requestId,
          originId,
          destId,
          flybyHints: hintPayload,
          depHint,
          routeOpts: {
            ephemerisBackend: routeOpts.ephemerisBackend || routeOpts.backend || 'approx',
            backend: routeOpts.backend || routeOpts.ephemerisBackend || 'approx',
            classroomMode: !!routeOpts.classroomMode,
          },
        });
      });
    } catch (e) {
      if (e?.code !== 'WORKER_DEAD') {
        console.warn('[multi-leg-window-async]', e);
      }
    }
  }

  return findMultiLegWindowChunked(origin, dest, flybyHints, depHint, routeOpts, {
    onProgress,
    shouldCancel,
  });
}

export { findMultiLegWindow };
