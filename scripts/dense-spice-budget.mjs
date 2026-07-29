/**
 * Dense SPICE / sample storage budget for HELIOS.
 *
 * Formula (Float32 LE xyz per body):
 *   bytes = nBodies * nSamples * 3 * 4
 *   nSamples ≈ spanYears * 365.25 * 1440 / stepMin + 1
 *
 * Run: node scripts/dense-spice-budget.mjs
 */
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function nSamples(spanYears, stepMin) {
  return Math.floor((spanYears * 365.25 * 24 * 60) / stepMin) + 1;
}

function miB(nBodies, spanYears, stepMin, bytesPer = 4) {
  const n = nSamples(spanYears, stepMin);
  return {
    n,
    bytes: nBodies * n * 3 * bytesPer,
    miB: (nBodies * n * 3 * bytesPer) / (1024 * 1024),
  };
}

/** Recommended product tiers for browser shipping. */
export const TIERS = {
  /** What HELIOS ships by default (fits classic Hosting cold-load). */
  A_browser: {
    label: 'Tier A — browser default (shipped)',
    target_miB: 20,
    packs: [
      { name: 'planets-de440s', nBodies: 8, spanY: 40, stepMin: 2880, note: '2 d DE440s JSON/binary' },
      { name: 'mars-moons-dense', nBodies: 2, spanY: 6, stepMin: 10, note: 'Phobos/Deimos 10 min SPICE' },
      { name: 'earth-moon-dense', nBodies: 1, spanY: 10, stepMin: 30, note: 'Luna 30 min SPICE' },
    ],
  },
  /** Optional download for major-moon planet-relative tours. */
  B_major_moons: {
    label: 'Tier B — major moons (lazy download)',
    target_miB: 80,
    packs: [
      { name: 'planets-1h-10y', nBodies: 8, spanY: 10, stepMin: 60, note: '1 h planets' },
      { name: 'mars-moons', nBodies: 2, spanY: 10, stepMin: 10, note: 'Phobos/Deimos 10 min' },
      { name: 'earth-moon', nBodies: 1, spanY: 10, stepMin: 15, note: 'Luna 15 min' },
      { name: 'galilean', nBodies: 4, spanY: 10, stepMin: 30, note: 'Io–Callisto 30 min' },
      { name: 'titan-triton', nBodies: 2, spanY: 10, stepMin: 60, note: 'outer moons 1 h' },
    ],
  },
  /** Local / desktop research, not browser-first. */
  C_research: {
    label: 'Tier C — research local',
    target_miB: 500,
    packs: [
      { name: 'planets-10min-20y', nBodies: 8, spanY: 20, stepMin: 10, note: 'dense planets' },
      { name: 'moons-30-10min-20y', nBodies: 30, spanY: 20, stepMin: 10, note: 'full HELIOS catalog' },
    ],
  },
  /** Full kernels on disk (not sampled tables). */
  D_live_kernels: {
    label: 'Tier D — live SPICE kernels (not tables)',
    note: 'de440s ~32 MiB + mar099s ~64 MiB + jup348 ~57 MiB + sat* hundreds of MiB → multi-GiB for all NAIF satellite SPKs. Browser does not load .bsp at runtime.',
    kernel_miB_approx: {
      de440s: 32,
      mar099s: 64,
      jup348: 57,
      sat459: 80,
      nep105: 201,
      all_naif_satellites_catalog: 15000,
    },
  },
};

export function tierSize(tier) {
  if (!tier.packs) return { miB: 0, packs: [] };
  let total = 0;
  const packs = tier.packs.map((p) => {
    const s = miB(p.nBodies, p.spanY, p.stepMin);
    total += s.miB;
    return { ...p, ...s };
  });
  return { miB: total, packs };
}

