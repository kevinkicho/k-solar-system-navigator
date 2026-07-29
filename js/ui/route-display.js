/**
 * Route results panel + mission controls (DOM).
 * Results hierarchy: hero summary → actions → collapsible details.
 * Scene transfer visuals live in route-orbit-visual.js.
 */
import { AU, DAY, DEG, LEG_COLORS } from '../constants.js';
import { state } from '../state.js';
import { computeMissionBudget } from '../physics/mission-budget.js';
import {
  formatDateShort, formatDist, formatTime, formatTimePrecise, formatVelocity, simTimeToDate,
} from './format.js';
import { timeState } from './time-system.js';
import { requiredDeltaV, transferBudgetNow } from './mission-budget-ui.js';
import { exportMissionPlan } from './mission-export.js';
import { exportMissionPackage } from './mission-package.js';
import { buildMeasurementCard } from './measurement-card.js';
import { planStatusBannerHtml, buildPlanDossier, completenessBoardHtml } from './plan-dossier.js';
import { bindPlanRecoveryButtons } from './plan-recovery.js';
import { activateRailTab, syncCampaignSteps } from './rail-ui.js';
import { wireSavePlanButton } from './firebase-ui.js';
import { exportPathCsv } from './path-export.js';
import { measurePathResidual } from './trajectory-hud.js';
import { isSchematic } from '../display-scale.js';
import { syncFidelityChip, syncProductClassFooters } from './product-chrome.js';
export { updateTransferOrbitVisual } from './route-orbit-visual.js';
export { requiredDeltaV, transferBudgetNow } from './mission-budget-ui.js';

let _launchMission = null;
export function bindMissionHandlers({ launch }) {
  _launchMission = launch;
}

function ensureDossier(td) {
  if (!td) return null;
  if (!td.dossier) buildPlanDossier(td, {});
  return td.dossier;
}

function bindMissionControlButtons(td, { canLaunch }) {
  const launchBtn = document.getElementById('btn-launch');
  if (launchBtn) {
    if (canLaunch) {
      launchBtn.disabled = false;
      launchBtn.title = 'Fly study — animate transfer along the computed path (analysis only)';
      launchBtn.onclick = () => _launchMission && _launchMission();
    } else {
      launchBtn.disabled = true;
      launchBtn.title = 'NO-GO — plan not mission-ready; open gate board for blockers';
      launchBtn.onclick = () => {
        import('./format.js').then(({ notify }) =>
          notify('FLY STUDY BLOCKED — PLAN NOT MISSION-READY (NO-GO)'));
      };
    }
  }
  const shareBtn = document.getElementById('btn-share-link');
  if (shareBtn) {
    shareBtn.onclick = () => {
      import('./share.js').then(({ copyShareLink }) => copyShareLink());
    };
  }
  const goto = document.getElementById('btn-goto-depart');
  if (goto) {
    goto.onclick = () => {
      timeState.simTime = td.departureSimTime;
      timeState.setSpeed(3);
      timeState.updateDisplay();
      import('./format.js').then(({ notify }) =>
        notify('EPOCH → DEPARTURE — burn ghosts align with live planets'));
    };
  }
  const exp = document.getElementById('btn-export-plan');
  if (exp) exp.onclick = () => exportMissionPlan(td);

  const pathCsv = document.getElementById('btn-export-path-csv');
  if (pathCsv) pathCsv.onclick = () => exportPathCsv(td);

  const pkg = document.getElementById('btn-export-package');
  if (pkg) {
    pkg.onclick = () => exportMissionPackage(td).catch(() => {
      import('./format.js').then(({ notify }) => notify('MISSION PACKAGE FAILED'));
    });
  }

  wireSavePlanButton(td);

  const winBtn = document.getElementById('btn-open-windows');
  if (winBtn) {
    winBtn.onclick = () => document.getElementById('find-windows')?.click();
  }

  bindPlanRecoveryButtons({
    findNearestWindow: () => {
      import('./route-planner.js').then(({ computeRoute }) => computeRoute());
    },
    openPorkchop: () => {
      document.getElementById('find-windows')?.click();
    },
    snapFlybys: () => {
      import('./route-planner.js').then((m) => {
        if (typeof m.snapFlybyDates === 'function') m.snapFlybyDates();
        else document.getElementById('btn-snap-flybys')?.click();
      });
    },
    designVehicle: () => {
      import('./vehicle-lab.js').then(({ openVehicleLab }) => {
        openVehicleLab({ focusDesign: true });
      });
    },
  });
}

/**
 * Mission Review Board — industrial GO / NO-GO hero.
 */
