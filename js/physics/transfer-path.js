/**
 * Shared transfer path builder — single source of truth for dashed polyline
 * and mission ship placement (Phase 1 trajectory accuracy design).
 *
 * Pure ESM (no Three.js). Positions can be heliocentric or scene-frame
 * (heliocentric + sun barycentric offset policy).
 *
 * Breaking contract: sampleTransferPathAtTime / getShipPositionOnTransfer
 * return **scene-frame** positions when offsetPolicy !== 'none'. Callers must
 * NOT re-add getSunBarycentricOffset.
 */

import { AU, DAY, PI, TWO_PI } from '../constants.js';
import { getBodyPosition3D, getSunBarycentricOffset } from './kepler.js';
import {
  propagateOrbitState, propagateHelioOrbitState,
} from './helio.js';
import { v3dot, v3mag, v3scale } from './vec3.js';
import { isSchematic } from '../display-scale.js';

/** Parent-frame metres → heliocentric AU (avoids routing.js cycle). */
function parentFrameToHelioAU(orbitPos_m, central, timeSec, exaggerate = true) {
  if (!orbitPos_m || !central) return null;
  const p = getBodyPosition3D(central, timeSec, exaggerate);
  return {
    x: p.x + orbitPos_m[0] / AU,
    y: p.y + orbitPos_m[1] / AU,
    z: p.z + orbitPos_m[2] / AU,
  };
}

/** @typedef {'none'|'mid_epoch'|'time_varying'|'locked_departure'} PathOffsetPolicy */
/** @typedef {'epoch_true'|'match_path_end'} EndpointMarkerPolicy */
/** @typedef {'visual'|'physical'} PathGeometry */
/** @typedef {'equal_time'|'equal_nu'} SampleMode */
/** @typedef {'mid_epoch'|'time_varying'} ParentPolicy */

const _sunOffCache = new Map();

/** Clear sun-offset day-bucket cache (display mode change, tests). */
export function clearSunOffsetCache() {
  _sunOffCache.clear();
}

/**
 * Cached sun barycentric offset (path-build / ship sample only).
 * @param {number} tSec
 * @param {boolean} [exaggerate=true]
 */
export function getSunOffsetCached(tSec, exaggerate = true) {
  const mode = isSchematic() ? 's' : 'c';
  const bucket = Math.floor(tSec / DAY);
  const key = `${bucket}|${exaggerate ? 1 : 0}|${mode}`;
  let off = _sunOffCache.get(key);
  if (!off) {
    // Evaluate at bucket center for stability within the day
    const tMid = (bucket + 0.5) * DAY;
    off = getSunBarycentricOffset(tMid, exaggerate);
    _sunOffCache.set(key, off);
    // Bound cache size for multi-century scrubbers
    if (_sunOffCache.size > 4000) {
      const first = _sunOffCache.keys().next().value;
      _sunOffCache.delete(first);
    }
  }
  return off;
}

/**
 * Apply sun offset policy to a heliocentric AU position.
 * @param {{x:number,y:number,z:number}} rHelioAU
 * @param {number} tAbsSec absolute sim time for this sample
 * @param {object} ctx
 */
export function applySunOffset(rHelioAU, tAbsSec, ctx = {}) {
  const policy = ctx.offsetPolicy || 'time_varying';
  if (policy === 'none' || !rHelioAU) {
    return { x: rHelioAU.x, y: rHelioAU.y, z: rHelioAU.z, offset: { x: 0, y: 0, z: 0 } };
  }
  const exaggerate = ctx.exaggerate !== false;
  let tOff = tAbsSec;
  if (policy === 'mid_epoch' && ctx.tMid != null) tOff = ctx.tMid;
  else if (policy === 'locked_departure' && ctx.tDep != null) tOff = ctx.tDep;
  else if (policy === 'time_varying') tOff = tAbsSec;
  // Use exact time for time_varying (identity with ship); cache for mid/locked
  const off = (policy === 'time_varying')
    ? getSunBarycentricOffset(tOff, exaggerate)
    : getSunOffsetCached(tOff, exaggerate);
  return {
    x: rHelioAU.x + off.x,
    y: rHelioAU.y + off.y,
    z: rHelioAU.z + off.z,
    offset: off,
  };
}

