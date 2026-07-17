/**
 * Plan quality gates (pure) — reliability design K1–K6, K11.
 * Educational completeness confidence, not navigation OD.
 */

import { AU } from '../constants.js';

// Keep in sync with routing.js MIN_PERIHELION_AU (avoid circular import).
const MIN_PERIHELION_AU = 0.3;

/** @typedef {'ok'|'warn'|'fail'} GateLevel */
/** @typedef {'pass'|'pass_with_warnings'|'fail'} PlanStatus */

/**
 * @param {object|null} td transferData
 * @param {object|null} measurement { need, capability, margin }
 * @param {object} [opts]
 * @param {boolean} [opts.dateAdjusted]
 * @param {boolean} [opts.sampleFallback]
 * @param {boolean} [opts.strictVehicle=true]
 * @param {boolean} [opts.strictSite=false]
 * @param {number|null} [opts.prevDepartureSimTime]
 * @param {number|null} [opts.dla_eq_deg] equatorial DLA if available
 * @param {number|null} [opts.dla_ecliptic_deg]
 * @param {string} [opts.launchSiteId]
 * @param {number|null} [opts.site_dla_max_deg]
 * @param {boolean} [opts.multiLeg]
 * @returns {{ status: PlanStatus, gates: object[], confidence_0_100: number, mission_ready: boolean }}
 */
