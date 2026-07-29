import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Fallback static file server for /js/* when the App Hosting adapter
 * fails to expose public/ (observed 404s on main.js).
 */
const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function contentType(file: string) {
  const i = file.lastIndexOf('.');
  const ext = i >= 0 ? file.slice(i).toLowerCase() : '';
  return MIME[ext] || 'application/octet-stream';
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await ctx.params;
  if (!parts?.length) {
    return new NextResponse('Not found', { status: 404 });
  }
  // Prevent path traversal
  if (parts.some((p) => p === '..' || p.includes('\\') || p.includes('\0'))) {
    return new NextResponse('Bad path', { status: 400 });
  }
  const filePath = join(process.cwd(), 'public', 'js', ...parts);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return new NextResponse(`Missing ${parts.join('/')}`, { status: 404 });
  }
  const buf = readFileSync(filePath);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType(filePath),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
