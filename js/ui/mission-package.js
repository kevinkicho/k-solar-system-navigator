/**
 * Mission package export — JSON + path CSV + human brief (+ OEM if OPS).
 * Preliminary analysis deliverables — not certified flight products.
 */
import { state } from '../state.js';
import { DAY } from '../constants.js';
import { buildPlanObject } from './mission-export.js';
import { buildPathCsv } from './path-export.js';
import {
  buildEducationalOem, lightTimeSummary, opsDisclaimer,
} from '../physics/flight-ops.js';
import { buildTransferPathSamples } from '../physics/transfer-path.js';
import { formatVelocity } from './format.js';

function downloadBlob(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function baseName(td) {
  const o = (td.body1?.name || 'origin').replace(/\s+/g, '-');
  const d = (td.body2?.name || 'dest').replace(/\s+/g, '-');
  const day = new Date().toISOString().slice(0, 10);
  return `helios-package-${o}-to-${d}-${day}`;
}

/**
 * Human-readable mission brief (Markdown).
 */
export function buildMissionBrief(td) {
  const plan = buildPlanObject(td);
  const dossier = td.dossier || plan.dossier || null;
  const s = plan.summary || {};
  const need = plan.measurement?.need || {};
  const gates = dossier?.gates || [];
  const lines = [
    `# HELIOS Mission Brief`,
    ``,
    `**Product class:** Preliminary mission design workstation — **not flight-certified**, not range safety, not SpaceX performance warranty.`,
    ``,
    `Generated: ${plan.generated_at}`,
    `Fidelity: ${plan.methodology?.fidelity || state.fidelityLevel || '—'}`,
    `Ephemeris backend: ${plan.methodology?.ephemeris_backend || '—'}`,
    ``,
    `## Route`,
    `- Origin: **${s.origin || td.body1?.name || '—'}**`,
    `- Destination: **${s.destination || td.body2?.name || '—'}**`,
    `- Departure (UTC): ${s.departure_utc || '—'}`,
    `- Arrival (UTC): ${s.arrival_utc || '—'}`,
    `- Transit: ${s.transit_days != null ? `${Number(s.transit_days).toFixed(1)} d` : (td.transferTime != null ? `${(td.transferTime / DAY).toFixed(1)} d` : '—')}`,
    ``,
    `## Need / geometry`,
    `- Need Δv: ${need.need_dv_m_s != null ? formatVelocity(need.need_dv_m_s) : '—'}`,
    `- C₃: ${need.c3_m2_s2 != null ? `${(need.c3_m2_s2 / 1e6).toFixed(3)} km²/s²` : '—'}`,
    `- V∞ dep: ${need.vinf_dep_m_s != null ? formatVelocity(need.vinf_dep_m_s) : '—'}`,
    `- V∞ arr: ${need.vinf_arr_m_s != null ? formatVelocity(need.vinf_arr_m_s) : '—'}`,
    ``,
    `## Vehicle`,
    `- Id: ${plan.vehicle?.id || state.vehicleId}`,
    `- Architecture: ${plan.vehicle?.starshipArch || state.starshipArch || '—'}`,
    `- Cargo: ${state.cargoMass_kg ?? 0} kg`,
    ``,
    `## GO / NO-GO`,
    `- Status: **${dossier?.status || '—'}**`,
    `- Mission ready: ${dossier?.mission_ready ? 'YES' : 'NO'}`,
    `- Fly study enabled: ${(dossier?.launch_enabled ?? dossier?.mission_ready) ? 'YES' : 'NO'}`,
    `- Completeness confidence: ${dossier?.confidence_0_100 ?? '—'} (analysis completeness, not OD covariance)`,
    ``,
    `## Gates`,
  ];
  if (!gates.length) {
    lines.push(`- (none recorded)`);
  } else {
    for (const g of gates) {
      const msg = g.message || g.title || g.detail || '';
      lines.push(`- \`${g.level}\` **${g.code}** — ${msg}`);
    }
  }
  if (state.flightOpsMode) {
    const lt = lightTimeSummary(td);
    lines.push(``, `## Ops review`, `- ${opsDisclaimer()}`);
    if (lt) {
      lines.push(`- Light-time (dep r): ${lt.lt_dep_label}`, `- Light-time (arr r): ${lt.lt_arr_label}`);
    }
  }
  lines.push(
    ``,
    `## Methodology`,
    `- ${plan.methodology?.ephemeris || '—'}`,
    `- ${plan.methodology?.transfer || '—'}`,
    `- ${plan.methodology?.disclaimer || '—'}`,
    ``,
    `---`,
    `*HELIOS Mission Package — browser-first preliminary analysis.*`,
    ``,
  );
  return lines.join('\n');
}

/**
 * Sequential multi-file download (no zip dependency).
 */
export async function exportMissionPackage(td) {
  if (!td) {
    const { notify } = await import('./format.js');
    notify('COMPUTE A TRAJECTORY FIRST');
    return;
  }
  const base = baseName(td);
  const plan = buildPlanObject(td);
  downloadBlob(`${base}.json`, JSON.stringify(plan, null, 2), 'application/json');
  await sleep(120);

  try {
    const csv = buildPathCsv(td);
    if (csv) {
      downloadBlob(`${base}-path.csv`, csv, 'text/csv');
      await sleep(120);
    }
  } catch { /* path export optional */ }

  downloadBlob(`${base}-brief.md`, buildMissionBrief(td), 'text/markdown');
  await sleep(120);

  if (state.flightOpsMode) {
    let samples = [];
    try {
      const built = buildTransferPathSamples(td, {
        geometry: 'physical',
        exaggerate: false,
        nSamples: 121,
        offsetPolicy: state.pathOffsetPolicy || 'time_varying',
      });
      samples = (built.points || []).map((p, i, arr) => ({
        t: td.departureSimTime + (td.transferTime || 0) * (arr.length > 1 ? i / (arr.length - 1) : 0),
        x: p.x, y: p.y, z: p.z,
      }));
    } catch { /* */ }
    downloadBlob(`${base}-oem-like.txt`, buildEducationalOem(td, samples), 'text/plain');
  }

  const { notify } = await import('./format.js');
  notify('MISSION PACKAGE EXPORTED · PRELIMINARY ANALYSIS');
}
