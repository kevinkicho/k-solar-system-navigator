import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import HeliosClientBoot from './HeliosClientBoot';

/**
 * SSR entry for Firebase App Hosting.
 * Server renders the HELIOS DOM shell (product class visible without JS);
 * client boot loads the existing ESM SPA (Three.js + planning physics).
 */
export default function HomePage() {
  const bodyPath = join(process.cwd(), 'public', 'helios-body.html');
  let bodyHtml = '';
  if (existsSync(bodyPath)) {
    bodyHtml = readFileSync(bodyPath, 'utf8');
  } else {
    bodyHtml = `
      <div style="padding:24px;font-family:monospace;color:#c5d0dc">
        <h1>HELIOS Mission Design</h1>
        <p>SPA assets not prepared. Run <code>npm run prebuild</code> in <code>web/</code>.</p>
        <p><a href="/spa.html" style="color:#4db8d9">Static SPA fallback</a></p>
      </div>`;
  }

  return (
    <>
      <div className="helios-ssr-banner" role="status">
        <strong>HELIOS</strong>
        {' · '}
        Preliminary mission design · Not flight-certified · Not range safety
        {' · '}
        App Hosting SSR shell
      </div>
      <div
        className="helios-root"
        // HELIOS vanilla DOM — not React-managed after boot
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      <HeliosClientBoot />
    </>
  );
}
