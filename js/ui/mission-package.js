/**
 * Mission package export — JSON + path CSV + human brief (+ OEM if OPS).
 * Preliminary analysis deliverables — not certified flight products.
 */
import { state } from '../state.js';
import { DAY } from '../constants.js';
import { buildPlanObject } from './mission-export.js';
import { buildPathCsv } from './path-export.js';
import {
  buildEducationalOem, lightTimeSummary, opsDisclaimer} from '../physics/flight-ops.js';
import { buildTransferPathSamples } from '../physics/transfer-path.js';
import { formatVelocity } from './format.js';
import { bodyId } from '../data/catalog.js';
import { encodePlanRequestObject, padDate } from './share-codec.js';

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
 * Share hash for classroom handouts (recomputes geometry on open).
 * Uses share-codec only — avoid import cycle with share.js / route-display.
 * @param {object} td
 * @returns {string|null}
 */
export function packageShareHash(td) {
  try {
    if (!td?.body1 || !td?.body2) return null;
    const depSim = td.departureSimTime;
    if (depSim == null) return null;
    const depDate = new Date(depSim * 1000 + Date.UTC(2000, 0, 1, 12));
    const isMulti = !!td.isMultiLeg || (state.flybys && state.flybys.length > 0);
    const plan = {
      o: bodyId(td.body1) || td.body1.name?.toLowerCase(),
      d: bodyId(td.body2) || td.body2.name?.toLowerCase(),
      dep: padDate(depDate),
      veh: state.vehicleId || 'sh-starship',
      ab: state.abstractBudget_m_s,
      basis: isMulti ? 'helio' : (state.costBasis || 'helio'),
      view: state.display?.mode || 'cinematic'};
    if (!isMulti && td.transferTime != null) {
      plan.tof = Math.round(td.transferTime / DAY);
    }
    if (state.vehicleId === 'sh-starship' && state.starshipArch) plan.arch = state.starshipArch;
    if (state.cargoMass_kg > 0) plan.cargo = state.cargoMass_kg;
    if (state.ephemerisBackend === 'sample-de' ) plan.eph = 'sample';
    if (state.flybys?.length && td.isMultiLeg) {
      plan.fb = state.flybys.slice(0, 6).map((f) => ({
        id: f.bodyId || (f.bodyName || '').toLowerCase(),
        date: padDate(new Date(f.simTime * 1000 + Date.UTC(2000, 0, 1, 12)))})).filter((f) => f.id && f.date);
    }
    return encodePlanRequestObject(plan);
  } catch {
    return null;
  }
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
  const shareHash = packageShareHash(td);
  const lines = [
    `# HELIOS Mission Brief`,
    ``,
    `**Product class:** Preliminary mission design workstation — **not flight-certified**, not range safety, not SpaceX performance warranty.`,
    ``,
    `Generated: ${plan.generated_at}`,
    `Fidelity: ${plan.methodology?.fidelity || state.fidelityLevel || '—'}`,
    `Ephemeris backend: ${plan.methodology?.ephemeris_backend || '—'}`,
  ];
  if (shareHash) lines.push(`Share hash (recompute on open): \`${shareHash}\``);
  lines.push(
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
    `## READY / NO-GO (analysis completeness)`,
    `- Status: **${dossier?.status || '—'}**`,
    `- Mission ready (analysis): ${dossier?.mission_ready ? 'YES' : 'NO'}`,
    `- Fly study enabled: ${(dossier?.launch_enabled ?? dossier?.mission_ready) ? 'YES' : 'NO'}`,
    `- Completeness confidence: ${dossier?.confidence_0_100 ?? '—'} (analysis completeness, not OD covariance)`,
    ``,
    `## Gates`,
  );
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
  const shareHash = packageShareHash(td);
  // Classroom handout manifest — lists sibling files + share hash
  const manifest = {
    product: 'HELIOS Mission Package',
    product_class: 'preliminary-not-flight-certified',
    generated_at: plan.generated_at,
    fidelity: plan.methodology?.fidelity || state.fidelityLevel,
    ephemeris_backend: plan.methodology?.ephemeris_backend,
    share_hash: shareHash,
    files: [
      `${base}.json`,
      `${base}-path.csv`,
      `${base}-brief.md`,
      `${base}-manifest.json`,
    ],
    note: 'Open share_hash on HELIOS to recompute geometry. Never trust stored Δv alone.'};
  if (state.flightOpsMode) manifest.files.push(`${base}-oem-like.txt`);

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

  downloadBlob(`${base}-manifest.json`, JSON.stringify(manifest, null, 2), 'application/json');
  await sleep(120);

  if (state.flightOpsMode) {
    let samples = [];
    try {
      const built = buildTransferPathSamples(td, {
        geometry: 'physical',
        exaggerate: false,
        nSamples: 121,
        offsetPolicy: state.pathOffsetPolicy || 'time_varying'});
      samples = (built.points || []).map((p, i, arr) => ({
        t: td.departureSimTime + (td.transferTime || 0) * (arr.length > 1 ? i / (arr.length - 1) : 0),
        x: p.x, y: p.y, z: p.z}));
    } catch { /* */ }
    downloadBlob(`${base}-oem-like.txt`, buildEducationalOem(td, samples), 'text/plain');
  }

  const { notify } = await import('./format.js');
  notify('MISSION PACKAGE EXPORTED · PRELIMINARY ANALYSIS');
}

