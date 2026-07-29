/**
 * Full mission JSON blobs in Cloud Storage: users/{uid}/plans/{planId}.json
 * Complements compact Firestore plan summaries.
 */
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirebaseStorage, isFirebaseEnabled } from './app.js';
import { currentUser } from './auth.js';

function planBlobRef(uid, planId) {
  const storage = getFirebaseStorage();
  if (!storage) throw new Error('Storage unavailable');
  return ref(storage, `users/${uid}/plans/${planId}.json`);
}

/**
 * Upload mission plan JSON string (or object).
 * @returns {Promise<string|null>} download URL or null if skipped
 */
export async function uploadMissionBlob(planId, planObj) {
  if (!isFirebaseEnabled() || !planId || !planObj) return null;
  const user = currentUser();
  if (!user) return null;
  const storage = getFirebaseStorage();
  if (!storage) return null;

  try {
    const text = typeof planObj === 'string' ? planObj : JSON.stringify(planObj);
    // Soft size guard — Storage rules also cap 5 MiB
    if (text.length > 4 * 1024 * 1024) {
      console.warn('[HELIOS] mission blob too large — skipped Storage upload');
      return null;
    }
    const r = planBlobRef(user.uid, planId);
    await uploadString(r, text, 'raw', { contentType: 'application/json' });
    try {
      return await getDownloadURL(r);
    } catch {
      return `gs://${r.bucket}/${r.fullPath}`;
    }
  } catch (err) {
    console.warn('[HELIOS] uploadMissionBlob', err);
    return null;
  }
}

export async function deleteMissionBlob(planId) {
  if (!isFirebaseEnabled() || !planId) return;
  const user = currentUser();
  if (!user) return;
  try {
    await deleteObject(planBlobRef(user.uid, planId));
  } catch (err) {
    // Missing object is fine
    if (err?.code !== 'storage/object-not-found') {
      console.warn('[HELIOS] deleteMissionBlob', err);
    }
  }
}