/** Propagate orbit state at dt from departure epoch. */
export function stateAtDt(orb, dt) {
  if (!orb) return null;
  try {
    if (orb.hyperbolic || orb.e >= 1) {
      return propagateHelioOrbitState(
        orb.hyperbolic ? orb : { ...orb, hyperbolic: true },
        dt,
      );
    }
    return propagateOrbitState(orb, dt);
  } catch {
    return null;
  }
}

function trueAnomalyOfPos(orb, pos_m) {
  const r = v3mag(pos_m);
  if (!(r > 0) || !orb?.p_hat || !orb?.q_hat) return 0;
  const rhat = v3scale(pos_m, 1 / r);
  const cosNu = Math.max(-1, Math.min(1, v3dot(rhat, orb.p_hat)));
  const sinNu = v3dot(rhat, orb.q_hat);
  return Math.atan2(sinNu, cosNu);
}

/**
 * True anomaly → time since orbit element epoch (dt at M=M0 is 0 for dep state
 * built with M0 at departure). Returns dt seconds.
 */
export function timeFromTrueAnomaly(orb, nu) {
  if (!orb || !(orb.n > 0) || !isFinite(orb.e)) return null;
  const e = orb.e;
  let M;
  if (orb.hyperbolic || e > 1) {
    // Hyperbolic anomaly from true anomaly
    const x = Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2);
    // clamp for numerical safety near asymptote
    if (!isFinite(x) || Math.abs(x) >= 1) {
      // fall back: use atanh with clamp
      const xc = Math.max(-0.999999, Math.min(0.999999, x));
      const H = 2 * Math.atanh(xc);
      M = e * Math.sinh(H) - H;
    } else {
      const H = 2 * Math.atanh(x);
      M = e * Math.sinh(H) - H;
    }
  } else {
    // Eccentric anomaly from true anomaly (stable half-angle form)
    const beta = e / (1 + Math.sqrt(Math.max(0, 1 - e * e)));
    const E = nu + 2 * Math.atan2(beta * Math.sin(nu), 1 - beta * Math.cos(nu));
    M = E - e * Math.sin(E);
  }
  // Unwrap M relative to M0 into a continuous dt
  let dM = M - orb.M0;
  if (!(orb.hyperbolic || e > 1)) {
    // elliptical: M is 2π-periodic; choose unwrapping closest to short time
    while (dM > PI) dM -= TWO_PI;
    while (dM < -PI) dM += TWO_PI;
  }
  return dM / orb.n;
}

function deltaNuSigned(nu1, nu2, longWay) {
  let d = nu2 - nu1;
  while (d > PI) d -= TWO_PI;
  while (d <= -PI) d += TWO_PI;
  if (longWay) d = d > 0 ? d - TWO_PI : d + TWO_PI;
  if (Math.abs(d) < 1e-12) d = 1e-12;
  return d;
}

function resolveOrbit(td, geometry) {
  if (geometry === 'physical') {
    return td.orbitPhysical || td.orbit || null;
  }
  return td.orbit || td.orbitPhysical || null;
}

function resolvePathOpts(td, opts = {}) {
  const offsetPolicy = opts.offsetPolicy
    ?? td.pathOffsetPolicy
    ?? 'time_varying';
  const sampleMode = opts.sampleMode ?? 'equal_time';
  const geometry = opts.geometry ?? 'visual';
  const nSamples = Math.max(16, Math.min(1024, opts.nSamples ?? 320));
  const exaggerate = opts.exaggerate !== false;
  const tDep = opts.tDep ?? td.departureSimTime ?? td.departSimTime ?? 0;
  const tof = opts.tof ?? td.transferTime ?? td.tof ?? 0;
  const tArr = opts.tArr ?? td.arrivalSimTime ?? (tDep + tof);
  const tMid = opts.tMid ?? (tDep + tof / 2);
  const longWay = opts.longWay != null ? !!opts.longWay : !!td.longWay;
  // Planet-relative parent: time_varying for consistency with ship (PR1)
  let parentPolicy = opts.parentPolicy;
  if (!parentPolicy) {
    parentPolicy = (td.planetRelative && tof >= 30 * DAY) ? 'time_varying' : 'mid_epoch';
    // PR1: always prefer time_varying parent for ship-line identity when PR
    if (td.planetRelative) parentPolicy = opts.parentPolicy || 'time_varying';
  }
  return {
    offsetPolicy,
    sampleMode,
    geometry,
    nSamples,
    exaggerate,
    tDep,
    tArr,
    tMid,
    tof,
    longWay,
    parentPolicy,
  };
}

