/**
 * Local Admin SDK smoke test (never runs in browser / Hosting).
 * Usage:
 *   node scripts/firebase-admin-smoke.mjs
 *   node scripts/firebase-admin-smoke.mjs path/to/serviceAccount.json
 *
 * Requires: npm i -D firebase-admin  (devDependency)
 * Service account JSON is gitignored.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_KEY = resolve(ROOT, 'k-solar-system-navigator-firebase-adminsdk-fbsvc-da69f3a5d4.json');
const keyPath = resolve(process.argv[2] || DEFAULT_KEY);

if (!existsSync(keyPath)) {
  console.error('Service account JSON not found:', keyPath);
  process.exit(1);
}

let admin;
try {
  const require = createRequire(import.meta.url);
  admin = require('firebase-admin');
} catch {
  console.error('Install firebase-admin first: npm i -D firebase-admin');
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

const db = admin.firestore();
const auth = admin.auth();

console.log('Project:', sa.project_id);
console.log('Client:', sa.client_email);

const users = await auth.listUsers(5);
console.log('Auth users (sample):', users.users.length, users.users.map((u) => u.email || u.uid));

// Count plan docs under first user if any
if (users.users[0]) {
  const uid = users.users[0].uid;
  const plans = await db.collection('users').doc(uid).collection('plans').limit(5).get();
  console.log(`Firestore plans for ${uid}:`, plans.size);
  plans.docs.forEach((d) => {
    const x = d.data();
    console.log(' -', d.id, x.label || x.title || '', x.schema_version);
  });
}

console.log('Admin smoke: OK');
process.exit(0);
