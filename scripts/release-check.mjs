/**
 * Release checklist for HELIOS.
 *
 *   npm run release:check           # full CI mirror (precommit)
 *   npm run release:check -- --live # + production live smoke
 *
 * Exit non-zero on any failure.
 */
import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const wantLive = args.includes('--live') || process.env.RELEASE_LIVE === '1';

function run(label, cmd, cmdArgs) {
  console.log(`\n━━━ ${label} ━━━`);
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${r.status ?? 'null'})`);
    process.exit(r.status || 1);
  }
  console.log(`✓ ${label}`);
}

console.log('HELIOS release check');
console.log(`  live smoke: ${wantLive ? 'yes' : 'no (pass --live)'}`);

run('1. Full CI mirror (precommit)', 'npm', ['run', 'precommit']);

if (wantLive) {
  run('2. Production live smoke', 'npm', ['run', 'smoke:live']);
  run('3. Dual-surface build-sha smoke', 'npm', ['run', 'smoke:build-sha']);
} else {
  console.log('\n··· skip live smoke (use --live or RELEASE_LIVE=1) ···');
}

console.log(`
━━━ RELEASE CHECK PASSED ━━━
Next (manual):
  • git push origin main  → confirm GitHub Actions green
  • npm run deploy:hosting and/or deploy:apphosting if SPA assets changed
  • npm run smoke:live after deploy
`);
