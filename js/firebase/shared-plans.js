/**
 * Shared / review-link plan scaffolding (collaboration).
 * Stores a review payload under users/{uid}/shared_plans when Auth is available.
 * Preliminary artifacts only — recompute for authority.
 */

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { isFirebaseEnabled, getFirebaseDb } from './app.js';
import { currentUser } from './auth.js';
import { planSummaryFromTransfer, stripUndefined } from './plans.js';

/**
 * Build a shareable review payload (no vectors as truth).
 */
export function buildReviewPayload(td, opts = {}) {
  const summary = planSummaryFromTransfer(td);
  return {
    schema_version: 1,
    kind: 'helios-review-link',
    product_class: 'preliminary-not-flight-certified',
    note: 'Review artifact — recompute geometry; never trust stored Δv alone. Not flight-certified.',
    created_at: new Date().toISOString(),
    title: opts.title || summary?.label || 'HELIOS review',
    comments: Array.isArray(opts.comments) ? opts.comments.slice(0, 50) : [],
    summary,
    plan_request: summary?.plan_request || null,
    visibility: opts.visibility || 'private',
  };
}

/**
 * Save review doc to Firestore if signed in; else localStorage fallback.
 */
export async function saveSharedReview(td, opts = {}) {
  const payload = buildReviewPayload(td, opts);
  const user = currentUser();
  if (!isFirebaseEnabled() || !user) {
    try {
      const key = 'helios-local-reviews';
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const id = `local-${Date.now()}`;
      arr.unshift({ id, ...payload });
      localStorage.setItem(key, JSON.stringify(arr.slice(0, 20)));
      return { ok: true, id, local: true, payload };
    } catch (e) {
      return { ok: false, error: e.message || 'local save failed', payload };
    }
  }
  try {
    const db = getFirebaseDb();
    if (!db) return { ok: false, error: 'no firestore', payload };
    const col = collection(db, 'users', user.uid, 'shared_plans');
    const docBody = stripUndefined({
      ...payload,
      owner_uid: user.uid,
      created_server: serverTimestamp(),
    });
    const ref = await addDoc(col, docBody);
    return { ok: true, id: ref.id, local: false, path: `users/${user.uid}/shared_plans/${ref.id}` };
  } catch (e) {
    return { ok: false, error: e.message || String(e), payload };
  }
}

export function addReviewCommentLocal(reviewId, text) {
  try {
    const key = 'helios-local-reviews';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    const i = arr.findIndex((r) => r.id === reviewId);
    if (i < 0) return { ok: false, error: 'not found' };
    arr[i].comments = arr[i].comments || [];
    arr[i].comments.push({
      at: new Date().toISOString(),
      text: String(text || '').slice(0, 500),
    });
    localStorage.setItem(key, JSON.stringify(arr));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function listLocalReviews() {
  try {
    return JSON.parse(localStorage.getItem('helios-local-reviews') || '[]');
  } catch {
    return [];
  }
}