/**
 * Heliocentric AU at dt on transfer (handles planet-relative).
 */
function helioAtDt(td, orb, dt, tAbs, parentPolicy, exaggerate) {
  const st = stateAtDt(orb, dt);
  if (!st) return null;
  if (td.planetRelative && td.centralBody) {
    const tParent = parentPolicy === 'mid_epoch'
      ? (td.departureSimTime + td.transferTime / 2)
      : tAbs;
    const h = parentFrameToHelioAU(st.r, td.centralBody, tParent, exaggerate);
    if (!h) return null;
    return {
      x: h.x, y: h.y, z: h.z,
      v: st.v,
      v_mag: st.v_mag,
      r_mag: st.r_mag,
      nu: st.nu,
      st,
    };
  }
  return {
    x: st.r[0] / AU,
    y: st.r[1] / AU,
    z: st.r[2] / AU,
    v: st.v,
    v_mag: st.v_mag,
    r_mag: st.r_mag,
    nu: st.nu,
    st,
  };
}

function cosineHelio(td, progress) {
  const dep = td.dep3D;
  const arr = td.arr3D;
  if (!dep || !arr) return null;
  const blend = 0.5 - 0.5 * Math.cos(PI * Math.max(0, Math.min(1, progress)));
  return {
    x: dep.x + (arr.x - dep.x) * blend,
    y: dep.y + (arr.y - dep.y) * blend,
    z: dep.z + (arr.z - dep.z) * blend,
    mode: 'cosine',
  };
}

/**
 * Build polyline samples (scene frame when offset applied).
 * @returns {{ points: Array, orbitUsed: object|null, fallback: null|'physical'|'cosine', meta: object }}
 */
export function buildTransferPathSamples(td, opts = {}) {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const cfg = resolvePathOpts(td, opts);
  const offsetCtx = {
    offsetPolicy: cfg.offsetPolicy,
    tDep: cfg.tDep,
    tArr: cfg.tArr,
    tMid: cfg.tMid,
    exaggerate: cfg.exaggerate,
  };

  let orb = resolveOrbit(td, cfg.geometry);
  let fallback = null;
  if (!orb && cfg.geometry === 'visual' && td.orbitPhysical) {
    orb = td.orbitPhysical;
    fallback = 'physical';
  }

  const points = [];
  const N = cfg.nSamples;

  if (orb && cfg.tof > 0) {
    if (cfg.sampleMode === 'equal_nu' && orb.p_hat) {
      const r1 = stateAtDt(orb, 0);
      const r2 = stateAtDt(orb, cfg.tof);
      if (r1 && r2) {
        const nu1 = trueAnomalyOfPos(orb, r1.r);
        const nu2 = trueAnomalyOfPos(orb, r2.r);
        const dNu = deltaNuSigned(nu1, nu2, cfg.longWay);
        const dt0 = timeFromTrueAnomaly(orb, nu1) ?? 0;
        let ok = true;
        for (let i = 0; i <= N; i++) {
          const nu = nu1 + dNu * (i / N);
          let dt = (timeFromTrueAnomaly(orb, nu) ?? 0) - dt0;
          // Prefer equal_time mapping if equal_nu dt is out of range
          if (!(dt >= -1e-3 * cfg.tof && dt <= cfg.tof * 1.001)) {
            ok = false;
            break;
          }
          dt = Math.max(0, Math.min(cfg.tof, dt));
          const tAbs = cfg.tDep + dt;
          const h = helioAtDt(td, orb, dt, tAbs, cfg.parentPolicy, cfg.exaggerate);
          if (!h) { ok = false; break; }
          const scene = applySunOffset(h, tAbs, offsetCtx);
          points.push({
            t_sec: tAbs,
            x: scene.x, y: scene.y, z: scene.z,
            r_helio: { x: h.x, y: h.y, z: h.z },
            nu,
            mode: 'kepler',
          });
        }
        if (!ok) points.length = 0;
      }
    }

    if (!points.length) {
      // equal_time (default)
      for (let i = 0; i <= N; i++) {
        const dt = (i / N) * cfg.tof;
        const tAbs = cfg.tDep + dt;
        const h = helioAtDt(td, orb, dt, tAbs, cfg.parentPolicy, cfg.exaggerate);
        if (!h) {
          points.length = 0;
          break;
        }
        const scene = applySunOffset(h, tAbs, offsetCtx);
        points.push({
          t_sec: tAbs,
          x: scene.x, y: scene.y, z: scene.z,
          r_helio: { x: h.x, y: h.y, z: h.z },
          nu: h.nu,
          mode: 'kepler',
        });
      }
    }
  }

  if (points.length < 2) {
    // Cosine fallback in scene frame
    fallback = 'cosine';
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const tAbs = cfg.tDep + u * cfg.tof;
      const h = cosineHelio(td, u);
      if (!h) continue;
      const scene = applySunOffset(h, tAbs, offsetCtx);
      points.push({
        t_sec: tAbs,
        x: scene.x, y: scene.y, z: scene.z,
        r_helio: { x: h.x, y: h.y, z: h.z },
        mode: 'cosine',
      });
    }
  }

  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const meta = {
    buildMs: t1 - t0,
    nSamples: points.length,
    sampleMode: cfg.sampleMode,
    offsetPolicy: cfg.offsetPolicy,
    geometry: cfg.geometry,
    fallback,
    longWay: cfg.longWay,
  };
  if (td) {
    td.pathMeta = meta;
    td.pathOffsetPolicy = cfg.offsetPolicy;
  }

  return {
    points,
    orbitUsed: fallback === 'cosine' ? null : orb,
    fallback,
    meta,
  };
}

