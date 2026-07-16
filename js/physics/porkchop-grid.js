// Pure porkchop / Lambert grid evaluation (no DOM).
// Used by the UI porkchop panel and (later) module workers.

import { AU, DAY, G_CONST, PI, TWO_PI } from '../constants.js';
import { SUN_DATA } from '../data/bodies.js';
import { getBodyPosition3D, getBodyVelocity3D } from './kepler.js';
import { solveLambertBestBranch } from './lambert.js';
import { v3dot, v3mag, v3sub } from './vec3.js';

export function synodicPeriod(b1, b2) {
  const n1 = TWO_PI / b1.period, n2 = TWO_PI / b2.period;
  const dn = Math.abs(n1 - n2);
  return dn > 1e-20 ? TWO_PI / dn : b1.period;
}

export function defaultGridSpec(body1, body2, departStart, nx = 65, ny = 52) {
  const mu = G_CONST * SUN_DATA.mass;
  const aT = (body1.a + body2.a) * AU / 2;
  const hohmannTof = PI * Math.sqrt(aT * aT * aT / mu);
  const synodic = synodicPeriod(body1, body2);
  const departSpan = Math.max(2 * 365.25 * DAY, Math.min(3 * synodic, 10 * 365.25 * DAY));
  return {
    departStart,
    departEnd: departStart + departSpan,
    tofMin: Math.max(10 * DAY, 0.35 * hohmannTof),
    tofMax: 2.2 * hohmannTof,
    nx,
    ny,
    hohmannTof,
    departSpan,
  };
}

/**
 * Evaluate a single grid cell.
 * @returns {{ dv, c3, vinf } | null}
 */
export function evaluateCell(body1, body2, dep, tof) {
  const mu = G_CONST * SUN_DATA.mass;
  const d = getBodyPosition3D(body1, dep, false);
  const a = getBodyPosition3D(body2, dep + tof, false);
  const r1v = [d.x * AU, d.y * AU, d.z * AU];
  const r2v = [a.x * AU, a.y * AU, a.z * AU];
  const vb1 = getBodyVelocity3D(body1, dep, false);
  const vb2 = getBodyVelocity3D(body2, dep + tof, false);
  const best = solveLambertBestBranch(r1v, r2v, tof, mu, vb1, vb2);
  if (!best) return null;
  const vInfDep = v3sub(best.sol.v1, vb1);
  const vInfArr = v3sub(best.sol.v2, vb2);
  return {
    dv: best.cost,
    c3: v3dot(vInfDep, vInfDep),
    vinf: v3mag(vInfArr),
  };
}

/**
 * Fill row iy of a porkchop grid (progressive UI / worker).
 * Arrays are Float64Array length nx*ny; writes row iy.
 */
export function fillGridRow(body1, body2, gridSpec, iy, data, c3, vinf) {
  const { departStart, departEnd, tofMin, tofMax, nx, ny } = gridSpec;
  const tof = tofMin + ((iy + 0.5) / ny) * (tofMax - tofMin);
  let minDv = Infinity, maxDv = -Infinity;
  let minC3 = Infinity, maxC3 = -Infinity;
  let minVI = Infinity, maxVI = -Infinity;
  let minIx = -1;

  for (let ix = 0; ix < nx; ix++) {
    const dep = departStart + ((ix + 0.5) / nx) * (departEnd - departStart);
    const cell = evaluateCell(body1, body2, dep, tof);
    const idx = iy * nx + ix;
    if (cell) {
      data[idx] = cell.dv;
      c3[idx] = cell.c3;
      vinf[idx] = cell.vinf;
      if (cell.dv < minDv) { minDv = cell.dv; minIx = ix; }
      if (cell.dv > maxDv) maxDv = cell.dv;
      if (cell.c3 < minC3) minC3 = cell.c3;
      if (cell.c3 > maxC3) maxC3 = cell.c3;
      if (cell.vinf < minVI) minVI = cell.vinf;
      if (cell.vinf > maxVI) maxVI = cell.vinf;
    } else {
      data[idx] = NaN;
      c3[idx] = NaN;
      vinf[idx] = NaN;
    }
  }
  return { minDv, maxDv, minC3, maxC3, minVI, maxVI, minIx, iy };
}

/**
 * Full synchronous sweep (offline tests).
 */
export function sweepPorkchopGrid(body1, body2, gridSpec) {
  const { nx, ny } = gridSpec;
  const data = new Float64Array(nx * ny);
  const c3 = new Float64Array(nx * ny);
  const vinf = new Float64Array(nx * ny);
  let minDv = Infinity, maxDv = -Infinity;
  let minC3 = Infinity, maxC3 = -Infinity;
  let minVI = Infinity, maxVI = -Infinity;
  let minCell = null;

  for (let iy = 0; iy < ny; iy++) {
    const row = fillGridRow(body1, body2, gridSpec, iy, data, c3, vinf);
    if (row.minIx >= 0 && row.minDv < minDv) {
      minDv = row.minDv;
      minCell = { ix: row.minIx, iy };
    }
    if (row.maxDv > maxDv) maxDv = row.maxDv;
    if (row.minC3 < minC3) minC3 = row.minC3;
    if (row.maxC3 > maxC3) maxC3 = row.maxC3;
    if (row.minVI < minVI) minVI = row.minVI;
    if (row.maxVI > maxVI) maxVI = row.maxVI;
  }

  return {
    data, c3, vinf, gridSpec,
    dvMin: minDv, dvMax: maxDv,
    c3Min: minC3, c3Max: maxC3,
    vinfMin: minVI, vinfMax: maxVI,
    minCell,
  };
}

export function cellTimes(gridSpec, ix, iy) {
  const { departStart, departEnd, tofMin, tofMax, nx, ny } = gridSpec;
  const dep = departStart + ((ix + 0.5) / nx) * (departEnd - departStart);
  const tof = tofMin + ((iy + 0.5) / ny) * (tofMax - tofMin);
  return { dep, tof };
}
