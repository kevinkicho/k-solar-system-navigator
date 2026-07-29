/**
 * Upload dense SPICE packs to Firebase Storage + seed RTDB/Firestore catalog.
 *
 * Requires Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS
 * pointing at a service-account JSON for project k-solar-system-navigator.
 *
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="path\to\sa.json"
 *   node scripts/upload-dense-spk-firebase.mjs
 *
 * Paths written:
 *   gs://…/ephemeris/dense-spk/*
 *   RTDB  public/denseSpk/registry
 *   Firestore helios/denseSpkCatalog
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACK_DIR = resolve(ROOT, 'assets/dense-spk');
const PREFIX = 'ephemeris/dense-spk';

async function main() {
  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    console.error('firebase-admin not installed (devDependency). npm i');
    process.exit(1);
  }

  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        storageBucket: 'k-solar-system-navigator.firebasestorage.app',
        databaseURL: 'https://k-solar-system-navigator-default-rtdb.firebaseio.com',
      });
    } catch (err) {
      console.error(
        'Admin init failed. Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON.\n',
        err.message || err,
      );
      process.exit(1);
    }
  }

  const bucket = admin.storage().bucket();
  const files = readdirSync(PACK_DIR).filter((f) =>
    f.endsWith('.bin') || f.endsWith('.json'),
  );
  if (!files.length) {
    console.error('No packs in', PACK_DIR);
    process.exit(1);
  }

  console.log(`Uploading ${files.length} files to gs://${bucket.name}/${PREFIX}/`);
  for (const name of files) {
    const local = join(PACK_DIR, name);
    const dest = `${PREFIX}/${name}`;
    const contentType = name.endsWith('.json')
      ? 'application/json'
      : 'application/octet-stream';
    await bucket.upload(local, {
      destination: dest,
      metadata: {
        contentType,
        cacheControl: 'public,max-age=86400',
        metadata: { product: 'helios-dense-spk', educational: 'true' },
      },
    });
    // Make publicly readable via token-less URL if bucket allows (rules grant read)
    console.log('  uploaded', dest, `(${(readFileSync(local).length / 1024 / 1024).toFixed(2)} MiB)`);
  }

  const regPath = join(PACK_DIR, 'registry.json');
  if (!existsSync(regPath)) {
    console.warn('No registry.json — skip catalog seed');
    return;
  }
  const registry = JSON.parse(readFileSync(regPath, 'utf8'));
  registry.updatedAt = Date.now();
  registry.storage_prefix = PREFIX;
  registry.delivery = ['firebase-storage', 'hosting-fallback'];
  registry.product_class = 'preliminary-not-flight-certified';

  // RTDB public catalog
  try {
    await admin.database().ref('public/denseSpk/registry').set(registry);
    console.log('RTDB public/denseSpk/registry written');
  } catch (err) {
    console.warn('RTDB seed failed', err.message || err);
  }

  // Firestore catalog
  try {
    await admin.firestore().doc('helios/denseSpkCatalog').set(registry, { merge: true });
    console.log('Firestore helios/denseSpkCatalog written');
  } catch (err) {
    console.warn('Firestore seed failed', err.message || err);
  }

  console.log('Done. Clients with Firebase enabled will prefer Storage CDN packs.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
