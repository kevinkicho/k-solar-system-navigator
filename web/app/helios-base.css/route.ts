import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

/** Explicit route so /helios-base.css is never a static 404 on App Hosting. */
export async function GET() {
  const filePath = join(process.cwd(), 'public', 'helios-base.css');
  if (!existsSync(filePath)) {
    return new NextResponse('/* helios-base.css missing — run prepare:spa */', {
      status: 404,
      headers: { 'Content-Type': 'text/css' },
    });
  }
  return new NextResponse(readFileSync(filePath), {
    status: 200,
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
