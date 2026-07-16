/**
 * Porkchop cargo heatmap helpers (concept-grade).
 * Maps Lambert cell C3 / Δv → max cargo kg for the active vehicle architecture.
 * Pure functions — no DOM.
 */

import { falcon9MaxPayloadKg, falcon9EarthDepartureOnly } from '../data/falcon9-c3-table.js';
import { maxCargoForNeed } from './starship-architecture.js';

/**
 * Which cargo map applies for the current vehicle + origin.
 * @returns {'f9'|'ss'|null}
 */
export function cargoHeatmapMode(vehicleId, originBody, starshipArch) {
  if (vehicleId === 'falcon9') {
    return falcon9EarthDepartureOnly(originBody) ? 'f9' : null;
  }
  if (vehicleId === 'sh-starship'
      && starshipArch
      && starshipArch !== 'legacy-demo') {
    return 'ss';
  }
  return null;
}

/**
 * Max cargo at a single porkchop cell (kg), or null if inapplicable / out of range.
 * @param {object} opts
 * @param {'f9'|'ss'|null} opts.mode
 * @param {number} opts.c3_m2_s2
 * @param {number} opts.dv_m_s total Lambert Δv for SS modes
 * @param {'expendable'|'asds'} [opts.falcon9Variant]
 * @param {string} [opts.starshipArch]
 * @param {number} [opts.tankerCount]
 */
export function cellMaxCargoKg(opts = {}) {
  const mode = opts.mode;
  if (!mode) return null;
  if (mode === 'f9') {
    if (!isFinite(opts.c3_m2_s2)) return null;
    return falcon9MaxPayloadKg(opts.c3_m2_s2, opts.falcon9Variant || 'expendable');
  }
  if (mode === 'ss') {
    if (!isFinite(opts.dv_m_s) || opts.dv_m_s <= 0) return null;
    const maxC = maxCargoForNeed(
      opts.dv_m_s,
      opts.starshipArch || 'unrefueled',
      opts.tankerCount || 0,
    );
    return maxC != null && isFinite(maxC) ? maxC : null;
  }
  return null;
}

/**
 * Fill a Float64Array of max cargo kg from existing C3 / Δv grids.
 * Non-finite / null → NaN in out.
 * @returns {{ min: number, max: number, finite: number }}
 */
export function fillCargoHeatmap(c3Arr, dvArr, out, opts = {}) {
  const n = out.length;
  let min = Infinity;
  let max = -Infinity;
  let finite = 0;
  const mode = opts.mode;
  for (let i = 0; i < n; i++) {
    const kg = cellMaxCargoKg({
      mode,
      c3_m2_s2: c3Arr[i],
      dv_m_s: dvArr[i],
      falcon9Variant: opts.falcon9Variant,
      starshipArch: opts.starshipArch,
      tankerCount: opts.tankerCount,
    });
    if (kg == null || !isFinite(kg)) {
      out[i] = NaN;
    } else {
      out[i] = kg;
      finite++;
      if (kg < min) min = kg;
      if (kg > max) max = kg;
    }
  }
  return {
    min: finite ? min : NaN,
    max: finite ? max : NaN,
    finite,
  };
}
