/**
 * Cloud Functions client (optional). Falls back gracefully when Functions
 * are not deployed or user is offline/classroom.
 */
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { initFirebase, isFirebaseEnabled, getFirebaseApp } from './app.js';
import { state } from '../state.js';

let _fns = null;

function getFns() {
  if (!isFirebaseEnabled()) return null;
  if (_fns) return _fns;
  initFirebase();
  const app = getFirebaseApp?.() || initFirebase().app;
  if (!app) return null;
  try {
    _fns = getFunctions(app, 'us-central1');
    // Optional emulator: ?fnemu=1
    try {
      if (typeof location !== 'undefined' && /[?&]fnemu=1(?:&|$)/.test(location.search || '')) {
        connectFunctionsEmulator(_fns, '127.0.0.1', 5001);
      }
    } catch { /* */ }
    return _fns;
  } catch {
    return null;
  }
}

/**
 * Server re-rank of window shortlist (requires deployed refineWindowShortlist).
 * @returns {Promise<object|null>}
 */
export async function refineWindowShortlistCloud(payload) {
  if (state.classroomMode || !isFirebaseEnabled()) return null;
  const fns = getFns();
  if (!fns) return null;
  try {
    const call = httpsCallable(fns, 'refineWindowShortlist');
    const res = await call({
      origin: payload.origin,
      dest: payload.dest,
      candidates: payload.shortlist || payload.candidates || [],
      fidelity: payload.fidelity || state.fidelityLevel,
      save: !!payload.save,
    });
    return res?.data || null;
  } catch (err) {
    console.warn('[HELIOS] refineWindowShortlistCloud', err?.code || err?.message || err);
    return null;
  }
}