/**
 * Stakeholder package v2 — brief + family calendar + architecture matrix + residuals + pins.
 * Downloads additional markdown artifact alongside standard package.
 */
export async function exportStakeholderPackage(td) {
  if (!td) {
    const { notify } = await import('./format.js');
    notify('COMPUTE A TRAJECTORY FIRST');
    return;
  }
  await exportMissionPackage(td);

  const { clusterWindowFamilies, formatFamilyCalendar } = await import('../physics/window-families.js');
  const { buildArchitectureMatrix } = await import('../physics/architecture-matrix.js');
  const { buildResidualDashboard } = await import('../physics/residual-dashboard.js');
  const { getPlanPins } = await import('../physics/plan-pins.js');
  const { needWithDsmSketch } = await import('../physics/dsm-nodes.js');

  const base = baseName(td);
  const fam = state.windowFamilies
    || (state.windowShortlist ? clusterWindowFamilies(state.windowShortlist) : null);
  const need = td.dossier?.need || null;
  const matrix = state.architectureMatrix
    || (need ? buildArchitectureMatrix(need, {
      cargoMass_kg: state.cargoMass_kg,
      originBody: state.routeOrigin,
    }) : null);
  const residual = buildResidualDashboard(td, state);
  const pins = getPlanPins();
  const dsm = needWithDsmSketch(
    need?.need_dv_m_s ?? td.dvTotal_lambert ?? null,
    state.dsmNodes || [],
  );

  const lines = [
    `# HELIOS Stakeholder Package v2`,
    ``,
    `**Product class:** Preliminary mission design — **not flight-certified**, not range safety, not SpaceX performance warranty.`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Build context: route ${td.body1?.name || '?'} → ${td.body2?.name || '?'}`,
    ``,
    `## Executive triad`,
    `- Need: ${need?.need_dv_m_s != null ? formatVelocity(need.need_dv_m_s) : '—'}`,
    `- Status: ${td.dossier?.status || '—'} · analysis-ready: ${td.dossier?.mission_ready ? 'YES' : 'NO'}`,
    ``,
    `## Window families (local shortlist clusters)`,
  ];
  if (fam?.families?.length) {
    for (const line of formatFamilyCalendar(fam)) lines.push(`- ${line}`);
    lines.push(``, `_${fam.note}_`);
  } else {
    lines.push(`- (no shortlist — run porkchop / open windows)`);
  }

  lines.push(``, `## Architecture matrix`);
  if (matrix?.rows?.length) {
    for (const r of matrix.rows) {
      lines.push(
        `- ${r.recommended ? '★ ' : ''}${r.label}: feasible=${r.feasible} cap=${r.capability_dv_m_s != null ? formatVelocity(r.capability_dv_m_s) : '—'} margin=${r.margin_dv_m_s != null ? formatVelocity(r.margin_dv_m_s) : '—'}`,
      );
    }
    lines.push(``, `_${matrix.note}_`);
  } else {
    lines.push(`- (compute transfer first)`);
  }

  lines.push(``, `## Residual / trust dashboard`);
  for (const it of residual.items || []) {
    lines.push(`- **${it.title}** — ${it.detail}`);
  }
  lines.push(``, `_${residual.note}_`);

  lines.push(``, `## DSM sketch`);
  lines.push(
    `- Combined Need sketch: Lambert ${dsm.lambert_need_m_s != null ? formatVelocity(dsm.lambert_need_m_s) : '—'} + DSM ${formatVelocity(dsm.dsm_total_m_s)} → ${dsm.combined_need_m_s != null ? formatVelocity(dsm.combined_need_m_s) : '—'}`,
  );
  lines.push(`_${dsm.note}_`);

  lines.push(``, `## Pinned plan comparisons`);
  if (pins.length) {
    for (const p of pins) {
      lines.push(`- ${p.label}: Need ${p.triad?.need_m_s != null ? formatVelocity(p.triad.need_m_s) : '—'} · ready=${!!p.dossier?.mission_ready}`);
    }
  } else {
    lines.push(`- (none)`);
  }

  // Need waterfall + launch geometry + sample-return if present
  try {
    const { buildNeedWaterfall } = await import('../physics/need-waterfall.js');
    const wf = buildNeedWaterfall({
      need: td.dossier?.need,
      vehicleId: state.vehicleId,
      ascentBudget_m_s: state.ascentLossBudget_m_s,
      dsmNodes: state.dsmNodes,
      captureBudget_m_s: state.captureBudget_m_s,
    });
    lines.push(``, `## Need waterfall`);
    for (const r of wf.rows) {
      lines.push(`- ${r.label}: ${r.dv_m_s != null ? formatVelocity(r.dv_m_s) : '—'} (${r.in_lambert_need ? 'in Need' : 'outside Need'})`);
    }
    lines.push(`_${wf.note}_`);
  } catch { /* */ }

  try {
    const { buildLaunchGeometryCard } = await import('../physics/launch-geometry-card.js');
    const card = buildLaunchGeometryCard(td, state);
    if (card.ok) {
      lines.push(``, `## Launch geometry`);
      for (const l of card.lines) lines.push(`- ${l}`);
      lines.push(`_${card.disclaimer}_`);
    }
  } catch { /* */ }

  if (state.sampleReturnSketch?.ok) {
    const s = state.sampleReturnSketch;
    lines.push(
      ``,
      `## Sample-return sketch`,
      `- ${s.label}`,
      `- Total Δv class: ${s.total_dv_m_s != null ? formatVelocity(s.total_dv_m_s) : '—'}`,
      `- ${s.note}`,
    );
  }

  try {
    const { buildPathTruth, formatPathTruthLine } = await import('../physics/path-truth.js');
    const truth = buildPathTruth(td, state);
    lines.push(``, `## Path truth (scene vs Need)`);
    if (truth.ok) {
      lines.push(`- ${formatPathTruthLine(truth)}`);
      for (const l of truth.lines || []) lines.push(`- ${l}`);
    } else {
      lines.push(`- ${truth.note || 'unavailable'}`);
    }
  } catch { /* */ }

  try {
    const { snapshotCampaign, formatCampaignTimeline, getCampaign } = await import('../agent/campaign-object.js');
    const snap = snapshotCampaign(state);
    lines.push(``, `## Campaign object v${snap.schema_version}`);
    lines.push(`- Label: ${snap.label}`);
    if (snap.plan_request) {
      lines.push(`- plan_request: \`${JSON.stringify(snap.plan_request)}\``);
    }
    lines.push(`- Path: ${snap.path_truth_line || '—'}`);
    const camp = getCampaign();
    if (camp?.steps?.length) {
      lines.push(``, `### Timeline`);
      for (const l of formatCampaignTimeline(camp)) lines.push(`- ${l}`);
    }
    lines.push(`- ${snap.note}`);
  } catch { /* */ }

  lines.push(
    ``,
    `## Disclaimers`,
    `- Stored numbers are snapshots — recompute for authority.`,
    `- Window families and itineraries are local seeds — not global optima.`,
    `- Vehicle models are educational — not OEM warranty.`,
    `- Sample-return sketch is not free-return OD.`,
    ``,
    `---`,
    `*HELIOS Stakeholder Package v2*`,
    ``,
  );

  downloadBlob(`${base}-stakeholder.md`, lines.join('\n'), 'text/markdown');
  const { notify } = await import('./format.js');
  notify('STAKEHOLDER PACKAGE v2 EXPORTED');
}
