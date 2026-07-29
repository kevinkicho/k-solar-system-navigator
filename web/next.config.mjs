import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do NOT use output:'standalone' on Firebase App Hosting — the framework
  // adapter serves public/ for Next; standalone often drops large SPA assets.
  // Monorepo: pin tracing to web/ (avoid picking parent lockfiles)
  outputFileTracingRoot: join(__dirname),
  // HELIOS SPA assets live under public/ (copied from repo root on build)
  reactStrictMode: true,
  // Large ephemeris JSON + stars must not be excluded from the server bundle
  outputFileTracingIncludes: {
    '/**': [
      './public/**/*',
    ],
  },
  experimental: {
    largePageDataBytes: 16 * 1024 * 1024,
  },
  async headers() {
    return [
      {
        source: '/assets/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      {
        source: '/js/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      {
        source: '/css/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      {
        source: '/helios-base.css',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ];
  },
};

export default nextConfig;
