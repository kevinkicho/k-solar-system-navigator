/**
 * Firebase *web* client config (safe to ship to the browser).
 *
 * This is NOT a service-account secret. Protect user data with Security Rules.
 * Override at runtime: window.__FIREBASE_CONFIG__ = { ... } before main.js.
 * Classroom / offline: leave unused; initFirebase() no-ops when disabled.
 */
export const FIREBASE_PUBLIC_CONFIG = {
  apiKey: 'AIzaSyAF-ZnrCe0m4Ih0equ_SQFpNSNYQRF9yQM',
  authDomain: 'k-solar-system-navigator.firebaseapp.com',
  databaseURL: 'https://k-solar-system-navigator-default-rtdb.firebaseio.com',
  projectId: 'k-solar-system-navigator',
  storageBucket: 'k-solar-system-navigator.firebasestorage.app',
  messagingSenderId: '482158923083',
  appId: '1:482158923083:web:aab465f685814e151e6cce',
};
