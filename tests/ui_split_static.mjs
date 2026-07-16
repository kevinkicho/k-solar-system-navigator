// Static checks for PR 17 UI/CSS split — no browser required.
// Verifies css/app.css is linked, re-exports stay stable, and export path is static.

import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

const indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const routeDisplay = readFileSync(resolve(ROOT, 'js/ui/route-display.js'), 'utf8');
const missionExport = readFileSync(resolve(ROOT, 'js/ui/mission-export.js'), 'utf8');
const missionBudgetUi = readFileSync(resolve(ROOT, 'js/ui/mission-budget-ui.js'), 'utf8');

console.log('\n━━━ UI SPLIT STATIC ━━━');

ok(existsSync(resolve(ROOT, 'css/app.css')), 'css/app.css exists');
const cssLink = /<link\s+rel=["']stylesheet["']\s+href=["'](?:\.\/)?css\/app\.css["']\s*\/?>/i;
ok(cssLink.test(indexHtml), 'index.html links css/app.css');
// PR17: fully external CSS. PR18: base chrome may remain inline if app.css
// loads *after* </style> so mobile/reduced-motion overrides win the cascade.
const styleIdx = indexHtml.search(/<style[\s>]/i);
const linkIdx = indexHtml.search(cssLink);
if (styleIdx >= 0) {
  ok(linkIdx > styleIdx, 'css/app.css link is after inline <style> (cascade-safe)');
} else {
  ok(true, 'index.html has no inline <style> block (fully extracted)');
}

ok(
  /export\s*\{\s*updateTransferOrbitVisual\s*\}\s*from\s*['"]\.\/route-orbit-visual\.js['"]/.test(routeDisplay),
  'route-display re-exports updateTransferOrbitVisual',
);
ok(
  /export\s*\{\s*requiredDeltaV\s*,\s*transferBudgetNow\s*\}\s*from\s*['"]\.\/mission-budget-ui\.js['"]/.test(routeDisplay),
  'route-display re-exports requiredDeltaV, transferBudgetNow',
);
ok(
  /import\s*\{\s*exportMissionPlan\s*\}\s*from\s*['"]\.\/mission-export\.js['"]/.test(routeDisplay),
  'route-display statically imports exportMissionPlan',
);
ok(
  /import\s*\{\s*requiredDeltaV\s*,\s*transferBudgetNow\s*\}\s*from\s*['"]\.\/mission-budget-ui\.js['"]/.test(missionExport),
  'mission-export imports budget helpers from mission-budget-ui',
);
ok(
  /export\s+function\s+requiredDeltaV/.test(missionBudgetUi) &&
  /export\s+function\s+transferBudgetNow/.test(missionBudgetUi),
  'mission-budget-ui defines requiredDeltaV + transferBudgetNow',
);
ok(
  existsSync(resolve(ROOT, 'js/ui/route-orbit-visual.js')),
  'route-orbit-visual.js exists',
);
ok(
  existsSync(resolve(ROOT, 'js/ui/mission-export.js')),
  'mission-export.js exists',
);

if (failed > 0) {
  console.error(`\n${failed} static UI-split check(s) failed`);
  process.exit(1);
}
console.log('\nAll UI-split static checks passed');
