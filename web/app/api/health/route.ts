import { NextResponse } from 'next/server';

/**
 * App Hosting health + product-class probe (SSR/API route).
 * Used for ops checks; does not expose secrets.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'helios-mission-design',
    host: 'firebase-app-hosting',
    product_class: 'preliminary-not-flight-certified',
    timestamp: new Date().toISOString(),
    features: {
      spa: true,
      ssr_shell: true,
      classroom_offline: true,
      note: 'Planning physics run in the browser; server provides SSR shell + future plan jobs.',
    },
  });
}