function missionReviewBoardHtml({
  go, status, b1, b2, transitLabel, needLabel, c3Label, vinfLabel,
  depLabel, fidelityPill, gatePass, gateWarn, gateFail,
  asymptoteHtml, surfaceNote, visualWarn, classroom,
}) {
  const boardCls = go ? 'go' : (status === 'pass_with_warnings' ? 'warn' : 'nogo');
  const statusWord = go
    ? (status === 'pass_with_warnings' ? 'GO · WARN' : 'GO')
    : 'NO-GO';
  const statusCls = go
    ? (status === 'pass_with_warnings' ? 'warn' : 'go')
    : 'nogo';
  const sub = classroom
    ? 'Classroom analysis · methodology-first'
    : 'Preliminary mission design · not flight-certified';
  return `
    <div class="mission-review-board ${boardCls}" id="results-hero" data-go="${go ? '1' : '0'}">
      <div class="mrb-header">
        <span class="mrb-status ${statusCls}">${statusWord}</span>
        <span class="mrb-sub">${sub}</span>
      </div>
      <div class="mrb-route"><span class="green">${b1}</span> → <span class="amber">${b2}</span></div>
      <div class="mrb-metrics">
        <div class="info-row"><span class="key">Departure</span><span class="val">${depLabel || '—'}</span></div>
        <div class="info-row"><span class="key">Transit</span><span class="val highlight">${transitLabel}</span></div>
        <div class="info-row"><span class="key">Need Δv</span><span class="val">${needLabel}</span></div>
        <div class="info-row"><span class="key">C₃ dep</span><span class="val">${c3Label || '—'}</span></div>
        <div class="info-row"><span class="key">V∞ dep</span><span class="val">${vinfLabel || '—'}</span></div>
        <div class="info-row"><span class="key">Fidelity</span><span class="val">${fidelityPill}</span></div>
      </div>
      ${asymptoteHtml || ''}
      <div class="mrb-gatesum">
        <span class="gs-pass">PASS ${gatePass}</span>
        <span class="gs-warn">WARN ${gateWarn}</span>
        <span class="gs-fail">FAIL ${gateFail}</span>
      </div>
      ${surfaceNote || ''}
      <p class="mrb-note">Scene ghosts = planet states <em>at burn epochs</em>, not “now”. Use Jump to Departure to align the 3D view. Fly study is animation only.</p>
      ${visualWarn || ''}
    </div>`;
}

/** @deprecated keep name for any external callers */
function heroCardHtml(opts) {
  return missionReviewBoardHtml({
    go: !!opts.feasible,
    status: opts.feasible ? 'pass' : 'fail',
    b1: opts.b1,
    b2: opts.b2,
    transitLabel: opts.transitLabel,
    needLabel: opts.needLabel,
    c3Label: '—',
    vinfLabel: '—',
    depLabel: '—',
    fidelityPill: opts.fidelityPill,
    gatePass: 0,
    gateWarn: 0,
    gateFail: opts.feasible ? 0 : 1,
    asymptoteHtml: '',
    surfaceNote: opts.surfaceNote,
    visualWarn: opts.visualWarn,
    classroom: !!state.classroomMode,
  });
}

function surfaceNoteHtml(td) {
  const o = td.surfaceOriginMeta;
  const d = td.surfaceDestMeta;
  if (!o && !d) return '';
  const lines = [];
  if (o) {
    const r = o.radius_from_center_km != null
      ? ` · r=${Number(o.radius_from_center_km).toFixed(0)} km`
      : '';
    const sys = o.longitudeSystem === 'system-III' ? ' · Sys.III' : '';
    lines.push(`Origin: ${o.label}${r}${sys}`);
  }
  if (d) {
    const r = d.radius_from_center_km != null
      ? ` · r=${Number(d.radius_from_center_km).toFixed(0)} km`
      : '';
    const sys = d.longitudeSystem === 'system-III' ? ' · Sys.III' : '';
    lines.push(`Dest: ${d.label}${r}${sys}`);
  }
  const cs = o?.coordinateSystemLabel || d?.coordinateSystemLabel || 'Planetocentric geographic';
  return `<p class="results-hero-surface" title="${cs} · r = R_ref + h · preliminary">📍 ${lines.join(' · ')}<br><span style="opacity:0.75;font-size:9px">${cs}</span></p>`;
}

function asymptoteHeroHtml(dossier) {
  const g = dossier?.geometry;
  if (!g) return '';
  const parts = [];
  if (g.dla_eq_deg != null && g.rla_eq_deg != null) {
    parts.push(`<div class="info-row"><span class="key">DLA / RLA (eq≈)</span><span class="val amber">${g.dla_eq_deg.toFixed(1)}° / ${g.rla_eq_deg.toFixed(1)}°</span></div>`);
  } else if (g.dla_ecliptic_deg != null) {
    parts.push(`<div class="info-row"><span class="key">DLA / RLA (ecl.)</span><span class="val">${g.dla_ecliptic_deg.toFixed(1)}° / ${(g.rla_ecliptic_deg ?? 0).toFixed(1)}°</span></div>`);
  }
  if (!parts.length) return '';
  return `<div class="mrb-metrics" style="margin-top:2px">${parts.join('')}</div>`;
}

