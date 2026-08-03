/**
 * Free-return / sample-return educational sketches.
 * Not a true free-return OD design — uses reverse direct baseline + stay time.
 * Not flight-certified.
 */

import { DAY } from '../constants.js';
import { evaluateDirectBaseline } from './ga-suggest.js';

/**
 * Sketch outbound + stay + return as two direct Lamberts (not free-return geometry).
 * @param {object} origin Earth-like home
 * @param {object} dest target
 * @param {number} depHint simTime outbound
 * @param {object} [routeOpts]
 * @param {object} [opts] { stay_days, return_dep_offset_days }
 */
export function sketchSampleReturn(origin, dest, depHint, routeOpts = {}, opts = {}) {
  if (!origin || !dest) {
    return {
      ok: false,
      error: 'origin and dest required',
      product_class: 'preliminary-not-flight-certified',
    };
  }
  const stayDays = opts.stay_days ?? 30;
  const out = evaluateDirectBaseline(origin, dest, depHint, routeOpts);
  if (!out) {
    return {
      ok: false,
      error: 'outbound baseline failed',
      product_class: 'preliminary-not-flight-certified',
      note: 'Could not evaluate outbound direct seed',
    };
  }
  const returnDep = (out.arrivalSimTime ?? depHint + (out.tof_days || 200) * DAY)
    + stayDays * DAY
    + (opts.return_dep_offset_days || 0) * DAY;
  const ret = evaluateDirectBaseline(dest, origin, returnDep, routeOpts);
  if (!ret) {
    return {
      ok: true,
      partial: true,
      outbound: slim(out),
      inbound: null,
      stay_days: stayDays,
      product_class: 'preliminary-not-flight-certified',
      note: 'Outbound only — return seed failed. Not a free-return trajectory design.',
    };
  }
  const totalDv = (out.dvTotal_m_s || 0) + (ret.dvTotal_m_s || 0);
  const totalTof = (out.tof_days || 0) + stayDays + (ret.tof_days || 0);
  return {
    ok: true,
    kind: 'sample_return_sketch',
    label: `${origin.name} ⇄ ${dest.name} (outbound + stay + return)`,
    outbound: slim(out),
    inbound: slim(ret),
    stay_days: stayDays,
    total_dv_m_s: totalDv,
    total_tof_days: totalTof,
    product_class: 'preliminary-not-flight-certified',
    note: 'Educational outbound+return pair of direct Lamberts — NOT a free-return corridor, NOT multi-rev free-return OD, not flight-certified.',
    generated_at: new Date().toISOString(),
  };
}

function slim(s) {
  if (!s) return null;
  return {
    kind: s.kind,
    dvTotal_m_s: s.dvTotal_m_s,
    tof_days: s.tof_days,
    departureSimTime: s.departureSimTime,
    arrivalSimTime: s.arrivalSimTime,
  };
}

/**
 * Flag whether a route could host a sample-return study (Earth home + planet).
 */
export function canSketchSampleReturn(origin, dest) {
  if (!origin || !dest) return false;
  const o = (origin.name || '').toLowerCase();
  const d = (dest.name || '').toLowerCase();
  return (o === 'earth' && d !== 'earth') || (d === 'earth' && o !== 'earth');
}