export function runQualityGates(td, measurement = null, opts = {}) {
  const gates = [];
  const strictVehicle = opts.strictVehicle !== false;
  const strictSite = !!opts.strictSite;

  if (!td) {
    gates.push({
      code: 'G_ORIGIN_DEST',
      level: 'fail',
      message: 'No transfer data — set origin, destination, and compute.',
    });
    return finalize(gates);
  }

  // Origin/dest presence (multi-leg uses legs; single uses body1/body2)
  const hasBodies = !!(td.body1 && td.body2) || !!(td.isMultiLeg && td.legs?.length);
  if (!hasBodies) {
    gates.push({
      code: 'G_ORIGIN_DEST',
      level: 'fail',
      message: 'Origin and destination are required.',
    });
  } else {
    gates.push({
      code: 'G_ORIGIN_DEST',
      level: 'ok',
      message: 'Origin and destination set.',
    });
  }

  if (td.isMultiLeg) {
    const legs = td.legs || [];
    const allLegsOk = legs.length > 0 && legs.every((L) => L.ok);
    gates.push({
      code: 'G_ALL_LEGS',
      level: allLegsOk ? 'ok' : 'fail',
      message: allLegsOk
        ? `All ${legs.length} legs solved.`
        : 'One or more multi-leg Lambert solves failed.',
      detail: { n_legs: legs.length, failed: legs.filter((L) => !L.ok).map((L) => `${L.from}→${L.to}`) },
    });

    const flybys = td.flybys || [];
    const bad = flybys.filter((f) => f && f.achievable === false);
    // K1: any TOO SHARP flyby ⇒ fail
    gates.push({
      code: 'G_FLYBY_ALL',
      level: bad.length === 0 ? 'ok' : 'fail',
      message: bad.length === 0
        ? (flybys.length ? `All ${flybys.length} flybys achievable.` : 'No flybys.')
        : `Infeasible flyby at ${bad.map((f) => f.body || f.bodyName || '?').join(', ')}.`,
      detail: { bad: bad.map((f) => f.body || f.bodyName) },
    });

    // Multi-leg has no single lambertOk — use legs
    gates.push({
      code: 'G_LAMBERT_OK',
      level: allLegsOk ? 'ok' : 'fail',
      message: allLegsOk ? 'Multi-leg ballistic legs OK.' : 'Multi-leg ballistic geometry incomplete.',
    });

    // Perihelion per leg (hardening K15)
    let worstPeri = Infinity;
    let badLegs = [];
    for (const L of legs) {
      const orb = L.orbitPhysical;
      if (!orb) continue;
      const periAU = (orb.a * (1 - orb.e)) / AU;
      if (isFinite(periAU) && periAU < worstPeri) worstPeri = periAU;
      if (isFinite(periAU) && periAU < MIN_PERIHELION_AU) {
        badLegs.push({ from: L.from, to: L.to, perihelion_AU: periAU });
      }
    }
    if (badLegs.length) {
      gates.push({
        code: 'G_PERIHELION_LEGS',
        level: 'fail',
        message: `Sun-grazing multi-leg: ${badLegs.length} leg(s) perihelion < ${MIN_PERIHELION_AU} AU.`,
        detail: { bad: badLegs, min_AU: MIN_PERIHELION_AU },
      });
    } else if (allLegsOk && isFinite(worstPeri) && worstPeri < Infinity) {
      gates.push({
        code: 'G_PERIHELION_LEGS',
        level: 'ok',
        message: `Multi-leg perihelia OK (worst ${worstPeri.toFixed(3)} AU).`,
        detail: { worst_perihelion_AU: worstPeri },
      });
    }

    const totalDvMl = td.dvTotalMultiLeg;
    if (totalDvMl != null && isFinite(totalDvMl)) {
      const ok = totalDvMl > 0 && totalDvMl <= 30000;
      gates.push({
        code: 'G_DV_SANE',
        level: ok ? 'ok' : 'fail',
        message: ok
          ? `Multi-leg Δv ${(totalDvMl / 1000).toFixed(2)} km/s within sanity bound.`
          : `Multi-leg Δv ${(totalDvMl / 1000).toFixed(2)} km/s exceeds 30 km/s sanity bound.`,
        detail: { total_dv_m_s: totalDvMl },
      });
    }
  } else {
    // Single-leg
    if (td.lambertOk) {
      gates.push({
        code: 'G_LAMBERT_OK',
        level: 'ok',
        message: 'Ballistic Lambert solution OK.',
        detail: { longWay: td.longWay },
      });
    } else {
      gates.push({
        code: 'G_LAMBERT_OK',
        level: 'fail',
        message: 'No ballistic Lambert solution — Hohmann estimate only, not mission-ready.',
      });
    }

    const orb = td.orbitPhysical;
    const periAU = orb ? (orb.a * (1 - orb.e)) / AU : null;
    if (periAU != null && isFinite(periAU)) {
      const ok = periAU >= MIN_PERIHELION_AU;
      gates.push({
        code: 'G_PERIHELION',
        level: ok ? 'ok' : 'fail',
        message: ok
          ? `Perihelion ${periAU.toFixed(3)} AU ≥ ${MIN_PERIHELION_AU} AU.`
          : `Sun-grazing transfer: perihelion ${periAU.toFixed(3)} AU < ${MIN_PERIHELION_AU} AU.`,
        detail: { perihelion_AU: periAU, min_AU: MIN_PERIHELION_AU },
      });
    } else if (td.lambertOk) {
      gates.push({
        code: 'G_PERIHELION',
        level: 'warn',
        message: 'Perihelion not available on orbit object.',
      });
    }

    const totalDv = td.dvTotal_lambert ?? td.dvTotal;
    if (totalDv != null && isFinite(totalDv)) {
      const ok = totalDv > 0 && totalDv <= 30000;
      gates.push({
        code: 'G_DV_SANE',
        level: ok ? 'ok' : 'fail',
        message: ok
          ? `Heliocentric Δv ${(totalDv / 1000).toFixed(2)} km/s within sanity bound.`
          : `Heliocentric Δv ${(totalDv / 1000).toFixed(2)} km/s exceeds 30 km/s sanity bound.`,
        detail: { total_dv_m_s: totalDv },
      });
    }
  }

  // Vehicle gates from measurement triad
  const cap = measurement?.capability;
  const margin = measurement?.margin;
  if (cap) {
    if (cap.applicable === false) {
      gates.push({
        code: 'G_VEHICLE_APPLICABLE',
        level: strictVehicle ? 'fail' : 'warn',
        message: cap.reason || 'Vehicle model not applicable to this departure.',
      });
    } else {
      gates.push({
        code: 'G_VEHICLE_APPLICABLE',
        level: 'ok',
        message: 'Vehicle model applicable.',
      });
    }
  }

  if (margin && cap?.applicable !== false) {
    if (margin.feasible === false) {
      gates.push({
        code: 'G_VEHICLE_FEASIBLE',
        level: strictVehicle ? 'fail' : 'warn',
        message: margin.reason || 'Vehicle margin negative — cannot meet Need.',
        detail: {
          kind: margin.kind,
          margin_dv_m_s: margin.margin_dv_m_s,
          margin_cargo_kg: margin.margin_cargo_kg,
        },
      });
    } else if (margin.feasible === true) {
      gates.push({
        code: 'G_VEHICLE_FEASIBLE',
        level: 'ok',
        message: 'Vehicle margin feasible.',
      });
    }
  }

  if (opts.dateAdjusted) {
    gates.push({
      code: 'G_DATE_ADJUSTED',
      level: 'warn',
      message: 'Departure was auto-adjusted to nearest feasible window.',
      detail: {
        prev_departure_sim: opts.prevDepartureSimTime ?? null,
        new_departure_sim: td.departureSimTime ?? null,
      },
    });
  }

  if (opts.sampleFallback) {
    gates.push({
      code: 'G_SAMPLE_OOR',
      level: 'warn',
      message:
        'Requested offline sample table (not DE/SPICE) out of range — fell back to Approximate Positions for one or more endpoints.',
    });
  }

  if (opts.pathologicalUnrecovered) {
    gates.push({
      code: 'G_PATHOLOGICAL',
      level: 'fail',
      message: 'Pathological transfer and no feasible recovery window found.',
    });
  }

  // Multi-leg parking completeness honesty (always ok with n/a note via completeness UI)
  if (opts.multiLeg || td.isMultiLeg) {
    gates.push({
      code: 'G_MISSION_PARKING',
      level: 'ok',
      message: 'Mission parking budget is single-leg only (multi-leg n/a by design).',
    });
  }

  // Launch site vs DLA (educational)
  const siteMax = opts.site_dla_max_deg;
  const dlaUse = opts.dla_eq_deg != null && isFinite(opts.dla_eq_deg)
    ? Math.abs(opts.dla_eq_deg)
    : (opts.dla_ecliptic_deg != null && isFinite(opts.dla_ecliptic_deg)
      ? Math.abs(opts.dla_ecliptic_deg) : null);
  if (siteMax != null && siteMax < 90 && dlaUse != null) {
    const ok = dlaUse <= siteMax + 0.5;
    const level = ok ? 'ok' : (strictSite ? 'fail' : 'warn');
    gates.push({
      code: 'G_SITE_DLA',
      level,
      message: ok
        ? `Asymptote |DLA| ${dlaUse.toFixed(1)}° within site band ${siteMax}° (${opts.launchSiteId || 'site'}).`
        : `Asymptote |DLA| ${dlaUse.toFixed(1)}° exceeds educational site band ${siteMax}° (${opts.launchSiteId || 'site'}) — not range safety.`,
      detail: { dla_deg: dlaUse, site_max_deg: siteMax, site: opts.launchSiteId },
    });
  }

  return finalize(gates);
}

