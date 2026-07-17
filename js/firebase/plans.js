/**
 * Cloud-saved mission plans (Firestore).
 * Path: users/{uid}/plans/{planId}
 */
import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc,
  query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseEnabled } from './app.js';
import { currentUser } from './auth.js';
import { bodyId } from '../data/catalog.js';
import { state } from '../state.js';
import { DAY } from '../constants.js';

function plansCol(uid) {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firestore unavailable');
  return collection(db, 'users', uid, 'plans');
}

/**
 * Build a compact plan record from current transfer (not full mission JSON).
 */
export function planSummaryFromTransfer(td) {
  if (!td?.body1 || !td?.body2) return null;
  const isMulti = !!td.isMultiLeg;
  const tofDays = td.transferTime != null ? td.transferTime / DAY : null;
  const depUtc = td.departureSimTime != null
    ? new Date(td.departureSimTime * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString()
    : null;
  const arrUtc = td.arrivalSimTime != null
    ? new Date(td.arrivalSimTime * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString()
    : null;
  const need = isMulti
    ? (td.dvTotalMultiLeg ?? null)
    : (td.dvTotal_lambert ?? td.dvTotal ?? null);
  return {
    schema_version: 1,
    kind: 'helios_plan_summary',
    originId: bodyId(td.body1) || td.body1.name,
    destId: bodyId(td.body2) || td.body2.name,
    originName: td.body1.name,
    destName: td.body2.name,
    label: `${td.body1.name} → ${td.body2.name}`,
    departure_utc: depUtc,
    arrival_utc: arrUtc,
    tof_days: tofDays,
    need_dv_m_s: need,
    isMultiLeg: isMulti,
    vehicleId: state.vehicleId || null,
    display_mode: state.display?.mode || 'cinematic',
    lambertOk: !!td.lambertOk || !!td.allLegsOk,
  };
}

/**
 * Save current transfer summary to Firestore.
 * @returns {Promise<string>} plan id
 */
export async function savePlanToCloud(td, opts = {}) {
  if (!isFirebaseEnabled()) throw new Error('Cloud offline');
  const user = currentUser();
  if (!user) throw new Error('Sign in required');
  const summary = planSummaryFromTransfer(td);
  if (!summary) throw new Error('No transfer to save');

  const isNew = !opts.id;
  const id = opts.id || `${summary.originId}_${summary.destId}_${Date.now().toString(36)}`;
  const ref = doc(plansCol(user.uid), id);
  const payload = {
    ...summary,
    title: opts.title || summary.label,
    notes: opts.notes || '',
    updatedAt: serverTimestamp(),
    ownerUid: user.uid,
  };
  // Only stamp createdAt on first write (auto id). Re-saves merge without clobbering it.
  if (isNew) payload.createdAt = serverTimestamp();
  await setDoc(ref, payload, { merge: true });
  return id;
}

/** @returns {Promise<Array<object>>} */
export async function listCloudPlans(max = 20) {
  if (!isFirebaseEnabled()) return [];
  const user = currentUser();
  if (!user) return [];
  const q = query(plansCol(user.uid), orderBy('updatedAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getCloudPlan(planId) {
  const user = currentUser();
  if (!user || !planId) return null;
  const snap = await getDoc(doc(plansCol(user.uid), planId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function deleteCloudPlan(planId) {
  const user = currentUser();
  if (!user || !planId) return;
  await deleteDoc(doc(plansCol(user.uid), planId));
}
