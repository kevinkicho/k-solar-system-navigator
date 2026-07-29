/**
 * Realtime Database — lightweight last-route bookmark under users/{uid}/lastRoute.
 * Not a second plan store; Firestore remains source of truth for plan lists.
 */
import { ref, set, get, remove } from 'firebase/database';
import { getFirebaseRtdb, isFirebaseEnabled } from './app.js';
import { currentUser } from './auth.js';
import { bodyId } from '../data/catalog.js';
import { state } from '../state.js';
import { DAY } from '../constants.js';

function lastRouteRef(uid) {
  const rtdb = getFirebaseRtdb();
  if (!rtdb) throw new Error('RTDB unavailable');
  return ref(rtdb, `users/${uid}/lastRoute`);
}

/**
 * Compact bookmark from current transfer.
 */
export function lastRouteFromTransfer(td) {
  if (!td?.body1 || !td?.body2) return null;
  const depUtc = td.departureSimTime != null
    ? new Date(td.departureSimTime * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString()
    : null;
  return {
    o: bodyId(td.body1) || td.body1.name,
    d: bodyId(td.body2) || td.body2.name,
    dep: depUtc ? String(depUtc).slice(0, 10) : null,
    tof: td.transferTime != null ? Math.round(td.transferTime / DAY) : null,
    veh: state.vehicleId || 'sh-starship',
    label: `${td.body1.name} → ${td.body2.name}`,
    at: Date.now(),
  };
}

export async function saveLastRoute(td) {
  if (!isFirebaseEnabled()) return;
  const user = currentUser();
  if (!user) return;
  const payload = lastRouteFromTransfer(td);
  if (!payload) return;
  try {
    await set(lastRouteRef(user.uid), payload);
  } catch (err) {
    console.warn('[HELIOS] saveLastRoute', err);
  }
}

export async function loadLastRoute() {
  if (!isFirebaseEnabled()) return null;
  const user = currentUser();
  if (!user) return null;
  try {
    const snap = await get(lastRouteRef(user.uid));
    if (!snap.exists()) return null;
    return snap.val();
  } catch (err) {
    console.warn('[HELIOS] loadLastRoute', err);
    return null;
  }
}

export async function clearLastRoute() {
  if (!isFirebaseEnabled()) return;
  const user = currentUser();
  if (!user) return;
  try {
    await remove(lastRouteRef(user.uid));
  } catch (err) {
    console.warn('[HELIOS] clearLastRoute', err);
  }
}
