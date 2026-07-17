/**
 * Origin / destination exact surface-point controls (spherical lat/lon/alt).
 */
import { state } from '../state.js';
import {
  emptySurfacePoint, formatSurfacePointShort, isSurfacePointActive,
  normalizeSurfacePoint, presetsForBody,
} from '../physics/surface-point.js';

function ensureState() {
  if (!state.routeOriginPoint) state.routeOriginPoint = emptySurfacePoint();
  if (!state.routeDestPoint) state.routeDestPoint = emptySurfacePoint();
}

function el(id) { return document.getElementById(id); }

function syncSlotLabels() {
  const o = state.routeOrigin;
  const d = state.routeDestination;
  const on = el('origin-name');
  const dn = el('dest-name');
  if (on && o) {
    const s = isSurfacePointActive(state.routeOriginPoint)
      ? ` · ${formatSurfacePointShort(state.routeOriginPoint)}`
      : '';
    on.textContent = o.name + s;
    on.classList.toggle('empty', false);
  }
  if (dn && d) {
    const s = isSurfacePointActive(state.routeDestPoint)
      ? ` · ${formatSurfacePointShort(state.routeDestPoint)}`
      : '';
    dn.textContent = d.name + s;
    dn.classList.toggle('empty', false);
  }
}

function fillPresets(selectEl, body) {
  if (!selectEl) return;
  const presets = presetsForBody(body);
  selectEl.innerHTML = `<option value="">Site preset…</option>`
    + presets.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
}

function bindEndpoint(prefix, getPoint, setPoint, getBody) {
  const enabled = el(`${prefix}-surface-enabled`);
  const lat = el(`${prefix}-lat`);
  const lon = el(`${prefix}-lon`);
  const alt = el(`${prefix}-alt`);
  const preset = el(`${prefix}-surface-preset`);
  const wrap = el(`${prefix}-surface-fields`);
  if (!enabled || !lat || !lon || !alt) return;

  const readToState = () => {
    const p = normalizeSurfacePoint({
      enabled: enabled.checked,
      lat_deg: parseFloat(lat.value),
      lon_deg: parseFloat(lon.value),
      alt_m: parseFloat(alt.value) * 1000, // UI in km
    });
    setPoint(p);
    if (wrap) wrap.hidden = !p.enabled;
    syncSlotLabels();
  };

  const writeFromState = () => {
    const p = getPoint() || emptySurfacePoint();
    enabled.checked = !!p.enabled;
    lat.value = String(p.lat_deg ?? 0);
    lon.value = String(p.lon_deg ?? 0);
    alt.value = String(((p.alt_m ?? 100e3) / 1000));
    if (wrap) wrap.hidden = !p.enabled;
    fillPresets(preset, getBody());
    syncSlotLabels();
  };

  enabled.addEventListener('change', readToState);
  lat.addEventListener('change', readToState);
  lon.addEventListener('change', readToState);
  alt.addEventListener('change', readToState);
  if (preset) {
    preset.addEventListener('change', () => {
      const id = preset.value;
      if (!id) return;
      const body = getBody();
      const list = presetsForBody(body);
      const p = list.find((x) => x.id === id);
      if (!p) return;
      enabled.checked = true;
      lat.value = String(p.lat_deg);
      lon.value = String(p.lon_deg);
      alt.value = String(p.alt_m / 1000);
      readToState();
      preset.value = '';
    });
  }

  return writeFromState;
}

let writeOrigin = null;
let writeDest = null;

export function wireSurfacePointUi() {
  ensureState();
  writeOrigin = bindEndpoint(
    'origin',
    () => state.routeOriginPoint,
    (p) => { state.routeOriginPoint = p; },
    () => state.routeOrigin,
  );
  writeDest = bindEndpoint(
    'dest',
    () => state.routeDestPoint,
    (p) => { state.routeDestPoint = p; },
    () => state.routeDestination,
  );
  refreshSurfacePointUi();
}

/** Call after origin/dest body changes. */
export function refreshSurfacePointUi() {
  ensureState();
  // Disable surface UI when no body
  const oPanel = el('origin-surface-panel');
  const dPanel = el('dest-surface-panel');
  if (oPanel) oPanel.hidden = !state.routeOrigin;
  if (dPanel) dPanel.hidden = !state.routeDestination;
  if (writeOrigin) writeOrigin();
  if (writeDest) writeDest();
}

export { syncSlotLabels as syncSurfaceSlotLabels };
