/**
 * Cowell n-body overlay worker (PR10). Never feeds Need/Δv.
 */
import { cowellPropagate } from '../physics/nbody-cowell.js';
import { getSunBarycentricOffset } from '../physics/kepler.js';
import { AU } from '../constants.js';

self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'propagate') return;
  const { requestId, r0, v0, tDep, tof, nSteps } = msg;
  if (!r0 || !v0 || !(tof > 0)) {
    self.postMessage({ type: 'nbody-path', requestId, points: [] });
    return;
  }
  try {
    const out = cowellPropagate(r0, v0, tDep, tof, nSteps || 200);
    const points = out.points_AU.map((p) => {
      const off = getSunBarycentricOffset(p.t, true);
      return { x: p.x + off.x, y: p.y + off.y, z: p.z + off.z };
    });
    self.postMessage({
      type: 'nbody-path',
      requestId,
      points,
      residualHint: out.residualHint,
    });
  } catch (e) {
    self.postMessage({ type: 'nbody-path', requestId, points: [], error: String(e) });
  }
};

void AU;
