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
 * Build a compact plan record from current transfer.
 * schema_version 2 adds plan_request for full recompute restore (cloud v2).
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
  const origin = bodyId(td.body1) || td.body1.name;
  const dest = bodyId(td.body2) || td.body2.name;
  const depDay = depUtc ? String(depUtc).slice(0, 10) : null;

  // Compact plan_request — same shape as mission export / share codec (v2 restore).
  const plan_request = {
    v: 2,
    o: origin,
    d: dest,
    dep: depDay,
    tof: tofDays != null ? Math.round(tofDays) : null,
    veh: state.vehicleId || 'sh-starship',
    ab: state.abstractBudget_m_s ?? 8000,
    basis: state.costBasis || 'helio',
    view: state.mapMode ? 'schematic' : (state.display?.mode || 'cinematic'),
    cargo: Math.round(state.cargoMass_kg || 0),
    arch: state.vehicleId === 'sh-starship' ? (state.starshipArch || 'legacy-demo') : undefined,
    tankers: state.starshipArch === 'tanker-n' ? (state.tankerCount || 0) : undefined,
    f9v: state.vehicleId === 'falcon9' ? (state.falcon9Variant || 'expendable') : undefined,
    eph: (state.ephemerisBackend === 'sample-de' && !state.classroomMode) ? 'sample' : undefined,
    map: state.mapMode ? 1 : undefined,
  };

  // Multi-leg flybys as compact fb list when present
  if (isMulti && Array.isArray(td.waypoints) && td.waypoints.length > 2) {
    const fb = [];
    for (let i = 1; i < td.waypoints.length - 1; i++) {
      const w = td.waypoints[i];
      const id = bodyId(w.body) || w.body?.name || w.bodyName;
      if (!id) continue;
      const epoch = w.simTime != null
        ? new Date(w.simTime * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString().slice(0, 10)
        : null;
      fb.push(epoch ? `${id}:${epoch}` : String(id));
    }
    if (fb.length) plan_request.fb = fb.join(',');
  }

  return {
    schema_version: 2,
    kind: 'helios_plan_summary',
    originId: origin,
    destId: dest,
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
    map_mode: !!state.mapMode,
    lambertOk: !!td.lambertOk || !!td.allLegsOk,
    plan_request,
  };
}

/**
 * Save current transfer summary to Firestore (+ optional Storage mission JSON + RTDB lastRoute).
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

  // Best-effort full mission JSON to Storage (does not block Firestore save)
  let storagePath = null;
  if (opts.withMissionBlob !== false) {
    try {
      const { buildPlanObject } = await import('../ui/mission-export.js');
      const { uploadMissionBlob } = await import('./storage-plans.js');
      const planObj = buildPlanObject(td);
      const url = await uploadMissionBlob(id, planObj);
      if (url) {
        storagePath = `users/${user.uid}/plans/${id}.json`;
        payload.mission_blob = storagePath;
        payload.mission_blob_url = url;
        payload.has_mission_blob = true;
      }
    } catch (err) {
      console.warn('[HELIOS] mission blob upload skipped', err);
    }
  }

  await setDoc(ref, payload, { merge: true });

  // RTDB last-route bookmark
  try {
    const { saveLastRoute } = await import('./rtdb.js');
    await saveLastRoute(td);
  } catch { /* */ }

  // Touch prefs so vehicle/view stay in sync
  try {
    const { saveUserPrefs } = await import('./prefs.js');
    await saveUserPrefs({ last_plan_id: id });
  } catch { /* */ }

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
  try {
    const { deleteMissionBlob } = await import('./storage-plans.js');
    await deleteMissionBlob(planId);
  } catch { /* */ }
}
