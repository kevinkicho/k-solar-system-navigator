/**
 * Firebase-backed dense SPICE pack delivery.
 *
 * Storage (CDN):  ephemeris/dense-spk/{packId}.bin|.meta.json|registry.json
 * RTDB (public):  public/denseSpk/registry
 * Firestore:      helios/denseSpkCatalog
 *
 * Classroom / ?firebase=0: callers fall back to Hosting static assets.
 */
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { doc, getDoc } from 'firebase/firestore';
import { ref as rtdbRef, get as rtdbGet } from 'firebase/database';
import {
  getFirebaseStorage, getFirebaseDb, getFirebaseRtdb,
  isFirebaseEnabled, initFirebase,
} from './app.js';
import { state } from '../state.js';

const STORAGE_PREFIX = 'ephemeris/dense-spk';

let _urlCache = new Map(); // path → download URL
let _registryCloud = null;
let _registryTried = false;

export function isDenseCloudAvailable() {
  if (state.classroomMode) return false;
  if (!isFirebaseEnabled()) return false;
  initFirebase();
  return !!getFirebaseStorage();
}

/**
 * Resolve a Storage download URL for a pack file (cached).
 * @param {string} fileName e.g. galilean.bin
 * @returns {Promise<string|null>}
 */
export async function getDenseSpkStorageUrl(fileName) {
  if (!isDenseCloudAvailable() || !fileName) return null;
  const path = `${STORAGE_PREFIX}/${fileName}`;
  if (_urlCache.has(path)) return _urlCache.get(path);
  try {
    const storage = getFirebaseStorage();
    const url = await getDownloadURL(storageRef(storage, path));
    _urlCache.set(path, url);
    return url;
  } catch (err) {
    console.warn('[HELIOS] dense Storage URL', fileName, err?.code || err?.message || err);
    return null;
  }
}

/**
 * Fetch registry from RTDB → Firestore → Storage → App Hosting API (first hit wins).
 * @returns {Promise<object|null>}
 */
export async function fetchDenseSpkRegistryCloud() {
  if (_registryCloud) return _registryCloud;
  if (_registryTried) return null;
  _registryTried = true;

  // 1) RTDB public catalog (fast, no auth) when Firebase on
  if (isDenseCloudAvailable()) {
    try {
      const rtdb = getFirebaseRtdb();
      if (rtdb) {
        const snap = await rtdbGet(rtdbRef(rtdb, 'public/denseSpk/registry'));
        if (snap.exists()) {
          _registryCloud = snap.val();
          _registryCloud._source = 'rtdb';
          return _registryCloud;
        }
      }
    } catch (err) {
      console.warn('[HELIOS] dense RTDB registry', err?.message || err);
    }

    // 2) Firestore helios/denseSpkCatalog
    try {
      const db = getFirebaseDb();
      if (db) {
        const snap = await getDoc(doc(db, 'helios', 'denseSpkCatalog'));
        if (snap.exists()) {
          _registryCloud = snap.data();
          _registryCloud._source = 'firestore';
          return _registryCloud;
        }
      }
    } catch (err) {
      console.warn('[HELIOS] dense Firestore catalog', err?.message || err);
    }

    // 3) Storage registry.json via download URL
    try {
      const url = await getDenseSpkStorageUrl('registry.json');
      if (url) {
        const res = await fetch(url);
        if (res.ok) {
          _registryCloud = await res.json();
          _registryCloud._source = 'storage';
          return _registryCloud;
        }
      }
    } catch (err) {
      console.warn('[HELIOS] dense Storage registry', err?.message || err);
    }
  }

  // 4) App Hosting same-origin catalog (works on hosted.app without Storage seed)
  try {
    if (typeof location !== 'undefined' && /hosted\.app$|localhost|127\.0\.0\.1/.test(location.hostname)) {
      const res = await fetch('/api/ephemeris/dense-spk');
      if (res.ok) {
        const j = await res.json();
        if (j?.local_registry?.packs) {
          _registryCloud = { ...j.local_registry, _source: 'apphosting-api' };
          return _registryCloud;
        }
        if (j?.cloud_catalog?.registry?.packs) {
          _registryCloud = { ...j.cloud_catalog.registry, _source: 'apphosting-cloud' };
          return _registryCloud;
        }
      }
    }
  } catch { /* */ }

  return null;
}

/**
 * Try App Hosting same-origin pack file (proxy under /api/ephemeris/dense-spk/).
 * @returns {Promise<{ meta: object, buffer: ArrayBuffer }|null>}
 */
export async function fetchDensePackFromAppHosting(packId) {
  if (!packId || typeof fetch !== 'function') return null;
  try {
    if (typeof location === 'undefined') return null;
    // Only use on App Hosting / local Next — classic Hosting has no /api routes
    if (!/hosted\.app$|localhost|127\.0\.0\.1/.test(location.hostname)) return null;
    const metaRes = await fetch(`/api/ephemeris/dense-spk/${packId}.meta.json`);
    const binRes = await fetch(`/api/ephemeris/dense-spk/${packId}.bin`);
    if (!metaRes.ok || !binRes.ok) return null;
    return {
      meta: await metaRes.json(),
      buffer: await binRes.arrayBuffer(),
      source: 'apphosting-api',
    };
  } catch {
    return null;
  }
}

/**
 * Fetch pack meta JSON + binary ArrayBuffer from Storage (or null).
 * @param {string} packId
 * @param {{ bin?: string, meta?: string }} [names]
 * @returns {Promise<{ meta: object, buffer: ArrayBuffer }|null>}
 */
export async function fetchDensePackFromStorage(packId, names = {}) {
  if (!isDenseCloudAvailable() || !packId) return null;
  const metaName = names.meta || `${packId}.meta.json`;
  const binName = names.bin || `${packId}.bin`;
  try {
    const metaUrl = await getDenseSpkStorageUrl(metaName);
    const binUrl = await getDenseSpkStorageUrl(binName);
    if (!metaUrl || !binUrl) return null;
    const [metaRes, binRes] = await Promise.all([fetch(metaUrl), fetch(binUrl)]);
    if (!metaRes.ok || !binRes.ok) return null;
    const meta = await metaRes.json();
    const buffer = await binRes.arrayBuffer();
    return { meta, buffer, source: 'firebase-storage' };
  } catch (err) {
    console.warn('[HELIOS] dense pack Storage fetch', packId, err?.message || err);
    return null;
  }
}

export function clearDenseCloudCache() {
  _urlCache = new Map();
  _registryCloud = null;
  _registryTried = false;
}
