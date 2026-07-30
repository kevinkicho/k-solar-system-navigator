/**
 * Shared geometry helpers for Need / asymptote (keeps Need factually consistent
 * with DLA and planning ephemeris without requiring a pre-built dossier).
 */
import { getPlanningVelocity3D } from './ephemeris-provider.js';
import { getBodyVelocity3D } from './kepler.js';
import {
  departureVinfVec, arrivalVinfVec, vinfMagnitude, fullAsymptotePackage} from './departure-asymptote.js';

function isEarthBody(b) {
  if (!b) return false;
  const n = (b.name || b.id || '').toLowerCase();
  return n === 'earth';
}

/**
 * Compute departure asymptote package for a solved transfer (physical axes).
 * @param {object} td
 * @returns {object|null} fullAsymptotePackage
 */
export function computeTransferAsymptote(td) {
  if (!td || td.isMultiLeg || !td.lambertOk || !td.v1_lambert || !td.body1) return null;
  const pOpts = {
    backend: td.ephemerisBackend || 'approx'};
  let vPlanet;
  try {
    vPlanet = getPlanningVelocity3D(td.body1, td.departureSimTime, pOpts);
  } catch {
    vPlanet = getBodyVelocity3D(td.body1, td.departureSimTime, false);
  }
  const vInf = departureVinfVec(td.v1_lambert, vPlanet);
  return fullAsymptotePackage(vInf, { earthDeparture: isEarthBody(td.body1) });
}

/**
 * Arrival V∞ magnitude (m/s) when available.
 */
export function computeArrivalVinf_m_s(td) {
  if (!td || td.isMultiLeg || !td.lambertOk || !td.v2_lambert || !td.body2) return null;
  const pOpts = {
    backend: td.ephemerisBackend || 'approx'};
  let vP;
  try {
    vP = getPlanningVelocity3D(td.body2, td.arrivalSimTime, pOpts);
  } catch {
    vP = getBodyVelocity3D(td.body2, td.arrivalSimTime, false);
  }
  return vinfMagnitude(arrivalVinfVec(td.v2_lambert, vP));
}

/**
 * Options to pass into computeNeed so plane-change / site honesty use real DLA.
 */
export function needOptsFromTransfer(td, baseOpts = {}) {
  const asym = computeTransferAsymptote(td);
  const dlaEq = asym?.equatorial_approx?.dla_deg
    ?? asym?.ecliptic?.dla_deg
    ?? baseOpts.dla_eq_deg
    ?? null;
  return {
    ...baseOpts,
    dla_eq_deg: dlaEq,
    asymptote: asym};
}