function gateCounts(dossier) {
  let pass = 0; let warn = 0; let fail = 0;
  for (const g of dossier?.gates || []) {
    if (g.level === 'fail') fail++;
    else if (g.level === 'warn') warn++;
    else pass++;
  }
  return { pass, warn, fail };
}

function fmtC3Hero(c3) {
  if (c3 == null || !isFinite(c3)) return '—';
  return `${(c3 / 1e6).toFixed(2)} km²/s²`;
}

function actionsHtml(missionReady) {
  const launchLabel = missionReady ? 'Fly study' : 'Fly study (NO-GO)';
  const launchTitle = missionReady
    ? 'Animate transfer along the computed path — analysis only, not a range launch'
    : 'NO-GO — open gate board (often vehicle margin or site DLA)';
  return `
    <div class="results-actions" id="mission-controls">
      <button class="route-btn launch" id="btn-launch"${missionReady ? '' : ' disabled'}
        title="${launchTitle}">${launchLabel}</button>
      <button class="route-btn secondary" id="btn-open-windows">Windows</button>
      <button class="route-btn secondary" id="btn-goto-depart">Jump to Departure</button>
      <button class="route-btn secondary" id="btn-export-package" title="Mission JSON + path CSV + mission brief (+ OEM if OPS)">Mission package</button>
      <button class="route-btn secondary" id="btn-export-plan">Export JSON</button>
      <button class="route-btn secondary" id="btn-export-path-csv" title="Path samples CSV (Kepler conic, scene-frame AU)">Path CSV</button>
      <button class="route-btn secondary" id="btn-save-cloud" title="Save plan summary to Firebase (sign-in required)">Save to cloud</button>
      <button class="route-btn secondary" id="btn-share-link" title="Copy baselined plan link">Baseline link</button>
    </div>`;
}

/** Always-on honesty strip: ephemeris, path model, scene mode, residual, low-thrust note. */
function trustStripHtml(td, dossier) {
  let eph = state.classroomMode
    ? 'L1 approx (classroom)'
    : (state.fidelityLevel === 'L3-plan'
      ? 'L3-plan DE440s SPICE-baked'
      : (state.horizonsEndpointInject || state.fidelityLevel === 'L2-horizons'
        ? 'L2-horizons inject'
        : (state.ephemerisBackend === 'sample-de' ? 'L2-plan sample-DE' : 'L1 approx')));
  if (td?.sampleFallback || dossier?.fidelity?.sampleFallback) {
    eph += ' · partial approx fallback';
  }
  if (td?.endpointBackendSummary && !state.classroomMode) {
    eph += ` · ${td.endpointBackendSummary}`;
  }
  if (td?.revolutions > 0) eph += ` · multi-rev N=${td.revolutions}`;
  // Dense SPICE pack honesty (parent-relative / helio sample packs)
  let denseTxt = '';
  try {
    if (!state.classroomMode) {
      const parts = [];
      if (td?.prEphSource) parts.push(String(td.prEphSource));
      if (td?.prEphRecovery) parts.push(`recovery=${td.prEphRecovery}`);
      // Loaded pack delivery sources (Storage CDN vs Hosting)
      import('../physics/dense-spk-pack.js').then((d) => {
        const sum = d.denseSpkCoverageSummary?.();
        const el = document.getElementById('path-trust-dense');
        if (el && sum?.packs?.length) {
          const del = [...new Set(sum.packs.map((p) => p.delivery || 'local'))].join('+');
          el.textContent = `Dense ${sum.packs.map((p) => p.pack_id).slice(0, 4).join(',')} [${del}]`;
        }
      }).catch(() => {});
      if (parts.length) denseTxt = parts.join(' · ');
    }
  } catch { /* */ }
  if (state.physicsAccurate) eph += ' · ACCURATE view';
  if (state.flightOpsMode) eph += ' · OPS review';
  const scene = state.physicsAccurate
    ? 'physics-accurate'
    : (state.mapMode
      ? 'MAP dual-path'
      : (isSchematic() ? 'schematic' : 'cinematic×incl'));
  const geom = state.physicsAccurate ? 'physical+dual' : (state.pathGeometry || 'visual');
  let resTxt = '—';
  try {
    if (td && !td.isMultiLeg) {
      const r = measurePathResidual(td);
      if (r.maxAU != null) resTxt = `${r.maxAU.toExponential(1)} AU`;
    }
  } catch { /* */ }
  const nbody = state.pathAccuracy?.nbodyOverlay && !state.classroomMode
    ? ' · n-body residual ON (Need unchanged)'
    : '';
  return `
    <div class="path-trust-strip" id="path-trust-strip" role="status"
      title="Concept-grade: Need/Δv from physical Lambert + planning ephemeris. Dense packs = pre-baked SPICE samples, not live .bsp. Not certified OD.">
      <span class="pts-item"><em>Eph</em> ${eph}</span>
      <span class="pts-item" id="path-trust-dense"><em>Dense</em> ${denseTxt || '—'}</span>
      <span class="pts-item"><em>Path</em> Kepler conic · ${geom}</span>
      <span class="pts-item"><em>Scene</em> ${scene}</span>
      <span class="pts-item"><em>Res</em> ${resTxt}</span>
      <span class="pts-item pts-note">Chemical Lambert · not low-thrust · baked SPICE samples not live kernels · not certified OD${nbody}</span>
    </div>`;
}

