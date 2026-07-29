import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Serve dense SPICE pack files from App Hosting public assets.
 * Path: /api/ephemeris/dense-spk/{file}
 * Also works as proxy path for clients that prefer same-origin over Storage CDN.
 */
const MIME: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.bin': 'application/octet-stream',
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await ctx.params;
  if (!parts?.length || parts.some((p) => p === '..' || p.includes('\\') || p.includes('/'))) {
    return new NextResponse('Not found', { status: 404 });
  }
  // Only allow known pack extensions
  const name = parts.join('/');
  if (!/\.(bin|json)$/i.test(name) || name.includes('..')) {
    return new NextResponse('Not found', { status: 404 });
  }

  const filePath = join(process.cwd(), 'public', 'assets', 'dense-spk', ...parts);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return new NextResponse('Not found', { status: 404 });
  }
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  const buf = readFileSync(filePath);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
      'X-Helios-Dense-Source': 'apphosting-public',
    },
  });
}
