/**
 * Origin / destination spherical reference-point controls (lat/lon/alt).
 * Gas/ice giants: 1-bar cloud-deck sphere (no solid surface).
 */
import { state } from '../state.js';
import {
  emptySurfacePoint, formatSurfacePointShort, isSurfacePointActive,
  normalizeSurfacePoint, presetsForBody, isFluidGiant,
  referenceSphereLabel, altitudeFieldLabel, surfacePanelTitle,
  defaultParkingAlt_m,
} from '../physics/surface-point.js';

function ensureState() {
  if (!state.routeOriginPoint) state.routeOriginPoint = emptySurfacePoint(state.routeOrigin);
  if (!state.routeDestPoint) state.routeDestPoint = emptySurfacePoint(state.routeDestination);
}

function el(id) { return document.getElementById(id); }

function syncSlotLabels() {
  const o = state.routeOrigin;
  const d = state.routeDestination;
  const on = el('origin-name');
  const dn = el('dest-name');
  if (on && o) {
    const s = isSurfacePointActive(state.routeOriginPoint)
      ? ` · ${formatSurfacePointShort(state.routeOriginPoint, o)}`
      : '';
    on.textContent = o.name + s;
    on.classList.toggle('empty', false);
  }
  if (dn && d) {
    const s = isSurfacePointActive(state.routeDestPoint)
      ? ` · ${formatSurfacePointShort(state.routeDestPoint, d)}`
      : '';
    dn.textContent = d.name + s;
    dn.classList.toggle('empty', false);
  }
}

function fillPresets(selectEl, body) {
  if (!selectEl) return;
  const presets = presetsForBody(body);
  selectEl.innerHTML = `<option value="">Site / cloud-deck preset…</option>`
    + presets.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
}

function updatePanelChrome(prefix, body) {
  const panel = el(`${prefix}-surface-panel`);
  const summary = panel?.querySelector('summary');
  const hint = el(`${prefix}-surface-hint`);
  const altLabel = panel?.querySelector(`label[for="${prefix}-alt"]`)
    || el(`${prefix}-alt`)?.closest('.route-field-row')?.querySelector('label');
  const enableLabel = el(`${prefix}-surface-enabled`)?.closest('label');
  if (summary) summary.textContent = surfacePanelTitle(body, prefix === 'dest' ? 'dest' : 'origin');
  if (hint) hint.textContent = referenceSphereLabel(body);
  if (altLabel) altLabel.textContent = altitudeFieldLabel(body);
  if (enableLabel) {
    const span = enableLabel.childNodes[enableLabel.childNodes.length - 1];
    if (span && span.nodeType === Node.TEXT_NODE) {
      span.textContent = isFluidGiant(body)
        ? ' Enable 1-bar / cloud-deck spherical endpoint'
        : ' Enable spherical surface endpoint';
    } else {
      // structure: <input> text
      const input = enableLabel.querySelector('input');
      if (input) {
        enableLabel.innerHTML = '';
        enableLabel.appendChild(input);
        enableLabel.appendChild(document.createTextNode(
          isFluidGiant(body)
            ? ' Enable 1-bar / cloud-deck spherical endpoint'
            : ' Enable spherical surface endpoint',
        ));
      }
    }
  }
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
    const body = getBody();
    const p = normalizeSurfacePoint({
      enabled: enabled.checked,
      lat_deg: parseFloat(lat.value),
      lon_deg: parseFloat(lon.value),
      alt_m: parseFloat(alt.value) * 1000, // UI in km
    }, body);
    setPoint(p);
    if (wrap) wrap.hidden = !p.enabled;
    syncSlotLabels();
  };

  const writeFromState = () => {
    const body = getBody();
    const p = getPoint() || emptySurfacePoint(body);
    updatePanelChrome(prefix, body);
    enabled.checked = !!p.enabled;
    lat.value = String(p.lat_deg ?? 0);
    lon.value = String(p.lon_deg ?? 0);
    const altM = Number.isFinite(p.alt_m) ? p.alt_m : defaultParkingAlt_m(body);
    alt.value = String(altM / 1000);
    if (wrap) wrap.hidden = !p.enabled;
    fillPresets(preset, body);
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
      alt.value = String((p.alt_m ?? defaultParkingAlt_m(body)) / 1000);
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
  const oPanel = el('origin-surface-panel');
  const dPanel = el('dest-surface-panel');
  if (oPanel) oPanel.hidden = !state.routeOrigin;
  if (dPanel) dPanel.hidden = !state.routeDestination;
  // Auto-open details for fluid giants so spherical planning is obvious
  if (oPanel && state.routeOrigin && isFluidGiant(state.routeOrigin)) oPanel.open = true;
  if (dPanel && state.routeDestination && isFluidGiant(state.routeDestination)) dPanel.open = true;
  if (writeOrigin) writeOrigin();
  if (writeDest) writeDest();
}

export { syncSlotLabels as syncSurfaceSlotLabels };