function detailsBlock(id, title, open, inner) {
  return `
    <details class="results-details" id="${id}" ${open ? 'open' : ''}>
      <summary>${title}</summary>
      <div class="results-details-body">${inner}</div>
    </details>`;
}

function visualWarnHtml(td) {
  if (!td) return '';
  const parts = [];
  const legs = td.legs || [];
  const hasCosine = td.visualFallback === 'cosine'
    || legs.some((L) => L.ok && L.visualFallback === 'cosine');
  const hasPhysical = td.visualFallback === 'physical'
    || legs.some((L) => L.ok && L.visualFallback === 'physical');
  const diverged = !!td.visualBranchDiverged
    || legs.some((L) => L.ok && L.visualBranchDiverged);
  const offsetPol = td.pathOffsetPolicy || state.pathOffsetPolicy || 'time_varying';

  if (hasCosine) {
    parts.push(`<div class="visual-fallback-warn" role="status">⚠ Scene path non-Keplerian cosine blend — numbers still use physical Lambert. Try Schematic view or recompute.</div>`);
  }
  if (hasPhysical) {
    parts.push(`<div class="visual-fallback-warn" role="status">ℹ Scene path uses physical (non-exaggerated) geometry — high-e visual branch was unstable. Δv unchanged.</div>`);
  }
  if (diverged) {
    parts.push(`<div class="visual-fallback-warn" role="status">ℹ Visual longWay could not match physical — path branch diverged; Δv still from physical Lambert.</div>`);
  }
  if (offsetPol === 'time_varying' && !hasCosine) {
    parts.push(`<div class="visual-fallback-note" role="status">Path offset=time_varying: includes sun barycenter motion (educational) — not third-body gravity on the coast.</div>`);
  }
  if (td.revolutions > 0) {
    parts.push(`<div class="visual-fallback-note" role="status">Multi-rev Lambert N=${td.revolutions} (flag and/or auto when TOF&gt;400 d — educational branch, not certified).</div>`);
  }
  if (state.pathAccuracy?.nbodyOverlay && !state.classroomMode) {
    parts.push(`<div class="visual-fallback-note" role="status">n-body coast overlay = educational residual under Approximate Positions — not navigation OD. Need/Δv unchanged.</div>`);
  }
  // PR9: outer-system sample-DE recommend (no silent switch)
  const outerBanner = outerSampleDeBanner(td);
  if (outerBanner) parts.push(outerBanner);
  return parts.join('');
}

/** Bodies beyond Jupiter semi-major (~5 AU class) — educational outer list. */
function isOuterBody(body) {
  if (!body) return false;
  const a = body.a;
  if (a != null && a > 5) return true;
  const outer = new Set(['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Eris', 'Haumea']);
  return outer.has(body.name);
}

function outerSampleDeBanner(td) {
  if (state.classroomMode) return '';
  if (!state.pathAccuracy?.preferSampleDeOuter) return '';
  if (state.ephemerisBackend === 'sample-de') return '';
  const b1 = td.body1, b2 = td.body2;
  if (!isOuterBody(b1) && !isOuterBody(b2)) return '';
  return `<div class="visual-fallback-note" role="status">
    Outer-system endpoints: consider <strong>L2-plan sample-de</strong> ephemeris for better positions
    (never auto-switched).
    <button type="button" class="btn-tiny" id="btn-upgrade-sample-de">Use sample-de</button>
  </div>`;
}

function fidelityPill(dossier) {
  const f = dossier?.fidelity?.fidelityLevel || state.fidelityLevel || 'L1';
  return `<span class="fidelity-badge fidelity-${f}">${f}</span>`;
}

