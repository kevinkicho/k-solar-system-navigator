import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bin': 'application/octet-stream',
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await ctx.params;
  if (!parts?.length || parts.some((p) => p === '..' || p.includes('\\'))) {
    return new NextResponse('Not found', { status: 404 });
  }
  const filePath = join(process.cwd(), 'public', 'assets', ...parts);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return new NextResponse('Not found', { status: 404 });
  }
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  const buf = readFileSync(filePath);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
