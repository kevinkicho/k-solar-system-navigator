/**
 * Plan Dossier builder + status banner HTML (reliability design).
 */

import { AU, DAY, DEG } from '../constants.js';
import { state } from '../state.js';
import { bodyId } from '../data/catalog.js';
import { runQualityGates, recoveryFromGates } from '../physics/plan-quality.js';
import {
  fullAsymptotePackage, departureVinfVec, arrivalVinfVec, vinfMagnitude,
} from '../physics/departure-asymptote.js';
import { getBodyVelocity3D } from '../physics/kepler.js';
import { getPlanningVelocity3D } from '../physics/ephemeris-provider.js';
import { getLaunchSite } from '../data/launch-sites-edu.js';
import { buildMeasurementCard } from './measurement-card.js';
import { buildVehicleEngineeringReport } from '../physics/vehicle-performance.js';
import { formatVelocity, simTimeToDate } from './format.js';
import { trustCardHtml } from './trust-card.js';

/**
 * Build full dossier and attach to td.dossier.
 * @param {object} td
 * @param {object} [opts] gate opts: dateAdjusted, prevDepartureSimTime, pathologicalUnrecovered, sampleFallback
 */
export function buildPlanDossier(td, opts = {}) {
  if (!td) return null;

  const card = buildMeasurementCard(td);
  const { need, capability, margin } = card;

  // Geometry extras (asymptote before gates for site DLA)
  let asymptotePkg = null;
  let vinfArr = null;
  let vInfDepVec = null;
  if (!td.isMultiLeg && td.lambertOk && td.v1_lambert && td.body1) {
    const pOpts = {
      backend: td.ephemerisBackend || state.ephemerisBackend || 'approx',
      classroomMode: !!state.classroomMode,
    };
    let vPlanet;
    try {
      vPlanet = getPlanningVelocity3D(td.body1, td.departureSimTime, pOpts);
    } catch {
      vPlanet = getBodyVelocity3D(td.body1, td.departureSimTime, false);
    }
    vInfDepVec = departureVinfVec(td.v1_lambert, vPlanet);
    const earthDep = isEarthBody(td.body1);
    asymptotePkg = fullAsymptotePackage(vInfDepVec, { earthDeparture: earthDep });
    if (td.v2_lambert && td.body2) {
      let vP2;
      try {
        vP2 = getPlanningVelocity3D(td.body2, td.arrivalSimTime, pOpts);
      } catch {
        vP2 = getBodyVelocity3D(td.body2, td.arrivalSimTime, false);
      }
      vinfArr = vinfMagnitude(arrivalVinfVec(td.v2_lambert, vP2));
    }
  }

  const site = getLaunchSite(state.launchSiteId || 'any');
  const quality = runQualityGates(td, { need, capability, margin }, {
    dateAdjusted: !!opts.dateAdjusted,
    prevDepartureSimTime: opts.prevDepartureSimTime ?? null,
    pathologicalUnrecovered: !!opts.pathologicalUnrecovered,
    sampleFallback: !!opts.sampleFallback,
    strictVehicle: state.planStrictVehicle !== false,
    strictSite: !!state.planStrictSite,
    multiLeg: !!td.isMultiLeg,
    launchSiteId: site.id,
    site_dla_max_deg: site.dla_max_deg,
    dla_eq_deg: asymptotePkg?.equatorial_approx?.dla_deg ?? null,
    dla_ecliptic_deg: asymptotePkg?.ecliptic?.dla_deg ?? null,
  });

  const recovery = recoveryFromGates(quality.gates, td);

  const orb = td.orbitPhysical;
  const periAU = orb ? (orb.a * (1 - orb.e)) / AU : null;

  const vehEng = buildVehicleEngineeringReport({
    vehicleId: state.vehicleId,
    starshipArch: state.starshipArch,
    tankerCount: state.tankerCount,
    cargoMass_kg: state.cargoMass_kg,
    falcon9Variant: state.falcon9Variant,
  });

  const ascent = buildAscentBlock(vehEng, need);

  const completeness = buildCompleteness(td, need, capability, margin, asymptotePkg, quality);

  const dossier = {
    dossier_version: 1,
    computed_at_iso: new Date().toISOString(),
    status: quality.status,
    confidence_0_100: quality.confidence_0_100,
    mission_ready: quality.mission_ready,
    gates: quality.gates,
    recovery,
    inputs: {
      origin: td.body1?.name || td.legs?.[0]?.from || null,
      origin_id: td.body1 ? bodyId(td.body1) : null,
      destination: td.body2?.name || td.legs?.[td.legs.length - 1]?.to || null,
      destination_id: td.body2 ? bodyId(td.body2) : null,
      multi_leg: !!td.isMultiLeg,
      vehicleId: state.vehicleId,
      starshipArch: state.starshipArch,
      cargoMass_kg: state.cargoMass_kg,
      falcon9Variant: state.falcon9Variant,
      costBasis: state.costBasis,
      classroomMode: !!state.classroomMode,
      launch_site_id: site.id,
      ascent_loss_m_s: state.ascentLossBudget_m_s || 0,
    },
    geometry: {
      lambertOk: !!td.lambertOk,
      longWay: td.longWay ?? null,
      departure_iso: td.departureSimTime != null
        ? simTimeToDate(td.departureSimTime).toISOString() : null,
      arrival_iso: td.arrivalSimTime != null
        ? simTimeToDate(td.arrivalSimTime).toISOString() : null,
      transit_days: td.transferTime != null ? td.transferTime / DAY : null,
      dv1_m_s: td.dv1_lambert ?? td.dv1 ?? null,
      dv2_m_s: td.dv2_lambert ?? td.dv2 ?? null,
      dv_total_m_s: td.dvTotal_lambert ?? td.dvTotal ?? td.dvTotalMultiLeg ?? null,
      c3_m2_s2: need?.c3_m2_s2 ?? null,
      vinf_dep_m_s: need?.vinf_dep_m_s ?? asymptotePkg?.vinf_m_s ?? null,
      vinf_arr_m_s: vinfArr ?? need?.vinf_arr_m_s ?? null,
      perihelion_AU: periAU,
      dla_ecliptic_deg: asymptotePkg?.ecliptic?.dla_deg ?? null,
      rla_ecliptic_deg: asymptotePkg?.ecliptic?.rla_deg ?? null,
      dla_eq_deg: asymptotePkg?.equatorial_approx?.dla_deg ?? null,
      rla_eq_deg: asymptotePkg?.equatorial_approx?.rla_deg ?? null,
      asymptote: asymptotePkg,
      asymptote_frame: asymptotePkg?.ecliptic?.frame ?? null,
      date_adjusted: !!opts.dateAdjusted,
      prev_departure_iso: opts.prevDepartureSimTime != null
        ? simTimeToDate(opts.prevDepartureSimTime).toISOString() : null,
    },
    measurement: { need, capability, margin },
    vehicle_engineering: vehEng,
    ascent_loss: ascent,
    launch_site: {
      id: site.id,
      name: site.name,
      dla_max_deg: site.dla_max_deg,
      disclaimer: site.disclaimer,
    },
    fidelity: {
      fidelityLevel: state.fidelityLevel || 'L1',
      ephemerisBackend: state.classroomMode
        ? 'approx'
        : (state.ephemerisBackend || 'approx'),
    },
    completeness,
    confidence_label: confidenceLabel(quality.confidence_0_100, quality.status),
    confidence_note:
      'Educational plan-completeness confidence — not navigation covariance or flight certification.',
  };

  td.dossier = dossier;

  if (typeof location !== 'undefined' && /[?&]debug=1(?:&|$)/.test(location.search || '')) {
    console.log('[HELIOS debug] plan dossier', dossier);
  }

  return dossier;
}