// ---- DOM-side: results panel + mission controls ----
export function renderRouteUI() {
  const td = state.transferData;
  if (!td) return;
  // Results tab only when we actually have transfer content to show
  try {
    if (td) {
      activateRailTab('results');
      if (document.body.classList.contains('mob-sheet-plan')
          || document.body.classList.contains('mob-sheet-bodies')
          || document.body.classList.contains('mob-sheet-results')
          || window.matchMedia?.('(max-width: 768px)')?.matches) {
        document.body.classList.remove('mob-sheet-bodies', 'mob-sheet-plan');
        document.body.classList.add('mob-sheet-results');
        document.querySelectorAll('#mobile-chips .mob-chip').forEach((c) => {
          c.setAttribute('aria-pressed', c.dataset.sheet === 'results' ? 'true' : 'false');
        });
      }
    }
  } catch { /* */ }

  if (td.isMultiLeg) {
    renderMultiLegRouteUI();
  } else {
    renderSingleLegRouteUI(td);
  }
  if (state.flightOpsMode) {
    import('./flight-ops-ui.js').then((m) => m.refreshFlightOpsPanel?.()).catch(() => {});
  }
  // Quantitative n-body residual (analysis only) when flag on
  if (state.pathAccuracy?.nbodyOverlay && !state.classroomMode && td && !td.isMultiLeg) {
    import('../physics/nbody-cowell.js').then((m) => {
      try {
        const res = m.transferNbodyResidual?.(td);
        if (res && td) {
          td.nbodyResidual = res;
          const el = document.getElementById('nbody-residual-row');
          if (el) {
            el.textContent = `n-body miss ≈ ${res.miss_km.toExponential(2)} km (${res.miss_AU.toExponential(2)} AU) · analysis only`;
          }
        }
      } catch { /* */ }
    }).catch(() => {});
  }
  try {
    syncCampaignSteps();
    syncFidelityChip();
    syncProductClassFooters();
  } catch { /* */ }
}