/**
 * Sample path at absolute sim time (same pipeline as polyline).
 * @returns {object|null}
 */
export function sampleTransferPathAtTime(td, simTime, opts = {}) {
  if (!td) return null;
  const cfg = resolvePathOpts(td, opts);
  const offsetCtx = {
    offsetPolicy: cfg.offsetPolicy,
    tDep: cfg.tDep,
    tArr: cfg.tArr,
    tMid: cfg.tMid,
    exaggerate: cfg.exaggerate,
  };

  // Multi-leg: find active leg and sample within it
  if (td.isMultiLeg && Array.isArray(td.legs)) {
    return sampleMultiLegAtTime(td, simTime, opts, cfg, offsetCtx);
  }

  const tof = cfg.tof;
  const tDep = cfg.tDep;
  const elapsed = simTime - tDep;
  const progress = tof > 0 ? Math.max(0, Math.min(1, elapsed / tof)) : 0;
  const dt = Math.max(0, Math.min(tof, elapsed));

  let orb = resolveOrbit(td, cfg.geometry);
  let fallback = null;
  if (!orb && td.orbitPhysical) {
    orb = td.orbitPhysical;
    fallback = 'physical';
  }

  if (orb && tof > 0) {
    const h = helioAtDt(td, orb, dt, simTime, cfg.parentPolicy, cfg.exaggerate);
    if (h) {
      const scene = applySunOffset(h, simTime, offsetCtx);
      return {
        x: scene.x, y: scene.y, z: scene.z,
        r_helio: { x: h.x, y: h.y, z: h.z },
        offsetApplied: cfg.offsetPolicy !== 'none',
        frame: cfg.offsetPolicy === 'none' ? 'helio' : 'scene',
        offsetPolicy: cfg.offsetPolicy,
        t_sec: simTime,
        progress,
        mode: 'kepler',
        vx: h.v?.[0], vy: h.v?.[1], vz: h.v?.[2],
        v_km_s: h.v_mag != null ? h.v_mag / 1000 : null,
        r_AU: h.r_mag != null ? h.r_mag / AU : Math.hypot(h.x, h.y, h.z),
        // Velocity is heliocentric 2-body (educational honesty — not scene tangent)
        velocityFrame: 'heliocentric_2body',
        fallback,
      };
    }
  }

  const h = cosineHelio(td, progress);
  if (!h) return null;
  const scene = applySunOffset(h, simTime, offsetCtx);
  const dBlend = 0.5 * PI * Math.sin(PI * progress);
  const tofSafe = Math.max(1, tof);
  const dep = td.dep3D, arr = td.arr3D;
  const vx = dep && arr ? ((arr.x - dep.x) * dBlend * AU) / tofSafe : 0;
  const vy = dep && arr ? ((arr.y - dep.y) * dBlend * AU) / tofSafe : 0;
  const vz = dep && arr ? ((arr.z - dep.z) * dBlend * AU) / tofSafe : 0;
  return {
    x: scene.x, y: scene.y, z: scene.z,
    r_helio: { x: h.x, y: h.y, z: h.z },
    offsetApplied: cfg.offsetPolicy !== 'none',
    frame: cfg.offsetPolicy === 'none' ? 'helio' : 'scene',
    offsetPolicy: cfg.offsetPolicy,
    t_sec: simTime,
    progress,
    mode: 'cosine',
    vx, vy, vz,
    v_km_s: Math.hypot(vx, vy, vz) / 1000,
    r_AU: Math.hypot(h.x, h.y, h.z),
    velocityFrame: 'cosine_approx',
    fallback: 'cosine',
  };
}