function isEarthBody(b) {
  if (!b) return false;
  const n = (b.name || b.id || '').toLowerCase();
  return n === 'earth';
}

function buildAscentBlock(vehEng, need) {
  const budget = state.ascentLossBudget_m_s || 0;
  let idealStack = null;
  if (vehEng?.falcon9?.stackIdealDv_m_s != null) idealStack = vehEng.falcon9.stackIdealDv_m_s;
  else if (vehEng?.superHeavy?.idealDv_m_s != null) {
    idealStack = vehEng.superHeavy.idealDv_m_s;
    if (vehEng.starship?.idealDv_m_s != null && state.starshipArch !== 'legacy-demo') {
      // unrefueled framing: show SS capability as transfer stage, not sum double-count SH
      idealStack = vehEng.starship.capabilityDv_arch_m_s ?? vehEng.starship.idealDv_m_s;
    }
  }
  const residual = idealStack != null && budget > 0 ? idealStack - budget : null;
  const needDv = need?.need_dv_m_s;
  return {
    budget_m_s: budget,
    ideal_stack_dv_m_s: idealStack,
    residual_after_ascent_m_s: residual,
    residual_minus_need_m_s: residual != null && needDv != null ? residual - needDv : null,
    note: 'Ascent loss is educational framing — not included in Lambert Need or C₃.',
  };
}

