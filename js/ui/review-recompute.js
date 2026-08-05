/**
 * Review link recompute — load plan_request from ?review= / ?recompute=1 + hash.
 * Recomputes geometry; never trusts stored Δv.
 */

import { notify } from './format.js';
import { parsePlanRequest } from './share-codec.js';
import { reapplyPlanRequest, normalizePlanRequest } from './plan-reapply.js';
import { listLocalReviews } from '../firebase/shared-plans.js';

/**
 * If URL has ?review=<id> or ?recompute=1 with plan hash, apply and recompute.
 * Note: bare #v=1&… is already handled by tryApplyHashOnLoad; recompute forces
 * a second seed restore via reapply (full flybys + vehicle) after UI is ready.
 */
export async function tryApplyReviewOnLoad() {
  try {
    const q = new URLSearchParams(location.search || '');
    const reviewId = q.get('review');

    // Named local review id (not the flag "1")
    if (reviewId && reviewId !== '1') {
      const local = listLocalReviews().find((r) => r.id === reviewId);
      const pr = local?.plan_request || local?.summary?.plan_request;
      if (pr) {
        const r = await reapplyPlanRequest(pr, { notifyUser: true, compute: true });
        if (r.ok) notify(`REVIEW RECOMPUTE · ${reviewId}`);
        return { ok: r.ok, via: 'review-id', id: reviewId, error: r.error };
      }
      notify(`REVIEW ID NOT FOUND · ${reviewId}`);
      return { ok: false, via: 'review-id', id: reviewId, error: 'not found' };
    }

    // Force recompute from hash (or review=1 legacy flag)
    if (q.get('recompute') === '1' || reviewId === '1') {
      const req = parsePlanRequest(location.hash);
      if (req) {
        const pr = normalizePlanRequest(req);
        const r = await reapplyPlanRequest(pr, { notifyUser: true, compute: true });
        if (r.ok) notify('REVIEW RECOMPUTE FROM HASH');
        return { ok: r.ok, via: 'hash', error: r.error };
      }
      return { ok: false, via: 'hash', error: 'no parseable hash' };
    }

    return { ok: false, skipped: true };
  } catch (e) {
    console.warn('[HELIOS] review recompute', e);
    return { ok: false, error: e.message };
  }
}

/**
 * Build a review URL that recomputes from current plan_request.
 * Uses share-codec v1 hash + ?recompute=1 so receivers re-run geometry.
 */
export async function buildReviewRecomputeUrl() {
  const { buildPlanRequestFromState } = await import('../agent/campaign-object.js');
  const { encodePlanRequestObject } = await import('./share-codec.js');
  const { state } = await import('../state.js');
  const pr = buildPlanRequestFromState(state);
  if (!pr?.o || !pr?.d || !pr?.dep) return null;
  const hash = encodePlanRequestObject(pr);
  if (!hash) return null;
  const u = new URL(location.href);
  u.searchParams.set('recompute', '1');
  // Keep firebase off for shared review links unless already set
  if (!u.searchParams.has('firebase')) u.searchParams.set('firebase', '0');
  u.hash = hash.startsWith('#') ? hash.slice(1) : hash;
  return u.toString();
}

export { normalizePlanRequest };