function main() {
  const lines = [];
  lines.push('# Dense SPICE storage budget (HELIOS)');
  lines.push('');
  lines.push('All table sizes assume **Float32 LE** parent-relative or heliocentric **xyz** (3 floats/sample).');
  lines.push('JSON text is ~2–3× larger than binary; prefer `.bin` for dense packs.');
  lines.push('');
  lines.push('## Formula');
  lines.push('```');
  lines.push('nSamples ≈ spanYears × 365.25 × 1440 / stepMinutes + 1');
  lines.push('bytes    = nBodies × nSamples × 3 × 4   (Float32)');
  lines.push('```');
  lines.push('');
  lines.push('## Cadence vs accuracy (rule of thumb)');
  lines.push('| Body class | Period class | Min samples/orbit | Typical step |');
  lines.push('|------------|--------------|-------------------|--------------|');
  lines.push('| Phobos | 7.7 h | ≥40 | **10 min** |');
  lines.push('| Deimos | 30 h | ≥40 | **30–45 min** (10 min safer) |');
  lines.push('| Luna | 27 d | ≥40 | **6–12 h** (30 min overkill OK) |');
  lines.push('| Galilean | 1.8–17 d | ≥40 | **30–60 min** |');
  lines.push('| Planets | months–years | cubic DE | **1–3 d** (2 d DE440s OK for km-class helio) |');
  lines.push('');
  lines.push('## Product tiers');
  lines.push('');
  for (const [id, tier] of Object.entries(TIERS)) {
    lines.push(`### ${tier.label} (\`${id}\`)`);
    if (tier.note) lines.push(tier.note);
    if (tier.kernel_miB_approx) {
      lines.push('| Kernel | ~MiB |');
      lines.push('|--------|------|');
      for (const [k, v] of Object.entries(tier.kernel_miB_approx)) {
        lines.push(`| ${k} | ${v} |`);
      }
      lines.push('');
      continue;
    }
    const { miB: total, packs } = tierSize(tier);
    lines.push(`**Total ≈ ${total.toFixed(1)} MiB** (target ≤ ${tier.target_miB} MiB)`);
    lines.push('');
    lines.push('| Pack | bodies | span | step | n | MiB | note |');
    lines.push('|------|--------|------|------|---|-----|------|');
    for (const p of packs) {
      lines.push(
        `| ${p.name} | ${p.nBodies} | ${p.spanY} y | ${p.stepMin} min | ${p.n} | ${p.miB.toFixed(2)} | ${p.note || ''} |`,
      );
    }
    lines.push('');
  }
  lines.push('## Full solar system answers (sampled tables, not live .bsp)');
  lines.push('');
  lines.push('| Scope | Span | Step | Approx size |');
  lines.push('|-------|------|------|-------------|');
  const rows = [
    ['8 planets only', 40, 2880, 8],
    ['8 planets only', 40, 60, 8],
    ['8 planets only', 40, 10, 8],
    ['8 planets + 10 major moons', 10, 30, 18],
    ['8 planets + 10 major moons', 10, 10, 18],
    ['8 planets + 30 moons (HELIOS catalog)', 10, 10, 38],
    ['8 planets + 30 moons', 20, 10, 38],
    ['8 planets + 30 moons @ 1 min', 40, 1, 38],
  ];
  for (const [label, y, step, nb] of rows) {
    const s = miB(nb, y, step);
    lines.push(`| ${label} | ${y} y | ${step} min | **${s.miB.toFixed(1)} MiB** |`);
  }
  lines.push('');
  lines.push('### Bottom line');
  lines.push('');
  lines.push('- **Browser-shipped dense SPICE (Tier A): ~10–25 MiB** — enough for planets (DE 2 d) + Mars moons (10 min) + Luna (30 min).');
  lines.push('- **Major-moon tours (Tier B lazy): ~50–80 MiB** — add Galileans + Titan/Triton at 15–60 min over 10 y.');
  lines.push('- **“All catalog @ 10 min for 20 y”: ~0.45 GiB** binary — too large for default SPA cold-load; use lazy packs or local.');
  lines.push('- **1-minute full catalog 40 y: ~9 GiB** binary — research/desktop only.');
  lines.push('- **Live NAIF kernels for all satellites: multi-GiB to tens of GiB** — not for in-browser `.bsp` load.');
  lines.push('');
  lines.push('Generated by `node scripts/dense-spice-budget.mjs`.');

  const md = lines.join('\n');
  const out = resolve(ROOT, 'docs/dense-spice-storage-budget.md');
  writeFileSync(out, md);
  console.log(md);
  console.log(`\nWrote ${out}`);
}

main();