function confidenceLabel(c, status) {
  if (status === 'fail') return 'Failed';
  if (c >= 80) return 'High';
  if (c >= 50) return 'Medium';
  return 'Low';
}

function buildCompleteness(td, need, capability, margin, asymptotePkg, quality) {
  const items = [
    { id: 'bodies', label: 'Origin / destination', ok: !!(td.body1 && td.body2) || !!td.isMultiLeg },
    { id: 'epochs', label: 'Departure / arrival epochs', ok: td.departureSimTime != null || td.isMultiLeg },
    {
      id: 'lambert',
      label: 'Ballistic Lambert',
      ok: td.isMultiLeg ? (td.legs || []).every((L) => L.ok) : !!td.lambertOk,
    },
    { id: 'c3', label: 'C₃ (departure)', ok: need?.c3_m2_s2 != null && isFinite(need.c3_m2_s2) },
    {
      id: 'vinf',
      label: 'V∞ dep/arr',
      ok: (need?.vinf_dep_m_s != null || asymptotePkg?.vinf_m_s != null),
    },
    {
      id: 'peri',
      label: 'Safe perihelion',
      ok: !quality.gates.some((g) => g.code === 'G_PERIHELION' && g.level === 'fail'),
    },
    {
      id: 'vehicle',
      label: 'Vehicle applicable + margin',
      ok: capability?.applicable !== false && margin?.feasible !== false,
    },
    {
      id: 'flybys',
      label: 'Flybys achievable',
      ok: !quality.gates.some((g) => g.code === 'G_FLYBY_ALL' && g.level === 'fail'),
    },
    {
      id: 'asymptote',
      label: 'Asymptote DLA/RLA',
      ok: asymptotePkg != null || !!td.isMultiLeg,
      na: !!td.isMultiLeg,
    },
    {
      id: 'mission_parking',
      label: 'Mission parking budget',
      ok: !td.isMultiLeg,
      na: !!td.isMultiLeg,
    },
    {
      id: 'fidelity',
      label: 'Fidelity labeled',
      ok: true,
    },
  ];
  return {
    items,
    missing: items.filter((i) => !i.ok && !i.na).map((i) => i.id),
  };
}

/**
 * Status banner + recovery + checklist HTML.
 */
