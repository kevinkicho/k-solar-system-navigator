/**
 * Seed a demo Earth→Mars cloud plan for the first Auth user (Admin SDK).
 * Usage: npm run firebase:seed
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const keyPath = resolve(ROOT, 'k-solar-system-navigator-firebase-adminsdk-fbsvc-da69f3a5d4.json');

if (!existsSync(keyPath)) {
  console.error('Missing Admin SDK JSON at', keyPath);
  process.exit(1);
}

const require = createRequire(import.meta.url);
let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('npm i -D firebase-admin first');
  process.exit(1);
}

const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    databaseURL: `https://${sa.project_id}-default-rtdb.firebaseio.com`,
    storageBucket: `${sa.project_id}.firebasestorage.app`,
  });
}

const auth = admin.auth();
const db = admin.firestore();
const rtdb = admin.database();

const listed = await auth.listUsers(1);
const user = listed.users[0];
if (!user) {
  console.error('No Auth users — sign in once on the live site first.');
  process.exit(1);
}

const uid = user.uid;
const planId = `seed_earth_mars_${Date.now().toString(36)}`;
const now = admin.firestore.FieldValue.serverTimestamp();
const plan = {
  schema_version: 2,
  kind: 'helios_plan_summary',
  title: 'Earth → Mars (seed)',
  label: 'Earth → Mars',
  originId: 'earth',
  destId: 'mars',
  originName: 'Earth',
  destName: 'Mars',
  departure_utc: '2026-11-15T12:00:00.000Z',
  arrival_utc: '2027-08-01T12:00:00.000Z',
  tof_days: 259,
  need_dv_m_s: 5600,
  isMultiLeg: false,
  vehicleId: 'sh-starship',
  display_mode: 'cinematic',
  map_mode: false,
  lambertOk: true,
  ownerUid: uid,
  notes: 'Admin-seeded demo plan for migration verify',
  createdAt: now,
  updatedAt: now,
  updatedAtMs: Date.now(),
  plan_request: {
    v: 2,
    o: 'earth',
    d: 'mars',
    dep: '2026-11-15',
    tof: 259,
    veh: 'sh-starship',
    ab: 8000,
    basis: 'helio',
    view: 'cinematic',
    cargo: 0,
    arch: 'unrefueled',
  },
};

await db.collection('users').doc(uid).set({
  email: user.email || null,
  displayName: user.displayName || null,
  lastLoginAt: now,
  app: 'helios',
}, { merge: true });

await db.collection('users').doc(uid).collection('plans').doc(planId).set(plan);
await db.collection('users').doc(uid).collection('prefs').doc('settings').set({
  schema_version: 1,
  vehicleId: 'sh-starship',
  last_plan_id: planId,
  updatedAt: now,
  ownerUid: uid,
}, { merge: true });

await rtdb.ref(`users/${uid}/lastRoute`).set({
  o: 'earth',
  d: 'mars',
  dep: '2026-11-15',
  tof: 259,
  veh: 'sh-starship',
  label: 'Earth → Mars',
  at: Date.now(),
});

console.log('Seeded plan for', user.email || uid);
console.log('  planId:', planId);
console.log('  path: users/' + uid + '/plans/' + planId);
console.log('Open https://k-solar-system-navigator.web.app → Plan → Cloud plans');
process.exit(0);
