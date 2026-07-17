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
import { buildMeasurementCard } from './measurement-card.js';
import { planStatusBannerHtml, buildPlanDossier } from './plan-dossier.js';
import { bindPlanRecoveryButtons } from './plan-recovery.js';
import { activateRailTab } from './rail-ui.js';
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
      launchBtn.title = 'Launch animated mission along the transfer';
      launchBtn.onclick = () => _launchMission && _launchMission();
    } else {
      launchBtn.disabled = true;
      launchBtn.title = 'Plan not mission-ready — see Plan Status gates';
      launchBtn.onclick = () => {
        import('./format.js').then(({ notify }) =>
          notify('LAUNCH BLOCKED — PLAN NOT MISSION-READY'));
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
        notify('JUMPED TO DEPARTURE — ghosts meet live planets'));
    };
  }
  const exp = document.getElementById('btn-export-plan');
  if (exp) exp.onclick = () => exportMissionPlan(td);

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

function heroCardHtml({
  title, b1, b2, transitLabel, needLabel, feasible, feasibleLabel, fidelityPill, visualWarn, surfaceNote,
}) {
  const feasCls = feasible ? 'green' : 'red-val';
  return `
    <div class="results-hero" id="results-hero">
      <div class="results-hero-title">${title}</div>
      <div class="results-hero-route"><span class="green">${b1}</span> → <span class="amber">${b2}</span></div>
      <div class="results-hero-metrics">
        <div class="hero-metric"><span class="hm-k">Transit</span><span class="hm-v highlight">${transitLabel}</span></div>
        <div class="hero-metric"><span class="hm-k">Need Δv</span><span class="hm-v">${needLabel}</span></div>
        <div class="hero-metric"><span class="hm-k">Feasible</span><span class="hm-v ${feasCls}">${feasibleLabel}</span></div>
        <div class="hero-metric"><span class="hm-k">Fidelity</span><span class="hm-v">${fidelityPill}</span></div>
      </div>
      ${surfaceNote || ''}
      <p class="results-hero-note">Green/orange ghosts = planet positions <em>at burn times</em>, not “now”. Use Jump to Departure to align the scene.</p>
      ${visualWarn || ''}
    </div>`;
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
  return `<p class="results-hero-surface" title="${cs} · r = R_ref + h · concept-grade">📍 ${lines.join(' · ')}<br><span style="opacity:0.75;font-size:9px">${cs}</span></p>`;
}

function actionsHtml(missionReady) {
  const launchLabel = missionReady ? 'Launch' : 'Launch (blocked)';
  const launchTitle = missionReady
    ? 'Launch animated mission along the transfer'
    : 'Plan not mission-ready — open Plan status for gates (often vehicle margin)';
  return `
    <div class="results-actions" id="mission-controls">
      <button class="route-btn launch" id="btn-launch"${missionReady ? '' : ' disabled'}
        title="${launchTitle}">${launchLabel}</button>
      <button class="route-btn secondary" id="btn-open-windows">Windows</button>
      <button class="route-btn secondary" id="btn-goto-depart">Jump to Departure</button>
      <button class="route-btn secondary" id="btn-export-plan">Export</button>
      <button class="route-btn secondary" id="btn-share-link">Share</button>
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
    parts.push(`<div class="visual-fallback-note" role="status">Multi-rev Lambert N=${td.revolutions} (feature-flagged educational branch).</div>`);
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
  // Switch right-rail tab to Results when a plan is ready (sync — tests + share btn visibility)
  try {
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
  } catch { /* */ }

  if (td.isMultiLeg) { renderMultiLegRouteUI(); return; }
  renderSingleLegRouteUI(td);
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
        Vehicle specs don’t meet Need (${needLabel}).
        <button type="button" class="btn-tiny" id="btn-design-vehicle">Design vehicle for Need</button>
        <button type="button" class="btn-tiny" id="btn-apply-abstract-need">Apply abstract budget</button>
      </div>`
    : '';

  const res = document.getElementById('transfer-results');
  const heroTitle = !lambertOk
    ? 'Estimate only'
    : (missionReady ? 'Transfer ready' : 'Transfer solved · launch blocked');
  res.innerHTML = `
    <div class="transfer-results">
      ${heroCardHtml({
        title: heroTitle,
        b1: td.body1?.name || 'Origin',
        b2: td.body2?.name || 'Dest',
        transitLabel: `${(td.transferTime / DAY).toFixed(0)} d`,
        needLabel,
        feasible: missionReady,
        feasibleLabel: missionReady ? 'YES' : 'NO',
        fidelityPill: fidelityPill(dossier),
        visualWarn: visualWarnHtml(td) + designHint,
        surfaceNote: surfaceNoteHtml(td),
      })}
      ${actionsHtml(missionReady)}
      ${detailsBlock('det-lambert', 'Transfer detail', false, lambertBlock)}
      ${detailsBlock('det-mission', 'Mission parking Δv', false, missionBlock)}
      ${detailsBlock('det-plan', 'Plan status & recovery', !missionReady, planStatusBannerHtml(dossier, { compact: false }))}
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

  res.innerHTML = `
    <div class="transfer-results">
      ${heroCardHtml({
        title: allOk ? 'Multi-leg route' : 'Multi-leg incomplete',
        b1: b1n,
        b2: b2n,
        transitLabel: `${(td.transferTime / DAY).toFixed(0)} d`,
        needLabel,
        feasible: missionReady,
        feasibleLabel: missionReady ? 'YES' : 'NO',
        fidelityPill: fidelityPill(dossier),
        visualWarn: visualWarnHtml(td),
      })}
      ${actionsHtml(missionReady)}
      ${detailsBlock('det-ml', 'Legs & flybys', true, detail)}
      ${detailsBlock('det-plan', 'Plan status & recovery', !missionReady, planStatusBannerHtml(dossier))}
      ${detailsBlock('det-measure', 'Need / Capability / Margin', true, card.html || '')}
    </div>`;

  bindMissionControlButtons(td, { canLaunch: missionReady });
}
