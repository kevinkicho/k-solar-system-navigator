/**
 * Firebase app bootstrap for HELIOS.
 * Graceful offline: returns null services when disabled / classroom / init fails.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { FIREBASE_PUBLIC_CONFIG } from './public-config.js';
import { state } from '../state.js';

let _app = null;
let _auth = null;
let _db = null;
let _rtdb = null;
let _storage = null;
let _initTried = false;
let _enabled = false;

function resolveConfig() {
  if (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__) {
    return window.__FIREBASE_CONFIG__;
  }
  return FIREBASE_PUBLIC_CONFIG;
}

function configLooksValid(cfg) {
  return !!(cfg?.apiKey && cfg?.projectId && cfg?.appId
    && !String(cfg.apiKey).includes('your_firebase'));
}

/**
 * Initialize Firebase once. Safe to call multiple times.
 * @returns {{ app, auth, db, rtdb, storage, enabled: boolean }}
 */
export function initFirebase() {
  if (_initTried) {
    return {
      app: _app, auth: _auth, db: _db, rtdb: _rtdb, storage: _storage, enabled: _enabled,
    };
  }
  _initTried = true;

  // Classroom mode stays offline (no cloud dependency for curriculum).
  if (state.classroomMode) {
    _enabled = false;
    return { app: null, auth: null, db: null, rtdb: null, storage: null, enabled: false };
  }

  // Opt-out: ?firebase=0
  try {
    if (typeof location !== 'undefined'
        && /[?&]firebase=0(?:&|$)/.test(location.search || '')) {
      _enabled = false;
      return { app: null, auth: null, db: null, rtdb: null, storage: null, enabled: false };
    }
  } catch { /* */ }

  const cfg = resolveConfig();
  if (!configLooksValid(cfg)) {
    console.info('[HELIOS] Firebase config missing/placeholder — cloud features off');
    _enabled = false;
    return { app: null, auth: null, db: null, rtdb: null, storage: null, enabled: false };
  }

  try {
    _app = getApps().length ? getApps()[0] : initializeApp(cfg);
    _auth = getAuth(_app);
    _db = getFirestore(_app);
    try { _rtdb = getDatabase(_app); } catch { _rtdb = null; }
    try { _storage = getStorage(_app); } catch { _storage = null; }
    _enabled = true;
    state.firebase = { enabled: true, uid: null, email: null };
  } catch (err) {
    console.warn('[HELIOS] Firebase init failed — continuing offline', err);
    _enabled = false;
    _app = null;
    _auth = null;
    _db = null;
    _rtdb = null;
    _storage = null;
  }

  return {
    app: _app, auth: _auth, db: _db, rtdb: _rtdb, storage: _storage, enabled: _enabled,
  };
}

export function isFirebaseEnabled() {
  if (!_initTried) initFirebase();
  return _enabled;
}

export function getFirebaseAuth() {
  if (!_initTried) initFirebase();
  return _auth;
}

export function getFirebaseDb() {
  if (!_initTried) initFirebase();
  return _db;
}

export function getFirebaseRtdb() {
  if (!_initTried) initFirebase();
  return _rtdb;
}

export function getFirebaseStorage() {
  if (!_initTried) initFirebase();
  return _storage;
}
