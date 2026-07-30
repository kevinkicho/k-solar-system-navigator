import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

/**
 * App Hosting dense SPICE catalog.
 * Serves local public/assets/dense-spk/registry.json and optional cloud Function index.
 *
 * GET /api/ephemeris/dense-spk
 */
export async function GET() {
  const regPath = join(process.cwd(), 'public', 'assets', 'dense-spk', 'registry.json');
  let local: Record<string, unknown> | null = null;
  if (existsSync(regPath)) {
    try {
      local = JSON.parse(readFileSync(regPath, 'utf8'));
    } catch {
      local = null;
    }
  }

  // Best-effort live Function catalog (Storage listing / RTDB seed status)
  let cloud: unknown = null;
  try {
    const res = await fetch(
      'https://us-central1-k-solar-system-navigator.cloudfunctions.net/denseSpkCatalog',
      { next: { revalidate: 300 } },
    );
    if (res.ok) cloud = await res.json();
  } catch {
    cloud = null;
  }

  const registryVersion = local && typeof local === 'object' && 'version' in local
    ? (local as { version?: number }).version
    : null;
  const packCount = local && Array.isArray((local as { packs?: unknown[] }).packs)
    ? (local as { packs: unknown[] }).packs.length
    : 0;

  return NextResponse.json({
    ok: true,
    product_class: 'preliminary-not-flight-certified',
    product_grade: 'industrial-preliminary',
    endpoint: '/api/ephemeris/dense-spk',
    pack_files: '/api/ephemeris/dense-spk/{packId}.bin|.meta.json',
    registry_version: registryVersion,
    pack_count: packCount,
    local_registry: local,
    cloud_catalog: cloud,
    note:
      'Tier A packs load with the SPA; Tier B packs lazy-load. '
      + 'Prefer same-origin App Hosting API, then Firebase Storage, then static Hosting.',
  });
}
