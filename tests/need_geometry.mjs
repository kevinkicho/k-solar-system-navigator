/**
 * Need geometry: asymptote DLA → plane-change opts; geometric vs total Need;
 * multi-rev auto TOF policy.
 */
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DAY, J2000 } from '../js/constants.js';
import { BODIES } from '../js/data/bodies.js';
import { hohmannTransfer } from '../js/physics/kepler.js';
import { solveTransferOrbit } from '../js/physics/routing.js';
import { computeNeed } from '../js/physics/need.js';
import {
  computeTransferAsymptote, needOptsFromTransfer, computeArrivalVinf_m_s,
} from '../js/physics/need-geometry.js';
import {
  resolveMaxRevolutionsForTof, AUTO_MULTI_REV_TOF_SEC,
} from '../js/physics/planning-defaults.js';
import { evaluateCell } from '../js/physics/porkchop-grid.js';
import { state } from '../js/state.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

console.log('\n━━━ NEED GEOMETRY + MULTI-REV POLICY ━━━');

const earth = BODIES.find((b) => b.name === 'Earth');
const mars = BODIES.find((b) => b.name === 'Mars');
const dep = (Date.UTC(2026, 10, 21, 12) - J2000) / 1000;
const td = hohmannTransfer(earth, mars, dep);
td.ephemerisBackend = 'approx';
td.classroomMode = false;
solveTransferOrbit(td);
check('Lambert ok', !!td.lambertOk);

// Asymptote package
const asym = computeTransferAsymptote(td);
check('asymptote package', !!asym && Number.isFinite(asym.vinf_m_s),
  asym ? `vinf=${(asym.vinf_m_s / 1000).toFixed(2)} km/s` : 'null');
check('ecliptic DLA finite', asym && Number.isFinite(asym.ecliptic?.dla_deg));
check('equatorial DLA for Earth dep',
  asym?.equatorial_approx && Number.isFinite(asym.equatorial_approx.dla_deg));

const arrV = computeArrivalVinf_m_s(td);
check('arrival V∞ finite', arrV != null && arrV > 0, arrV != null ? `${(arrV / 1000).toFixed(2)} km/s` : '');

// needOptsFromTransfer injects DLA
const opts = needOptsFromTransfer(td, { launchSiteId: 'cape' });
check('need opts carry DLA', opts.dla_eq_deg != null && Number.isFinite(opts.dla_eq_deg),
  `dla=${opts.dla_eq_deg}`);
check('need opts carry asymptote', !!opts.asymptote);

// Geometric Need split (no plane addon when site any or within band)
// Force abstract + helio so product unrefueled injection arch does not change phase.
const prevAddon = state.planeChangeNeedAddon;
const prevVeh = state.vehicleId;
const prevArch = state.starshipArch;
state.planeChangeNeedAddon = true;
state.vehicleId = 'abstract';
state.starshipArch = 'legacy-demo';
const needAny = computeNeed(td, needOptsFromTransfer(td, {
  launchSiteId: 'any', costBasis: 'helio', vehicleId: 'abstract',
}));
check('geometric_need present', needAny.geometric_need_dv_m_s != null
  && Math.abs(needAny.geometric_need_dv_m_s - td.dvTotal_lambert) < 1e-3);
check('any-site plane addon ~0', (needAny.plane_change_addon_m_s || 0) === 0);
check('need equals geometric when no plane',
  Math.abs(needAny.need_dv_m_s - needAny.geometric_need_dv_m_s) < 1e-6);
check('fidelity_note present', !!needAny.fidelity_note);

// Forced high DLA → plane addon when Cape
const needCape = computeNeed(td, {
  ...needOptsFromTransfer(td, { launchSiteId: 'cape', costBasis: 'helio', vehicleId: 'abstract' }),
  dla_eq_deg: 50, // exceeds Cape band
});
check('Cape + high DLA plane addon > 0', (needCape.plane_change_addon_m_s || 0) > 100,
  `addon=${needCape.plane_change_addon_m_s}`);
check('total Need = geometric + addon',
  Math.abs(needCape.need_dv_m_s - (needCape.geometric_need_dv_m_s + needCape.plane_change_addon_m_s)) < 1e-3);
state.planeChangeNeedAddon = prevAddon;
state.vehicleId = prevVeh;
state.starshipArch = prevArch;

// Multi-rev policy
check('long TOF auto multi-rev without classroom gate', resolveMaxRevolutionsForTof(500 * DAY, {}) === 1);
check('short TOF → 0', resolveMaxRevolutionsForTof(200 * DAY, {}) === 0);
check('long TOF auto → 1', resolveMaxRevolutionsForTof(450 * DAY, {}) === 1);
check('threshold constant', AUTO_MULTI_REV_TOF_SEC === 400 * DAY);
check('flag forces multi-rev short TOF',
  resolveMaxRevolutionsForTof(100 * DAY, { multiRevLambert: true, multiRevMax: 1 }) === 1);
check('explicit max honors',
  resolveMaxRevolutionsForTof(100 * DAY, { maxRevolutions: 2 }) === 2);

// Porkchop cell long TOF auto multi-rev path does not throw
const longTof = 500 * DAY;
const cell = evaluateCell(earth, mars, dep, longTof, { backend: 'approx', classroomMode: false });
check('long-TOF cell evaluates', cell && Number.isFinite(cell.dv),
  cell ? `dv=${cell.dv.toFixed(0)} rev=${cell.revolutions}` : 'null');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll need geometry / multi-rev checks passed');
