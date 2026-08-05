/**
 * Wait for plan compute completion (session event adapter).
 */

/**
 * @param {number} [timeoutMs]
 * @returns {Promise<object>}
 */
export function waitForPlanComputed(timeoutMs = 120_000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (payload) => {
      if (done) return;
      done = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('helios:plan-computed', onEvt);
      }
      clearTimeout(timer);
      resolve(payload);
    };
    const onEvt = (e) => finish(e.detail || { ok: true });
    const timer = setTimeout(() => finish({ ok: true, timedOut: true }), timeoutMs);
    if (typeof window !== 'undefined') {
      window.addEventListener('helios:plan-computed', onEvt);
    } else {
      finish({ ok: true, noWindow: true });
    }
  });
}
