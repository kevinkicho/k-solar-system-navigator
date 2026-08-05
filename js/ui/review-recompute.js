/**
 * Review link recompute — load plan_request from ?review= / ?recompute=1 + hash.
 * Uses domain command bus; never trusts stored Δv.
 */

import { notify } from './format.js';
import { parsePlanRequest } from './share-codec.js';
import { normalizePlanRequest } from '../domain/plan-seed.js';
import { dispatchPlanCommand } from '../domain/plan-commands.js';
import { listLocalReviews } from '../firebase/shared-plans.js';

/**
 * If URL has ?review=<id> or ?recompute=1 with plan hash, apply and recompute.
 */
export async function tryApplyReviewOnLoad() {
  try {
    const q = new URLSearchParams(location.search || '');
    const reviewId = q.get('review');

    if (reviewId && reviewId !== '1') {
      const local = listLocalReviews().find((r) => r.id === reviewId);
      const pr = local?.plan_request || local?.summary?.plan_request;
      if (pr) {
        const r = await dispatchPlanCommand({
          type: 'APPLY_SEED',
          seed: pr,
          compute: true,
          notifyUser: true,
          recordHistory: false,
          source: 'review-id',
          label: `Review ${reviewId}`,
        });
        if (r.ok) notify(`REVIEW RECOMPUTE · ${reviewId}`);
        return { ok: r.ok, via: 'review-id', id: reviewId, error: r.error };
      }
      notify(`REVIEW ID NOT FOUND · ${reviewId}`);
      return { ok: false, via: 'review-id', id: reviewId, error: 'not found' };
    }

    if (q.get('recompute') === '1' || reviewId === '1') {
      const req = parsePlanRequest(location.hash);
      if (req) {
        const pr = normalizePlanRequest(req);
        const r = await dispatchPlanCommand({
          type: 'APPLY_SEED',
          seed: pr,
          compute: true,
          notifyUser: true,
          recordHistory: false,
          source: 'review-hash',
          label: 'Review recompute hash',
        });
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

export async function buildReviewRecomputeUrl() {
  const { buildPlanRequestFromState } = await import('../domain/plan-seed.js');
  const { encodePlanRequestObject } = await import('./share-codec.js');
  const { state } = await import('../state.js');
  const pr = buildPlanRequestFromState(state);
  if (!pr?.o || !pr?.d || !pr?.dep) return null;
  const hash = encodePlanRequestObject(pr);
  if (!hash) return null;
  const u = new URL(location.href);
  u.searchParams.set('recompute', '1');
  if (!u.searchParams.has('firebase')) u.searchParams.set('firebase', '0');
  u.hash = hash.startsWith('#') ? hash.slice(1) : hash;
  return u.toString();
}

export { normalizePlanRequest };