export function planStatusBannerHtml(dossier) {
  if (!dossier) return '';
  const st = dossier.status;
  const color = st === 'pass' ? 'green' : st === 'pass_with_warnings' ? 'amber' : 'red-val';
  const title = st === 'pass' ? 'PLAN PASS'
    : st === 'pass_with_warnings' ? 'PLAN PASS WITH WARNINGS'
      : 'PLAN FAILED';

  const gateLines = (dossier.gates || [])
    .filter((g) => g.level !== 'ok')
    .map((g) => {
      const mark = g.level === 'fail' ? '✗' : '!';
      return `<div class="info-row"><span class="key">${mark} ${g.code}</span><span class="val ${g.level === 'fail' ? 'red-val' : 'amber'}">${g.message}</span></div>`;
    })
    .join('');

  const actions = (dossier.recovery?.actions || [])
    .map((a) => `<button type="button" class="btn-tiny plan-recovery-btn" data-action="${a.id}">${a.label}</button>`)
    .join(' ');

  const checkItems = (dossier.completeness?.items || [])
    .map((i) => {
      if (i.na) return `<span style="opacity:0.5">— ${i.label}</span>`;
      return i.ok
        ? `<span class="green">✓ ${i.label}</span>`
        : `<span class="red-val">✗ ${i.label}</span>`;
    })
    .join(' · ');

  let dateNote = '';
  if (dossier.geometry?.date_adjusted) {
    dateNote = `<div class="info-row"><span class="key">Date adjusted</span><span class="val amber">was ${
      dossier.geometry.prev_departure_iso?.slice(0, 10) || '?'
    } → ${dossier.geometry.departure_iso?.slice(0, 10) || '?'}</span></div>`;
  }

  let asym = '';
  if (dossier.geometry?.dla_ecliptic_deg != null) {
    asym = `
      <div class="info-row"><span class="key">DLA (ecliptic-class)</span><span class="val">${dossier.geometry.dla_ecliptic_deg.toFixed(2)}°</span></div>
      <div class="info-row"><span class="key">RLA (ecliptic-class)</span><span class="val">${dossier.geometry.rla_ecliptic_deg.toFixed(2)}°</span></div>`;
    if (dossier.geometry.dla_eq_deg != null) {
      asym += `
      <div class="info-row"><span class="key">DLA (Earth-eq approx)</span><span class="val amber">${dossier.geometry.dla_eq_deg.toFixed(2)}°</span></div>
      <div class="info-row"><span class="key">RLA (Earth-eq approx)</span><span class="val amber">${dossier.geometry.rla_eq_deg.toFixed(2)}°</span></div>
      <div class="info-row"><span class="key">Asymptote note</span><span class="val" style="font-size:9px">Mean obliquity educational — not range safety</span></div>`;
    } else {
      asym += `<div class="info-row"><span class="key">Asymptote frame</span><span class="val" style="font-size:9px">${dossier.geometry.asymptote_frame || ''}</span></div>`;
    }
  }

  let ascent = '';
  const al = dossier.ascent_loss;
  if (al && al.budget_m_s > 0) {
    ascent = `
      <div class="result-subtitle" style="font-size:8px">ASCENT LOSS (EDU — NOT IN LAMBERT NEED)</div>
      <div class="info-row"><span class="key">Budget</span><span class="val">${formatVelocity(al.budget_m_s)}</span></div>
      ${al.ideal_stack_dv_m_s != null ? `<div class="info-row"><span class="key">Ideal stage/stack Δv</span><span class="val">${formatVelocity(al.ideal_stack_dv_m_s)}</span></div>` : ''}
      ${al.residual_after_ascent_m_s != null ? `<div class="info-row"><span class="key">Residual after ascent</span><span class="val amber">${formatVelocity(al.residual_after_ascent_m_s)}</span></div>` : ''}
      ${al.residual_minus_need_m_s != null ? `<div class="info-row"><span class="key">Residual − Need (edu)</span><span class="val">${formatVelocity(al.residual_minus_need_m_s)}</span></div>` : ''}
      <div class="info-row"><span class="key">Note</span><span class="val" style="font-size:9px">${al.note}</span></div>`;
  }

  const siteLine = dossier.launch_site
    ? `<div class="info-row"><span class="key">Launch site (edu)</span><span class="val">${dossier.launch_site.name}</span></div>`
    : '';

  const multiPark = dossier.inputs?.multi_leg
    ? `<div class="info-row"><span class="key">Mission parking</span><span class="val amber">n/a multi-leg — SOI escape/capture not chained</span></div>`
    : '';

  return `
    <div class="plan-status-banner" data-status="${st}" id="plan-status-banner">
      <div class="result-subtitle">PLAN STATUS · <span class="${color}">${title}</span>
        · conf ${dossier.confidence_0_100} (${dossier.confidence_label})
      </div>
      <div class="info-row"><span class="key">Mission ready</span><span class="val ${dossier.mission_ready ? 'green' : 'red-val'}">${
        dossier.mission_ready ? 'YES — Launch enabled' : 'NO — Launch blocked'
      }</span></div>
      <div class="info-row"><span class="key">Confidence note</span><span class="val" style="font-size:9px;opacity:0.8">${dossier.confidence_note}</span></div>
      ${siteLine}
      ${multiPark}
      ${dateNote}
      ${gateLines || '<div class="info-row"><span class="key">Gates</span><span class="val green">All critical gates OK</span></div>'}
      ${asym}
      ${ascent}
      <div style="height:4px"></div>
      <div class="result-subtitle" style="font-size:8px">RECOVERY</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px">${actions || '<span class="val" style="font-size:10px">—</span>'}</div>
      <div class="result-subtitle" style="font-size:8px">COMPLETENESS</div>
      <div style="font-size:10px;line-height:1.5;margin-bottom:8px">${checkItems}</div>
      ${trustCardHtml(dossier, dossier.fidelity)}
    </div>`;
}

export function formatDossierDvLine(dossier) {
  const g = dossier?.geometry;
  if (!g?.dv_total_m_s) return '';
  return formatVelocity(g.dv_total_m_s);
}