function sampleMultiLegAtTime(td, simTime, opts, cfg, offsetCtx) {
  const legs = td.legs;
  const totalTime = td.transferTime;
  const totalElapsed = Math.max(0, simTime - td.departureSimTime);
  const overallProgress = totalTime > 0
    ? Math.max(0, Math.min(1, totalElapsed / totalTime))
    : 0;

  let active = null;
  let activeIdx = -1;
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (!L.ok) continue;
    if (simTime <= L.arriveSimTime) {
      active = L;
      activeIdx = i;
      break;
    }
  }
  if (!active) {
    const last = [...legs].reverse().find((l) => l.ok);
    if (!last) return null;
    const legTd = legAsTransferView(last, td);
    const st = sampleTransferPathAtTime(legTd, last.arriveSimTime, {
      ...opts,
      longWay: last.longWay,
      tDep: last.departSimTime,
      tof: last.tof,
      tArr: last.arriveSimTime,
    });
    if (!st) return null;
    return {
      ...st,
      progress: 1,
      legIndex: legs.length - 1,
      legProgress: 1,
      currentLeg: last,
    };
  }

  const legTd = legAsTransferView(active, td);
  const legProgress = active.tof > 0
    ? Math.max(0, Math.min(1, (simTime - active.departSimTime) / active.tof))
    : 0;
  const st = sampleTransferPathAtTime(legTd, simTime, {
    ...opts,
    longWay: active.longWay,
    tDep: active.departSimTime,
    tof: active.tof,
    tArr: active.arriveSimTime,
  });
  if (!st) return null;
  return {
    ...st,
    progress: overallProgress,
    legIndex: activeIdx,
    legProgress,
    currentLeg: active,
  };
}

/** Present a multi-leg leg as a single-leg-like td for path sampling. */
function legAsTransferView(leg, parentTd) {
  return {
    body1: { name: leg.from },
    body2: { name: leg.to },
    orbit: leg.orbit,
    orbitPhysical: leg.orbitPhysical,
    dep3D: leg.dep3D,
    arr3D: leg.arr3D,
    departureSimTime: leg.departSimTime,
    arrivalSimTime: leg.arriveSimTime,
    transferTime: leg.tof,
    longWay: leg.longWay,
    planetRelative: parentTd.planetRelative,
    centralBody: parentTd.centralBody,
    pathOffsetPolicy: parentTd.pathOffsetPolicy,
  };
}

/**
 * Build path for one multi-leg leg (scene samples).
 */
export function buildLegPathSamples(leg, parentTd, opts = {}) {
  const legTd = legAsTransferView(leg, parentTd);
  return buildTransferPathSamples(legTd, {
    ...opts,
    longWay: opts.longWay != null ? opts.longWay : leg.longWay,
    tDep: leg.departSimTime,
    tof: leg.tof,
    tArr: leg.arriveSimTime,
    nSamples: opts.nSamples ?? 160,
  });
}
