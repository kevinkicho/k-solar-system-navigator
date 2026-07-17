/**
 * Origin / destination geographic site controls (lat / lon / alt).
 * Planetocentric east-positive; height above reference; r = R_ref + h readout.
 * Gas/ice giants: 1-bar cloud deck + System III–class longitude label.
 */
import { state } from '../state.js';
import {
  emptySurfacePoint, formatSurfacePointShort, isSurfacePointActive,
  normalizeSurfacePoint, presetsForBody, isFluidGiant,
  referenceSphereLabel, altitudeFieldLabel, surfacePanelTitle,
  defaultParkingAlt_m, coordinateSystemBadge, longitudeSystem,
  formatRadiusFromCenter, planetocentricRadius_m, isOblateBody,
  bodyShape, planetocentricToPlanetographic_deg, ellipsoidRadius_m,
  getSpinModel,
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

function updateRadiusReadout(prefix, body, altKm, latDeg) {
  const readout = el(`${prefix}-radius-readout`);
  const pg = el(`${prefix}-pg-readout`);
  if (!readout) return;
  if (!body) {
    readout.textContent = 'Radius from center: —';
    if (pg) { pg.hidden = true; pg.textContent = ''; }
    return;
  }
  const alt_m = (parseFloat(altKm) || 0) * 1000;
  const lat = parseFloat(latDeg) || 0;
  const rLabel = formatRadiusFromCenter(body, alt_m, lat);
  const r_m = planetocentricRadius_m(body, alt_m, lat);
  const R_ell = ellipsoidRadius_m(body, lat);
  const shape = bodyShape(body);
  readout.textContent = shape.isOblate
    ? `Radius from center: ${rLabel}  ·  R_ell(φ)=${(R_ell / 1000).toFixed(0)} km + h`
    : `Radius from center: ${rLabel}  ·  R_ref ${(shape.mean_m / 1000).toFixed(0)} km + h`;
  readout.title = `r = R_ref(φ) + h = ${(r_m / 1000).toFixed(3)} km (planetocentric)`;

  if (pg) {
    if (shape.isOblate) {
      const lat_g = planetocentricToPlanetographic_deg(body, lat);
      const f = (shape.flattening * 100).toFixed(2);
      pg.hidden = false;
      pg.textContent = `Planetographic lat: ${lat_g.toFixed(3)}°  ·  f=${f}%  ·  Re=${(shape.Re_m / 1000).toFixed(0)} km · Rp=${(shape.Rp_m / 1000).toFixed(0)} km`;
      pg.title = 'Input lat is planetocentric; planetographic is the map/surface-normal latitude (IAU).';
    } else {
      pg.hidden = true;
      pg.textContent = '';
    }
  }
}

function updatePanelChrome(prefix, body) {
  const panel = el(`${prefix}-surface-panel`);
  const summary = panel?.querySelector('summary');
  const hint = el(`${prefix}-surface-hint`);
  const badge = el(`${prefix}-geo-badge`);
  const lonEl = el(`${prefix}-lon-system`);
  const altLabel = el(`${prefix}-alt`)?.closest('.route-field-row')?.querySelector('label');
  const enableLabel = el(`${prefix}-surface-enabled`)?.closest('label');

  if (summary) summary.textContent = surfacePanelTitle(body, prefix === 'dest' ? 'dest' : 'origin');
  if (hint) hint.textContent = referenceSphereLabel(body);
  if (altLabel) altLabel.textContent = altitudeFieldLabel(body);

  const cs = coordinateSystemBadge(body);
  if (badge) {
    badge.textContent = cs.short;
    badge.title = cs.full;
    badge.dataset.cs = cs.id;
    badge.dataset.ref = cs.reference;
  }

  const lonSys = longitudeSystem(body);
  const spin = body ? getSpinModel(body) : null;
  if (lonEl) {
    let line = isFluidGiant(body)
      ? `Longitude system: ${lonSys.label}`
      : `Longitude: ${lonSys.label}`;
    if (spin?.has_W_polynomial) {
      line += ` · Ẇ=${Number(spin.Wdot_deg_per_d).toFixed(4)}°/d`;
    }
    lonEl.textContent = line;
    lonEl.title = (lonSys.note || lonSys.label)
      + (spin?.source ? ` · ${spin.source}` : '');
  }

  if (enableLabel) {
    const input = enableLabel.querySelector('input');
    if (input) {
      enableLabel.innerHTML = '';
      enableLabel.appendChild(input);
      enableLabel.appendChild(document.createTextNode(
        isFluidGiant(body)
          ? ' Enable geographic site (1-bar lat / lon / alt)'
          : ' Enable geographic site (lat / lon / alt)',
      ));
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
      alt_m: parseFloat(alt.value) * 1000,
    }, body);
    setPoint(p);
    if (wrap) wrap.hidden = !p.enabled;
    updateRadiusReadout(prefix, body, alt.value, lat.value);
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
    updateRadiusReadout(prefix, body, alt.value, lat.value);
    syncSlotLabels();
  };

  enabled.addEventListener('change', readToState);
  lat.addEventListener('change', readToState);
  lon.addEventListener('change', readToState);
  alt.addEventListener('change', readToState);
  lat.addEventListener('input', () => updateRadiusReadout(prefix, getBody(), alt.value, lat.value));
  alt.addEventListener('input', () => updateRadiusReadout(prefix, getBody(), alt.value, lat.value));
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
  if (oPanel && state.routeOrigin && isFluidGiant(state.routeOrigin)) oPanel.open = true;
  if (dPanel && state.routeDestination && isFluidGiant(state.routeDestination)) dPanel.open = true;
  if (writeOrigin) writeOrigin();
  if (writeDest) writeDest();
}

export { syncSlotLabels as syncSurfaceSlotLabels };
