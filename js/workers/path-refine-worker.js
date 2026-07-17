/**
 * Progressive path densify (PR8). Main posts orbit + TOF; worker returns adaptive samples.
 * Payload is self-contained (no DOM / Three).
 */
import { AU, DAY, PI } from '../constants.js';
import { getSunBarycentricOffset } from '../physics/kepler.js';
import { propagateOrbitState, propagateHelioOrbitState } from '../physics/helio.js';

function stateAtDt(orb, dt) {
  if (!orb) return null;
  try {
    if (orb.hyperbolic || orb.e >= 1) {
      return propagateHelioOrbitState({ ...orb, hyperbolic: true }, dt);
    }
    return propagateOrbitState(orb, dt);
  } catch {
    return null;
  }
}

function applyOff(rHelio, t, policy, tMid, tDep) {
  let tOff = t;
  if (policy === 'mid_epoch') tOff = tMid;
  if (policy === 'locked_departure') tOff = tDep;
  if (policy === 'none') return { x: rHelio.x, y: rHelio.y, z: rHelio.z };
  const off = getSunBarycentricOffset(tOff, true);
  return { x: rHelio.x + off.x, y: rHelio.y + off.y, z: rHelio.z + off.z };
}

function densify(orb, tDep, tof, offsetPolicy, n0, maxN) {
  const tMid = tDep + tof / 2;
  const pts = [];
  for (let i = 0; i <= n0; i++) {
    const dt = (i / n0) * tof;
    const st = stateAtDt(orb, dt);
    if (!st) return null;
    const h = { x: st.r[0] / AU, y: st.r[1] / AU, z: st.r[2] / AU };
    const s = applyOff(h, tDep + dt, offsetPolicy, tMid, tDep);
    pts.push({ t_sec: tDep + dt, ...s, r_helio: h });
  }
  const eps = 0.03;
  const Lmax = 0.2;
  let cur = pts;
  for (let pass = 0; pass < 6 && cur.length < maxN; pass++) {
    const next = [cur[0]];
    let added = 0;
    for (let i = 1; i < cur.length; i++) {
      const a = cur[i - 1], b = cur[i];
      const chord = Math.hypot(
        b.r_helio.x - a.r_helio.x,
        b.r_helio.y - a.r_helio.y,
        b.r_helio.z - a.r_helio.z,
      );
      if (chord > Lmax || chord > eps) {
        const tM = 0.5 * (a.t_sec + b.t_sec);
        const st = stateAtDt(orb, tM - tDep);
        if (st) {
          const h = { x: st.r[0] / AU, y: st.r[1] / AU, z: st.r[2] / AU };
          const mx = 0.5 * (a.r_helio.x + b.r_helio.x);
          const my = 0.5 * (a.r_helio.y + b.r_helio.y);
          const mz = 0.5 * (a.r_helio.z + b.r_helio.z);
          const err = Math.hypot(h.x - mx, h.y - my, h.z - mz);
          if (err > eps * 0.4 || chord > Lmax) {
            const s = applyOff(h, tM, offsetPolicy, tMid, tDep);
            next.push({ t_sec: tM, ...s, r_helio: h });
            added++;
          }
        }
      }
      next.push(b);
      if (next.length >= maxN) break;
    }
    cur = next;
    if (!added) break;
  }
  return cur;
}

self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'refine') return;
  const { requestId, orbit, tDep, tof, offsetPolicy, nSamples, maxSamples } = msg;
  if (!orbit || !(tof > 0)) {
    self.postMessage({ type: 'path-refined', requestId, points: [] });
    return;
  }
  const points = densify(
    orbit, tDep, tof, offsetPolicy || 'time_varying',
    nSamples || 128, maxSamples || 1024,
  );
  self.postMessage({
    type: 'path-refined',
    requestId,
    points: (points || []).map((p) => ({ x: p.x, y: p.y, z: p.z, t_sec: p.t_sec })),
  });
};

// silence unused
void DAY; void PI;