function renderSingleLegRouteUI(td) {
  const departDate = simTimeToDate(td.departureSimTime);
  const arriveDate = simTimeToDate(td.arrivalSimTime);
  const lambertOk = !!td.lambertOk;
  const orbPhys = td.orbitPhysical;

  const periAU = orbPhys ? (orbPhys.a * (1 - orbPhys.e)) / AU : null;
  const apoAU = orbPhys ? (orbPhys.a * (1 + orbPhys.e)) / AU : null;
  const totalDv = lambertOk ? td.dvTotal_lambert : td.dvTotal;
  const budget = lambertOk ? computeMissionBudget(td) : null;
  const required = requiredDeltaV(td);

  if ((td.planetRelative || td.body1?.parent || td.body2?.parent)
      && !state.moonMissionSuggestDone) {
    state.moonMissionSuggestDone = true;
    if (state.costBasis !== 'mission') {
      import('./format.js').then(({ notify }) =>
        notify(td.planetRelative
          ? 'TIP: Cost basis → Mission for parking-orbit Δv (planet-relative)'
          : 'TIP: switch Cost basis → Mission for parking-orbit Δv'));
    }
  }

  const dossier = ensureDossier(td);
  const missionReady = dossier
    ? !!(dossier.launch_enabled ?? dossier.mission_ready)
    : !!lambertOk;

  const card = buildMeasurementCard(td);
  const needDv = card?.need?.need_dv_m_s;
  const needLabel = needDv != null && isFinite(needDv)
    ? formatVelocity(needDv)
    : formatVelocity(totalDv);

  const pr = !!td.planetRelative;
  const cenName = td.centralBodyName || td.centralBody?.name || 'parent';
  const frameLabel = pr ? `${cenName}-centered` : 'heliocentric';
  const periApoRow = (() => {
    if (!lambertOk || !orbPhys) {
      return `<div class="info-row"><span class="key">Transfer a</span><span class="val">${formatDist(td.aT)}</span></div>`;
    }
    if (pr) {
      const peri_m = orbPhys.a * (1 - orbPhys.e);
      const apo_m = orbPhys.a * (1 + orbPhys.e);
      return `
    <div class="info-row"><span class="key">a / e</span><span class="val">${formatDist(orbPhys.a)} · ${orbPhys.e.toFixed(4)}</span></div>
    <div class="info-row"><span class="key">Peri / Apo (vs ${cenName})</span><span class="val">${formatDist(peri_m)} / ${formatDist(apo_m)}</span></div>`;
    }
    return `
    <div class="info-row"><span class="key">a / e</span><span class="val">${formatDist(orbPhys.a)} · ${orbPhys.e.toFixed(4)}</span></div>
    <div class="info-row"><span class="key">Peri / Apo</span><span class="val">${periAU.toFixed(3)} / ${apoAU.toFixed(3)} AU</span></div>`;
  })();
  const lambertBlock = `
    <div class="result-title">${lambertOk
      ? (pr ? `PLANET-RELATIVE LAMBERT (${cenName})` : 'LAMBERT TRANSFER')
      : 'HOHMANN ESTIMATE (Lambert failed)'}</div>
    ${pr ? `<div class="info-row"><span class="key">Frame</span><span class="val green">${cenName}-centered · same SOI</span></div>` : ''}
    ${pr && td.hohmannNote ? `<div class="info-row"><span class="key">Note</span><span class="val" style="font-size:9px;opacity:0.85">${td.hohmannNote}</span></div>` : ''}
    ${pr && td.phaseSnapped ? `<div class="info-row"><span class="key">Phase</span><span class="val green">snapped to Hohmann window</span></div>` : ''}
    <div class="info-row"><span class="key">Departure</span><span class="val green">${formatDateShort(departDate)}</span></div>
    <div class="info-row"><span class="key">Arrival</span><span class="val amber">${formatDateShort(arriveDate)}</span></div>
    <div class="info-row"><span class="key">Transit</span><span class="val highlight">${formatTimePrecise(td.transferTime)} · ${(td.transferTime / DAY).toFixed(1)} d</span></div>
    <div class="info-row"><span class="key">Dep / Arr Δv (${frameLabel})</span><span class="val">${formatVelocity(lambertOk ? td.dv1_lambert : td.dv1)} / ${formatVelocity(lambertOk ? td.dv2_lambert : td.dv2)}</span></div>
    <div class="info-row"><span class="key">${pr ? 'Transfer total' : 'Heliocentric total'}</span><span class="val">${formatVelocity(totalDv)}</span></div>
    ${periApoRow}
    <div class="info-row"><span class="key">Phase needed / at dep</span><span class="val">${(td.phaseAngle / DEG).toFixed(1)}° / ${(td.currentPhase / DEG).toFixed(1)}°</span></div>
    <div class="info-row"><span class="key">Next optimal window</span><span class="val highlight">${formatTime(td.timeToWindow)}</span></div>`;

  const missionBlock = budget ? `
    <div class="result-subtitle">FULL MISSION Δv (parking, ${(budget.parkingAlt_m / 1000).toFixed(0)} km)</div>
    ${budget.departure.phases.map((p) =>
    `<div class="info-row"><span class="key">↗ ${p.label}</span><span class="val">${formatVelocity(p.dv)}</span></div>`).join('')}
    <div class="info-row"><span class="key">Departure subtotal</span><span class="val green">${formatVelocity(budget.departure.total)}</span></div>
    ${budget.arrival.phases.map((p) =>
    `<div class="info-row"><span class="key">↘ ${p.label}</span><span class="val">${formatVelocity(p.dv)}</span></div>`).join('')}
    <div class="info-row"><span class="key">Arrival subtotal</span><span class="val amber">${formatVelocity(budget.arrival.total)}</span></div>
    <div class="info-row"><span class="key"><strong>Mission total</strong></span><span class="val amber"><strong>${formatVelocity(budget.totalMission)}</strong></span></div>`
    : '<div class="info-row"><span class="key">Mission parking</span><span class="val" style="opacity:0.7">n/a (no Lambert budget)</span></div>';

  // Compact measurement: strip engineering sheet if present
  let measureHtml = card.html || '';
  // Prefer not to open vehicle eng by default — measurement-card may include it; leave as-is but under details

  const vehicleBlocked = !missionReady && lambertOk
    && (dossier?.gates || []).some((g) => g.code === 'G_VEHICLE_FEASIBLE' && g.level === 'fail');
  const designHint = vehicleBlocked
    ? `<div class="vd-inline-hint" role="status">
        Vehicle capability does not meet Need (${needLabel}).
        <button type="button" class="btn-tiny" id="btn-design-vehicle">Design vehicle for Need</button>
        <button type="button" class="btn-tiny" id="btn-apply-abstract-need">Apply abstract budget</button>
      </div>`
    : '';

  const res = document.getElementById('transfer-results');
  const gc = gateCounts(dossier);
  const c3 = card?.need?.c3_m2_s2;
  const vinf = card?.need?.vinf_dep_m_s;
  const depIso = dossier?.geometry?.departure_iso
    || (td.departureSimTime != null ? simTimeToDate(td.departureSimTime).toISOString() : null);
  res.innerHTML = `
    <div class="transfer-results">
      ${missionReviewBoardHtml({
        go: missionReady,
        status: dossier?.status || (missionReady ? 'pass' : 'fail'),
        b1: td.body1?.name || 'Origin',
        b2: td.body2?.name || 'Dest',
        transitLabel: `${(td.transferTime / DAY).toFixed(0)} d`,
        needLabel,
        c3Label: fmtC3Hero(c3),
        vinfLabel: vinf != null && isFinite(vinf) ? formatVelocity(vinf) : '—',
        depLabel: depIso ? depIso.slice(0, 16).replace('T', ' ') + 'Z' : '—',
        fidelityPill: fidelityPill(dossier),
        gatePass: gc.pass,
        gateWarn: gc.warn,
        gateFail: gc.fail,
        asymptoteHtml: asymptoteHeroHtml(dossier),
        visualWarn: visualWarnHtml(td) + designHint,
        surfaceNote: surfaceNoteHtml(td),
        classroom: !!state.classroomMode,
      })}
      ${completenessBoardHtml(dossier)}
      ${trustStripHtml(td, dossier)}
      ${actionsHtml(missionReady)}
      ${detailsBlock('det-lambert', 'Transfer detail', false, lambertBlock)}
      ${detailsBlock('det-mission', 'Mission parking Δv', false, missionBlock)}
      ${detailsBlock('det-plan', 'Gate board & recovery', !missionReady, planStatusBannerHtml(dossier, { compact: false }))}
      ${detailsBlock('det-measure', 'Need / Capability / Margin', true, measureHtml)}
    </div>`;

  // mission-controls is inside transfer-results now
  bindMissionControlButtons(td, { canLaunch: missionReady });
  const designBtn = document.getElementById('btn-design-vehicle');
  if (designBtn) {
    designBtn.onclick = () => {
      import('./vehicle-lab.js').then(({ openVehicleLab }) => openVehicleLab({ focusDesign: true }));
    };
  }
  const sampleDeBtn = document.getElementById('btn-upgrade-sample-de');
  if (sampleDeBtn) {
    sampleDeBtn.onclick = () => {
      if (state.classroomMode) {
        notify('CLASSROOM MODE FORCES L1 APPROX');
        return;
      }
      state.ephemerisBackend = 'sample-de';
      state.fidelityLevel = 'L2-plan';
      const ephSel = document.getElementById('ephemeris-backend');
      if (ephSel) ephSel.value = 'sample-de';
      import('./route-planner.js').then(({ stampPlanningEphemeris }) => {
        import('../physics/routing.js').then(({ solveTransferOrbit }) => {
          if (state.transferData && !state.transferData.isMultiLeg) {
            stampPlanningEphemeris(state.transferData);
            solveTransferOrbit(state.transferData);
            renderRouteUI();
            updateTransferOrbitVisual();
          }
          notify('EPHEMERIS → SAMPLE-DE (L2-plan) · recompute for multi-leg');
        });
      });
    };
  }
  const absBtn = document.getElementById('btn-apply-abstract-need');
  if (absBtn) {
    absBtn.onclick = () => {
      import('./vehicle-design-ui.js').then(({ designFromCurrentPlan, applyAbstractBudgetFromDesign }) => {
        const d = designFromCurrentPlan();
        if (d.ok) applyAbstractBudgetFromDesign(d);
      });
    };
  }
  // clear external mission-controls if present
  const mcExt = document.querySelector('#rail-pane-results > #mission-controls, .route-section > #mission-controls');
  if (mcExt && mcExt.id === 'mission-controls' && !mcExt.classList.contains('results-actions')) {
    mcExt.innerHTML = '';
  }
}

