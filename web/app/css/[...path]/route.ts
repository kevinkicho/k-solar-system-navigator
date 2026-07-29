import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await ctx.params;
  if (!parts?.length || parts.some((p) => p === '..' || p.includes('\\'))) {
    return new NextResponse('Not found', { status: 404 });
  }
  const filePath = join(process.cwd(), 'public', 'css', ...parts);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return new NextResponse('Not found', { status: 404 });
  }
  const buf = readFileSync(filePath);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
