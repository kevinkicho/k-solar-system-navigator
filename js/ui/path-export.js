/**
 * Export transfer path samples as CSV (scene-frame AU) for external tools.
 */
import { state } from '../state.js';
import { DAY } from '../constants.js';
import { buildTransferPathSamples } from '../physics/transfer-path.js';
import { notify } from './format.js';

/**
 * @param {object} td transfer data
 * @param {{ geometry?: 'visual'|'physical', nSamples?: number }} [opts]
 * @returns {string} CSV text
 */
export function buildPathCsv(td, opts = {}) {
  if (!td) throw new Error('No transfer');
  const geom = opts.geometry
    || (state.pathGeometry === 'physical' ? 'physical' : 'visual');
  const nSamples = opts.nSamples ?? 321;
  const built = buildTransferPathSamples(td, {
    geometry: geom,
    exaggerate: geom !== 'physical',
    nSamples,
    offsetPolicy: state.pathOffsetPolicy || 'time_varying',
    sampleMode: state.pathSampleMode || 'equal_time',
  });
  const pts = built.points || [];
  const t0 = td.departureSimTime ?? 0;
  const T = td.transferTime ?? 0;
  const lines = [
    '# HELIOS transfer path CSV',
    `# origin=${td.body1?.name || '?'} dest=${td.body2?.name || '?'}`,
    `# geometry=${geom} frame=scene_AU offset=${state.pathOffsetPolicy || 'time_varying'}`,
    '# disclaimer=preliminary Kepler conic analysis — not live SPICE / not flight-certified',
    'i,frac,t_sim_s,tof_days,x_AU,y_AU,z_AU',
  ];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const frac = pts.length > 1 ? i / (pts.length - 1) : 0;
    const t = p.t != null ? p.t : (t0 + frac * T);
    const tofDays = T > 0 ? ((t - t0) / DAY) : (frac * (T / DAY));
    lines.push([
      i,
      frac.toFixed(6),
      Number(t).toFixed(3),
      tofDays.toFixed(6),
      Number(p.x).toExponential(9),
      Number(p.y).toExponential(9),
      Number(p.z).toExponential(9),
    ].join(','));
  }
  return lines.join('\n');
}

export function exportPathCsv(td) {
  if (!td) {
    notify('NO TRANSFER TO EXPORT');
    return;
  }
  try {
    const csv = buildPathCsv(td);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const o = td.body1?.name || 'origin';
    const d = td.body2?.name || 'dest';
    a.download = `helios-path-${o}-to-${d}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('PATH CSV EXPORTED');
  } catch (err) {
    console.warn(err);
    notify(`PATH EXPORT FAILED: ${err?.message || 'error'}`);
  }
}