function renderMultiLegRouteUI() {
  const td = state.transferData;
  const res = document.getElementById('transfer-results');
  const dossier = ensureDossier(td);
  const missionReady = dossier
    ? !!(dossier.launch_enabled ?? dossier.mission_ready)
    : false;
  const allOk = td.allLegsOk;
  const totalDv = td.dvTotalMultiLeg;
  const required = requiredDeltaV(td);
  const card = buildMeasurementCard(td);

  const legRows = td.legs.map((L, i) => {
    const color = '#' + LEG_COLORS[i % LEG_COLORS.length].toString(16).padStart(6, '0');
    if (!L.ok) {
      return `<div class="info-row"><span class="key" style="color:${color}">Leg ${i + 1} ${L.from}→${L.to}</span><span class="val red-val">LAMBERT FAILED</span></div>`;
    }
    const fb = L.visualFallback === 'cosine' ? ' · visual cosine' : '';
    return `<div class="info-row"><span class="key" style="color:${color}">Leg ${i + 1} ${L.from}→${L.to}</span><span class="val">${(L.tof / DAY).toFixed(0)}d${fb}</span></div>`;
  }).join('');

  const manRows = td.maneuvers.map((m) => {
    if (m.type === 'depart') return `<div class="info-row"><span class="key">Depart ${m.body}</span><span class="val green">${formatVelocity(m.dv)}</span></div>`;
    if (m.type === 'arrive') return `<div class="info-row"><span class="key">Arrive ${m.body}</span><span class="val amber">${formatVelocity(m.dv)}</span></div>`;
    const gi = m.info;
    const tDeg = (gi.turningAngle / DEG).toFixed(1);
    const tMax = (gi.maxTurningAngle / DEG).toFixed(1);
    const rP = isFinite(gi.rPeriapsis) ? (gi.rPeriapsis / 1000).toFixed(0) + ' km' : '—';
    const minR = (gi.minR / 1000).toFixed(0) + ' km';
    const cls = gi.achievable ? 'green' : 'red-val';
    const status = gi.achievable ? 'OK' : 'TOO SHARP';
    return `
      <div class="info-row"><span class="key">Flyby ${m.body}</span><span class="val ${cls}">${status}</span></div>
      <div class="info-row"><span class="key">&nbsp;&nbsp;Turning</span><span class="val">${tDeg}° / max ${tMax}°</span></div>
      <div class="info-row"><span class="key">&nbsp;&nbsp;Periapsis</span><span class="val">${rP} (min ${minR})</span></div>
      ${gi.dvFlyby > 1 ? `<div class="info-row"><span class="key">&nbsp;&nbsp;Powered Δv</span><span class="val amber">${formatVelocity(gi.dvFlyby)}</span></div>` : ''}
    `;
  }).join('');

  const b1n = td.body1?.name || 'Origin';
  const b2n = td.body2?.name || 'Destination';
  const needDv = card?.need?.need_dv_m_s;
  const needLabel = needDv != null && isFinite(needDv)
    ? formatVelocity(needDv)
    : formatVelocity(totalDv);

  const detail = `
    <div class="result-title">${allOk ? 'MULTI-LEG TRANSFER' : 'MULTI-LEG (some legs failed)'}</div>
    <div class="info-row"><span class="key">Depart ${b1n}</span><span class="val green">${formatDateShort(simTimeToDate(td.departureSimTime))}</span></div>
    <div class="info-row"><span class="key">Arrive ${b2n}</span><span class="val amber">${formatDateShort(simTimeToDate(td.arrivalSimTime))}</span></div>
    <div class="info-row"><span class="key">Total transit</span><span class="val highlight">${(td.transferTime / DAY).toFixed(0)} days</span></div>
    <div style="height:6px"></div>
    ${legRows}
    <div style="height:6px"></div>
    ${manRows}
    <div class="info-row"><span class="key">Total Δv (heliocentric)</span><span class="val amber">${formatVelocity(totalDv)}</span></div>
    <div class="info-row"><span class="key" style="font-size:9px;opacity:0.7">Note</span><span class="val" style="font-size:9px;opacity:0.7">Mission parking is single-leg only · multi-leg search is a coarse seed</span></div>`;

  const gc = gateCounts(dossier);
  const c3 = card?.need?.c3_m2_s2;
  const vinf = card?.need?.vinf_dep_m_s;
  const depIso = dossier?.geometry?.departure_iso
    || (td.departureSimTime != null ? simTimeToDate(td.departureSimTime).toISOString() : null);
  res.innerHTML = `
    <div class="transfer-results">
      ${missionReviewBoardHtml({
        go: missionReady,
        status: dossier?.status || (missionReady ? 'pass' : 'fail'),
        b1: b1n,
        b2: b2n,
        transitLabel: `${(td.transferTime / DAY).toFixed(0)} d`,
        needLabel,
        c3Label: fmtC3Hero(c3),
        vinfLabel: vinf != null && isFinite(vinf) ? formatVelocity(vinf) : '—',
        depLabel: depIso ? depIso.slice(0, 16).replace('T', ' ') + 'Z' : '—',
        fidelityPill: fidelityPill(dossier),
        gatePass: gc.pass,
        gateWarn: gc.warn,
        gateFail: gc.fail,
        asymptoteHtml: asymptoteHeroHtml(dossier),
        visualWarn: visualWarnHtml(td),
        surfaceNote: surfaceNoteHtml(td),
        classroom: !!state.classroomMode,
      })}
      ${completenessBoardHtml(dossier)}
      ${trustStripHtml(td, dossier)}
      ${actionsHtml(missionReady)}
      ${detailsBlock('det-ml', 'Legs & flybys', true, detail)}
      ${detailsBlock('det-plan', 'Gate board & recovery', !missionReady, planStatusBannerHtml(dossier))}
      ${detailsBlock('det-measure', 'Need / Capability / Margin', true, card.html || '')}
    </div>`;

  bindMissionControlButtons(td, { canLaunch: missionReady });
}