function finalize(gates) {
  const hasFail = gates.some((g) => g.level === 'fail');
  const hasWarn = gates.some((g) => g.level === 'warn');
  /** @type {PlanStatus} */
  let status = 'pass';
  if (hasFail) status = 'fail';
  else if (hasWarn) status = 'pass_with_warnings';

  let conf = 100;
  if (hasFail) conf = 0;
  else {
    const nWarn = gates.filter((g) => g.level === 'warn').length;
    conf = Math.max(0, 100 - Math.min(45, nWarn * 15));
  }

  const mission_ready = status !== 'fail';
  // Default: launch_enabled tracks mission_ready. Optional strict warnings later.
  const launch_enabled = mission_ready;

  return {
    status,
    gates,
    confidence_0_100: conf,
    mission_ready,
    launch_enabled,
  };
}

/**
 * Human recovery hints from gates.
 */
export function recoveryFromGates(gates, td) {
  const failCodes = new Set((gates || []).filter((g) => g.level === 'fail').map((g) => g.code));
  const actions = [];
  if (failCodes.has('G_PATHOLOGICAL') || failCodes.has('G_PERIHELION')
      || failCodes.has('G_PERIHELION_LEGS') || failCodes.has('G_DV_SANE')
      || failCodes.has('G_LAMBERT_OK')) {
    actions.push({
      id: 'find_nearest_window',
      label: 'Find nearest feasible window',
      primary: true,
    });
    actions.push({ id: 'open_porkchop', label: 'Open launch windows (porkchop)' });
  }
  if (failCodes.has('G_FLYBY_ALL') || failCodes.has('G_ALL_LEGS')) {
    actions.push({ id: 'snap_flybys', label: 'Snap flyby dates', primary: true });
    actions.push({ id: 'open_porkchop', label: 'Open launch windows' });
  }
  if (failCodes.has('G_VEHICLE_FEASIBLE') || failCodes.has('G_VEHICLE_APPLICABLE')) {
    actions.push({
      id: 'adjust_vehicle',
      label: 'Adjust vehicle / cargo / architecture',
      primary: true,
    });
  }
  if (failCodes.has('G_SITE_DLA') || (gates || []).some((g) => g.code === 'G_SITE_DLA' && g.level === 'warn')) {
    actions.push({
      id: 'adjust_site',
      label: 'Relax launch site or change window',
    });
  }
  if (!actions.length && td) {
    actions.push({ id: 'open_porkchop', label: 'Explore other windows' });
  }
  return {
    primary: actions.find((a) => a.primary)?.id || actions[0]?.id || null,
    actions,
  };
}
