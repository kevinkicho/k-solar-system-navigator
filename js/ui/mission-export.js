/**
 * Mission plan JSON export — structured trajectory download for tooling.
 * Every vector is in m/s or m, every epoch is ISO-8601 UTC, every angle is degrees.
 */
import {
  reservedDeltaV, totalMissionDeltaV, presetDisplayName, presetDisclaimer,
  evaluateCapability, evaluateMargin,
} from '../physics/vehicles.js';
import { DAY, DEG } from '../constants.js';
import { state } from '../state.js';
import { bodyId } from '../data/catalog.js';
import { getBodyVelocity3D } from '../physics/kepler.js';
import { propagateOrbit } from '../physics/helio.js';
import { v3dot, v3sub } from '../physics/vec3.js';
import { computeMissionBudget } from '../physics/mission-budget.js';
import { requiredDeltaV, transferBudgetNow, computeNeedNow } from './mission-budget-ui.js';

export function exportMissionPlan(td) {
  const plan = buildPlanObject(td);
  const json = JSON.stringify(plan, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `helios-mission-${td.body1.name}-to-${td.body2.name}-${plan.summary.departure_utc.slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  import('./format.js').then(({ notify }) => notify('MISSION PLAN EXPORTED'));
}

/** Exported for offline tests (PR 10). */
export function buildPlanObject(td) {
  const isMulti = !!td.isMultiLeg;
  const helioDv = isMulti ? td.dvTotalMultiLeg
                          : (td.lambertOk ? td.dvTotal_lambert : td.dvTotal);
  const missionBudget = (!isMulti && td.lambertOk) ? computeMissionBudget(td) : null;
  const costBasis = isMulti ? 'helio' : state.costBasis;
  const required = requiredDeltaV(td);
  const budget = transferBudgetNow();
  const need = computeNeedNow(td);
  const request = {
    vehicleId: state.vehicleId,
    cargoMass_kg: state.cargoMass_kg ?? 0,
    starshipArch: state.starshipArch ?? 'legacy-demo',
    tankerCount: state.tankerCount ?? 0,
    falcon9Variant: state.falcon9Variant || 'expendable',
    abstractBudget_m_s: state.abstractBudget_m_s,
    originBody: td.body1,
    solveTankers: state.starshipArch === 'tanker-n',
  };
  const capability = evaluateCapability(need, request);
  const margin = evaluateMargin(need, capability, request);
  const feasible = !!margin.feasible;
  const isoUTC = (simT) => new Date(simT * 1000 + Date.UTC(2000, 0, 1, 12, 0, 0)).toISOString();

  const plan = {
    schema_version: 3,
    generated_at: new Date().toISOString(),
    frame: 'Heliocentric Ecliptic J2000',
    units: { distance: 'm', velocity: 'm/s', angle: 'deg', time: 'ISO-8601 UTC', mass: 'kg' },
    methodology: {
      ephemeris: 'JPL Approximate Positions of Major Planets 1800-2050',
      transfer: 'Lambert universal-variable, dual geometry (physical Δv / visual line)',
      disclaimer: 'Educational / concept-grade sketch — not flight operations; not SpaceX-certified performance.',
      display_mode: state.display?.mode || 'cinematic',
      fidelity: state.fidelityLevel || 'L1',
    },
    summary: {
      origin: td.body1.name,
      origin_id: bodyId(td.body1),
      destination: td.body2.name,
      destination_id: bodyId(td.body2),
      departure_utc: isoUTC(td.departureSimTime),
      arrival_utc:   isoUTC(td.arrivalSimTime),
      transit_days:  td.transferTime / DAY,
      total_dv_m_s:  required,
      heliocentric_total_dv_m_s: helioDv,
      mission_total_dv_m_s: missionBudget ? missionBudget.totalMission : null,
      cost_basis: costBasis,
      multi_leg:     isMulti,
      n_flybys:      isMulti ? td.flybys.length : 0,
      cargo_mass_kg: state.cargoMass_kg ?? 0,
    },
    plan_request: {
      v: 1,
      o: bodyId(td.body1),
      d: bodyId(td.body2),
      dep: isoUTC(td.departureSimTime).slice(0, 10),
      tof: Math.round(td.transferTime / DAY),
      veh: state.vehicleId,
      ab: state.abstractBudget_m_s,
      basis: costBasis,
      view: state.display?.mode || 'cinematic',
      cargo: Math.round(state.cargoMass_kg || 0),
      arch: state.vehicleId === 'sh-starship' ? (state.starshipArch || 'legacy-demo') : undefined,
      tankers: state.starshipArch === 'tanker-n' ? (state.tankerCount || 0) : undefined,
      f9v: state.vehicleId === 'falcon9' ? (state.falcon9Variant || 'expendable') : undefined,
    },
    measurement: {
      need,
      capability,
      margin,
      disclaimer: capability.disclaimer || presetDisclaimer(state.vehicleId),
      fidelity: state.fidelityLevel || 'L1',
    },
    // Deprecated mirror for v2 consumers (K13)
    feasibility: {
      deprecated: true,
      vehicle: presetDisplayName(state.vehicleId),
      vehicle_id: state.vehicleId,
      transfer_dv_budget_m_s: budget,
      required_dv_m_s: required,
      cost_basis: costBasis,
      total_stack_dv_m_s: state.vehicleId === 'sh-starship' && state.starshipArch === 'legacy-demo'
        ? totalMissionDeltaV() : null,
      reserved_dv_m_s: state.vehicleId === 'sh-starship' && state.starshipArch === 'legacy-demo'
        ? reservedDeltaV() : null,
      feasible,
      disclaimer: presetDisclaimer(state.vehicleId),
    },
  };

  if (!isMulti) {
    plan.maneuvers = [
      buildSingleLegManeuvers(td),
    ].flat();
    if (td.orbitPhysical) plan.transfer_orbit = serializeOrbit(td.orbitPhysical);
  } else {
    plan.legs = td.legs.map((L, i) => ({
      index: i,
      from: L.from,
      to:   L.to,
      depart_utc: isoUTC(L.departSimTime),
      arrive_utc: isoUTC(L.arriveSimTime),
      tof_days: L.tof / DAY,
      v1_m_s: L.v1, v2_m_s: L.v2,
      transfer_orbit: L.orbitPhysical ? serializeOrbit(L.orbitPhysical) : null,
      lambert_ok: L.ok,
    }));
    plan.maneuvers = td.maneuvers.map(m => {
      const base = { type: m.type, body: m.body, epoch_utc: isoUTC(m.simTime), dv_m_s: m.dv };
      if (m.type === 'flyby' && m.info) {
        base.flyby = {
          v_inf_in_m_s:   m.info.vInfInMag,
          v_inf_out_m_s:  m.info.vInfOutMag,
          turning_angle_deg: m.info.turningAngle / DEG,
          max_turning_deg:   m.info.maxTurningAngle / DEG,
          periapsis_required_m: m.info.rPeriapsis,
          periapsis_min_m:      m.info.minR,
          achievable: m.info.achievable,
        };
      }
      return base;
    });
  }

  return plan;
}

function buildSingleLegManeuvers(td) {
  if (!td.lambertOk || !td.orbitPhysical) {
    // Lambert failed — fall back to coarse Hohmann numbers.
    return [
      { type: 'depart', body: td.body1.name, epoch_utc: new Date(td.departureSimTime*1000 + Date.UTC(2000,0,1,12)).toISOString(), dv_m_s: td.dv1 },
      { type: 'arrive', body: td.body2.name, epoch_utc: new Date(td.arrivalSimTime*1000 + Date.UTC(2000,0,1,12)).toISOString(), dv_m_s: td.dv2 },
    ];
  }
  // Compute V∞ at departure & arrival from the Lambert solution.
  const vBody1 = getBodyVelocity3D(td.body1, td.departureSimTime, false);
  const vBody2 = getBodyVelocity3D(td.body2, td.arrivalSimTime, false);
  // Re-derive v1/v2 by infinitesimal propagation on the physical transfer orbit.
  const r1 = propagateOrbit(td.orbitPhysical, 0);
  const r2 = propagateOrbit(td.orbitPhysical, td.transferTime);
  const dt = 60;
  const r1plus  = propagateOrbit(td.orbitPhysical, dt);
  const r2minus = propagateOrbit(td.orbitPhysical, td.transferTime - dt);
  const v1 = [(r1plus[0]-r1[0])/dt, (r1plus[1]-r1[1])/dt, (r1plus[2]-r1[2])/dt];
  const v2 = [(r2[0]-r2minus[0])/dt, (r2[1]-r2minus[1])/dt, (r2[2]-r2minus[2])/dt];
  const vInfDep = v3sub(v1, vBody1);
  const vInfArr = v3sub(v2, vBody2);
  const c3 = v3dot(vInfDep, vInfDep);

  const isoUTC = (simT) => new Date(simT * 1000 + Date.UTC(2000, 0, 1, 12, 0, 0)).toISOString();
  return [
    {
      type: 'depart', body: td.body1.name,
      epoch_utc: isoUTC(td.departureSimTime),
      dv_m_s: td.dv1_lambert,
      v_inf_m_s: vInfDep, c3_m2_s2: c3,
    },
    {
      type: 'arrive', body: td.body2.name,
      epoch_utc: isoUTC(td.arrivalSimTime),
      dv_m_s: td.dv2_lambert,
      v_inf_m_s: vInfArr,
    },
  ];
}

function serializeOrbit(o) {
  return {
    semi_major_axis_m: o.a,
    eccentricity: o.e,
    semi_latus_rectum_m: o.p,
    p_hat: o.p_hat, q_hat: o.q_hat, w_hat: o.w_hat,
    M0_rad: o.M0, mean_motion_rad_s: o.n,
  };
}
