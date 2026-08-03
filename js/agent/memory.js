/**
 * AI mission memory — local always; Firestore when signed in.
 */

import { state } from '../state.js';
import { getSelectedModel } from './models.js';

const LOCAL_KEY = 'helios_ai_memory_v1';
const MAX_TURNS = 40;
const MAX_SESSIONS = 12;

function planHash() {
  const td = state.transferData;
  const o = state.routeOrigin?.name || '';
  const d = state.routeDestination?.name || '';
  const dep = td?.departureSimTime ?? '';
  const dv = td?.dvTotal_lambert ?? td?.dvTotal ?? '';
  return `${o}>${d}|${dep}|${dv}|${state.vehicleId || ''}`;
}

export function loadLocalMemory() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { sessions: [], current: null };
    return JSON.parse(raw);
  } catch {
    return { sessions: [], current: null };
  }
}

function saveLocalMemory(mem) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(mem));
  } catch { /* quota */ }
}

/**
 * Append a chat turn to current session memory.
 */
export function appendMemoryTurn(role, content, extra = {}) {
  const mem = loadLocalMemory();
  const ph = planHash();
  if (!mem.current || mem.current.planHash !== ph) {
    // archive previous
    if (mem.current?.turns?.length) {
      mem.sessions = [mem.current, ...(mem.sessions || [])].slice(0, MAX_SESSIONS);
    }
    mem.current = {
      id: `s-${Date.now()}`,
      planHash: ph,
      model: getSelectedModel(),
      started_at: new Date().toISOString(),
      turns: [],
    };
  }
  mem.current.turns.push({
    role,
    content: String(content || '').slice(0, 4000),
    at: new Date().toISOString(),
    ...extra,
  });
  if (mem.current.turns.length > MAX_TURNS) {
    mem.current.turns = mem.current.turns.slice(-MAX_TURNS);
  }
  mem.current.updated_at = new Date().toISOString();
  mem.current.model = getSelectedModel();
  saveLocalMemory(mem);
  // Fire-and-forget cloud sync
  queueMicrotask(() => syncMemoryToCloud(mem).catch(() => {}));
  return mem.current;
}

export function getRecentMemoryTurns(n = 12) {
  const mem = loadLocalMemory();
  return (mem.current?.turns || []).slice(-n);
}

export function memorySummaryForPrompt(n = 8) {
  const turns = getRecentMemoryTurns(n);
  if (!turns.length) return '';
  const lines = turns.map((t) => `${t.role}: ${t.content.slice(0, 400)}`);
  return `\n[AI session memory · last ${turns.length} turns]\n${lines.join('\n')}\n`;
}

async function syncMemoryToCloud(mem) {
  try {
    const { isFirebaseEnabled } = await import('../firebase/app.js');
    const { currentUser } = await import('../firebase/auth.js');
    if (!isFirebaseEnabled()) return;
    const user = currentUser();
    if (!user) return;
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const { getFirebaseDb } = await import('../firebase/app.js');
    const db = getFirebaseDb();
    if (!db) return;
    const ref = doc(db, 'users', user.uid, 'ai_memory', 'latest');
    await setDoc(ref, {
      schema_version: 1,
      product_class: 'preliminary-not-flight-certified',
      current: mem.current,
      sessions: (mem.sessions || []).slice(0, 5),
      updated_at: serverTimestamp(),
    }, { merge: true });
  } catch {
    /* offline / rules */
  }
}

export async function loadMemoryFromCloud() {
  try {
    const { isFirebaseEnabled } = await import('../firebase/app.js');
    const { currentUser } = await import('../firebase/auth.js');
    if (!isFirebaseEnabled()) return null;
    const user = currentUser();
    if (!user) return null;
    const { doc, getDoc } = await import('firebase/firestore');
    const { getFirebaseDb } = await import('../firebase/app.js');
    const db = getFirebaseDb();
    if (!db) return null;
    const snap = await getDoc(doc(db, 'users', user.uid, 'ai_memory', 'latest'));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data?.current) {
      const local = loadLocalMemory();
      // Prefer newer
      const localT = Date.parse(local.current?.updated_at || 0) || 0;
      const cloudT = data.current.updated_at?.toMillis?.() || Date.parse(data.current.updated_at || 0) || 0;
      if (cloudT >= localT) {
        saveLocalMemory({
          current: data.current,
          sessions: data.sessions || local.sessions || [],
        });
      }
    }
    return data;
  } catch {
    return null;
  }
}
