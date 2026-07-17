/**
 * Firebase Auth helpers — Google sign-in + auth state.
 */
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseEnabled, initFirebase } from './app.js';
import { state } from '../state.js';

const provider = new GoogleAuthProvider();

/** @type {Array<(user: import('firebase/auth').User|null) => void>} */
const listeners = [];

/**
 * Subscribe to auth changes. Immediately called with current user (or null).
 * @returns {() => void} unsubscribe
 */
export function watchAuth(cb) {
  listeners.push(cb);
  initFirebase();
  const auth = getFirebaseAuth();
  if (!auth) {
    try { cb(null); } catch { /* */ }
    return () => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
  }
  const unsub = onAuthStateChanged(auth, (user) => {
    state.firebase = {
      enabled: isFirebaseEnabled(),
      uid: user?.uid || null,
      email: user?.email || null,
      displayName: user?.displayName || null,
    };
    for (const fn of listeners) {
      try { fn(user); } catch (e) { console.warn(e); }
    }
  });
  return () => {
    unsub();
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase Auth unavailable');
  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    // Popup blocked / COOP — fall back to redirect
    if (err?.code === 'auth/popup-blocked'
        || err?.code === 'auth/popup-closed-by-user'
        || err?.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

/** Call once on boot to complete redirect sign-in. */
export async function completeRedirectSignIn() {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  try {
    return await getRedirectResult(auth);
  } catch (err) {
    console.warn('[HELIOS] redirect sign-in', err);
    return null;
  }
}

export async function signOutUser() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export function currentUser() {
  return getFirebaseAuth()?.currentUser || null;
}
