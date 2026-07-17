// Runs the offline physics suite (no browser install required).
// Exit non-zero if any child fails.

import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SUITE = [
  'tests/trip_planning_test.mjs',
  'tests/verify_fix.mjs',
  'tests/module_integration.mjs',
  'tests/ephemeris_check.mjs',
  'tests/horizons_mock.mjs',
  'tests/porkchop_sim.mjs',
  'tests/gravity_assist_sim.mjs',
  'tests/flyby_optimizer.mjs',
  'tests/spacecraft_check.mjs',
  'tests/visual_alignment.mjs',
  'tests/sun_wobble.mjs',
  'tests/lambert_both_branches.mjs',
  'tests/vehicles_presets.mjs',
  'tests/need_calculator.mjs',
  'tests/capability_margin.mjs',
  'tests/catalog_check.mjs',
  'tests/share_codec.mjs',
  'tests/mission_import_check.mjs',
  'tests/ml_window_seeds.mjs',
  'tests/vehicle_ui_regression.mjs',
  'tests/porkchop_cargo.mjs',
  'tests/approx_error_table.mjs',
  'tests/ephemeris_provider.mjs',
  'tests/ephemeris_fixtures.mjs',
  'tests/vehicle_performance.mjs',
  'tests/plan_quality.mjs',
  'tests/departure_asymptote.mjs',
  'tests/ascent_loss_model.mjs',
  'tests/scenario_gate_audit.mjs',
  'tests/nearest_feasible.mjs',
  'tests/multi_leg_window.mjs',
  // Soft / informational only (always exits 0) — PR 18 perf budgets.
  'tests/porkchop_refine.mjs',
  'tests/ui_split_static.mjs',
  'tests/body_picker_dossier.mjs',
  'tests/surface_point.mjs',
  'tests/perf_budgets.mjs',
];

let failed = 0;
for (const rel of SUITE) {
  console.log(`\n▶ ${rel}`);
  const r = spawnSync(process.execPath, [rel], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    failed++;
    console.error(`✗ ${rel} exited ${r.status}`);
  } else {
    console.log(`✓ ${rel}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${SUITE.length} physics tests failed`);
  process.exit(1);
}
console.log(`\nAll ${SUITE.length} physics tests passed`);
