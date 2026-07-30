/**
 * User preferences in Firestore: users/{uid}/prefs/settings
 * Synced lightly on sign-in / sign-out (not continuous stream).
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseEnabled } from './app.js';
import { currentUser } from './auth.js';
import { state } from '../state.js';

function prefsRef(uid) {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firestore unavailable');
  return doc(db, 'users', uid, 'prefs', 'settings');
}

/** Snapshot of client prefs safe to store. */
export function prefsFromState() {
  return {
    schema_version: 1,
    vehicleId: state.vehicleId || 'sh-starship',
    abstractBudget_m_s: state.abstractBudget_m_s ?? 8000,
    costBasis: state.costBasis || 'helio',
    display_mode: state.display?.mode || 'cinematic',
    map_mode: !!state.mapMode,
    path_geometry: state.pathGeometry || 'visual',
    ephemeris_backend: state.ephemerisBackend || 'approx',
    fidelity_level: state.fidelityLevel || 'L1',
    starshipArch: state.starshipArch || 'unrefueled',
    cargoMass_kg: state.cargoMass_kg ?? 0,
    quality_tier: state.qualityTier || 'auto',
  };
}

/**
 * Apply prefs object to client state (no network).
 * @returns {boolean} true if anything applied
 */
export function applyPrefsToState(prefs) {
  if (!prefs || typeof prefs !== 'object') return false;

  if (prefs.vehicleId) state.vehicleId = prefs.vehicleId;
  if (prefs.abstractBudget_m_s != null) state.abstractBudget_m_s = Number(prefs.abstractBudget_m_s);
  if (prefs.costBasis === 'mission' || prefs.costBasis === 'helio') {
    state.costBasis = prefs.costBasis;
  }
  if (prefs.path_geometry === 'visual' || prefs.path_geometry === 'physical' || prefs.path_geometry === 'both') {
    state.pathGeometry = prefs.path_geometry;
  }
  if (prefs.ephemeris_backend === 'sample-de' || prefs.ephemeris_backend === 'approx') {
    state.ephemerisBackend = prefs.ephemeris_backend;
  }
  if (prefs.fidelity_level) state.fidelityLevel = prefs.fidelity_level;
  if (prefs.starshipArch) state.starshipArch = prefs.starshipArch;
  if (prefs.cargoMass_kg != null) state.cargoMass_kg = Number(prefs.cargoMass_kg);
  if (prefs.quality_tier) state.qualityTier = prefs.quality_tier;

  // Display / map mode applied by caller (needs rebuild side effects)
  return true;
}

export async function loadUserPrefs() {
  if (!isFirebaseEnabled()) return null;
  const user = currentUser();
  if (!user) return null;
  try {
    const snap = await getDoc(prefsRef(user.uid));
    if (!snap.exists()) return null;
    return snap.data();
  } catch (err) {
    console.warn('[HELIOS] loadUserPrefs', err);
    return null;
  }
}

function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripUndefined).filter((v) => v !== undefined);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value; // FieldValue, Timestamp, …
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    const c = stripUndefined(v);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

export async function saveUserPrefs(extra = {}) {
  if (!isFirebaseEnabled()) return;
  const user = currentUser();
  if (!user) return;
  try {
    await setDoc(prefsRef(user.uid), stripUndefined({
      ...prefsFromState(),
      ...extra,
      updatedAt: serverTimestamp(),
      ownerUid: user.uid,
    }), { merge: true });
  } catch (err) {
    console.warn('[HELIOS] saveUserPrefs', err);
  }
}

/** Ensure users/{uid} profile doc exists (first sign-in). */
export async function ensureUserProfile(user) {
  if (!isFirebaseEnabled() || !user?.uid) return;
  const db = getFirebaseDb();
  if (!db) return;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await setDoc(ref, stripUndefined({
        email: user.email || null,
        displayName: user.displayName || null,
        lastLoginAt: serverTimestamp(),
      }), { merge: true });
      return;
    }
    await setDoc(ref, stripUndefined({
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      app: 'helios',
    }));
  } catch (err) {
    console.warn('[HELIOS] ensureUserProfile', err);
  }
}
