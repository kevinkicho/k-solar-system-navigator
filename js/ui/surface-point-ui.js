/**
 * Origin / destination geographic site controls (lat / lon / alt).
 * Planetocentric storage; optional planetographic input mode for oblate bodies.
 * IAU-class W(t)+ICRF pole; dual lat / R_ell readout.
 */
import { state } from '../state.js';
import {
  emptySurfacePoint, formatSurfacePointShort, isSurfacePointActive,
  normalizeSurfacePoint, presetsForBody, isFluidGiant,
  referenceSphereLabel, altitudeFieldLabel, surfacePanelTitle,
  defaultParkingAlt_m, coordinateSystemBadge, longitudeSystem,
  formatRadiusFromCenter, planetocentricRadius_m, isOblateBody,
  bodyShape, planetocentricToPlanetographic_deg, ellipsoidRadius_m,
  getSpinModel, latInputToPlanetocentric, latPlanetocentricToDisplay,
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

function updateRadiusReadout(prefix, body, altKm, latDisplay, latMode) {
  const readout = el(`${prefix}-radius-readout`);
  const pg = el(`${prefix}-pg-readout`);
  if (!readout) return;
  if (!body) {
    readout.textContent = 'Radius from center: —';
    if (pg) { pg.hidden = true; pg.textContent = ''; }
    return;
  }
  const alt_m = (parseFloat(altKm) || 0) * 1000;
  const latUi = parseFloat(latDisplay) || 0;
  // Always evaluate R at planetocentric lat
  const lat_c = latInputToPlanetocentric(body, latUi, latMode || 'planetocentric');
  const rLabel = formatRadiusFromCenter(body, alt_m, lat_c);
  const r_m = planetocentricRadius_m(body, alt_m, lat_c);
  const R_ell = ellipsoidRadius_m(body, lat_c);
  const shape = bodyShape(body);
  readout.textContent = shape.isOblate
    ? `Radius from center: ${rLabel}  ·  R_ell(φc)=${(R_ell / 1000).toFixed(0)} km + h`
    : `Radius from center: ${rLabel}  ·  R_ref ${(shape.mean_m / 1000).toFixed(0)} km + h`;
  readout.title = `r = R_ref(φ_c) + h = ${(r_m / 1000).toFixed(3)} km · φ_c=${lat_c.toFixed(3)}°`;

  if (pg) {
    if (shape.isOblate) {
      const lat_g = planetocentricToPlanetographic_deg(body, lat_c);
      const f = (shape.flattening * 100).toFixed(2);
      pg.hidden = false;
      pg.textContent = `φ_c=${lat_c.toFixed(3)}°  ·  φ_g=${lat_g.toFixed(3)}°  ·  f=${f}%  ·  Re=${(shape.Re_m / 1000).toFixed(0)} · Rp=${(shape.Rp_m / 1000).toFixed(0)} km`;
      pg.title = 'Planetocentric (φ_c) is stored for math; planetographic (φ_g) is map/surface-normal latitude (IAU).';
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
  const latModeRow = el(`${prefix}-lat-mode-row`);
  const latModeSel = el(`${prefix}-lat-mode`);
  const latLabel = el(`${prefix}-lat-label`);

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
    const bits = [];
    bits.push(isFluidGiant(body)
      ? `Lon: ${lonSys.label}`
      : `Lon: ${lonSys.label}`);
    if (spin?.has_W_polynomial) {
      bits.push(`Ẇ=${Number(spin.Wdot_deg_per_d).toFixed(3)}°/d`);
    }
    if (spin?.has_libration) bits.push('lib');
    if (spin?.has_icrf_pole) bits.push('ICRF pole');
    lonEl.textContent = bits.join(' · ');
    lonEl.title = (lonSys.note || lonSys.label)
      + (spin?.source ? ` · ${spin.source}` : '');
  }

  // Lat mode only useful / enabled for oblate bodies
  const oblate = isOblateBody(body);
  if (latModeRow) latModeRow.hidden = !oblate;
  if (latModeSel && !oblate) latModeSel.value = 'planetocentric';
  if (latLabel) {
    const mode = latModeSel?.value || 'planetocentric';
    latLabel.textContent = mode === 'planetographic' && oblate
      ? 'Latitude °N (planetographic)'
      : 'Latitude °N (planetocentric)';
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
  const latMode = el(`${prefix}-lat-mode`);
  if (!enabled || !lat || !lon || !alt) return;

  let prevMode = latMode?.value || 'planetocentric';

  const currentMode = () => latMode?.value || 'planetocentric';

  const readToState = () => {
    const body = getBody();
    const mode = currentMode();
    const lat_c = latInputToPlanetocentric(body, parseFloat(lat.value), mode);
    const p = normalizeSurfacePoint({
      enabled: enabled.checked,
      lat_deg: lat_c,
      lon_deg: parseFloat(lon.value),
      alt_m: parseFloat(alt.value) * 1000,
    }, body);
    setPoint(p);
    if (wrap) wrap.hidden = !p.enabled;
    updateRadiusReadout(prefix, body, alt.value, lat.value, mode);
    syncSlotLabels();
  };

  const writeFromState = () => {
    const body = getBody();
    const p = getPoint() || emptySurfacePoint(body);
    updatePanelChrome(prefix, body);
    enabled.checked = !!p.enabled;
    const mode = currentMode();
    lat.value = String(latPlanetocentricToDisplay(body, p.lat_deg ?? 0, mode));
    lon.value = String(p.lon_deg ?? 0);
    const altM = Number.isFinite(p.alt_m) ? p.alt_m : defaultParkingAlt_m(body);
    alt.value = String(altM / 1000);
    if (wrap) wrap.hidden = !p.enabled;
    fillPresets(preset, body);
    updateRadiusReadout(prefix, body, alt.value, lat.value, mode);
    syncSlotLabels();
  };

  enabled.addEventListener('change', readToState);
  lat.addEventListener('change', readToState);
  lon.addEventListener('change', readToState);
  alt.addEventListener('change', readToState);
  lat.addEventListener('input', () => updateRadiusReadout(prefix, getBody(), alt.value, lat.value, currentMode()));
  alt.addEventListener('input', () => updateRadiusReadout(prefix, getBody(), alt.value, lat.value, currentMode()));

  if (latMode) {
    latMode.addEventListener('change', () => {
      const body = getBody();
      const newMode = currentMode();
      // Convert displayed lat between conventions without changing stored φ_c
      const p = getPoint() || emptySurfacePoint(body);
      const lat_c = p.lat_deg ?? 0;
      lat.value = String(latPlanetocentricToDisplay(body, lat_c, newMode));
      prevMode = newMode;
      updatePanelChrome(prefix, body);
      updateRadiusReadout(prefix, body, alt.value, lat.value, newMode);
    });
  }

  if (preset) {
    preset.addEventListener('change', () => {
      const id = preset.value;
      if (!id) return;
      const body = getBody();
      const list = presetsForBody(body);
      const pr = list.find((x) => x.id === id);
      if (!pr) return;
      enabled.checked = true;
      // Presets are planetocentric
      if (latMode) latMode.value = 'planetocentric';
      lat.value = String(latPlanetocentricToDisplay(body, pr.lat_deg, currentMode()));
      lon.value = String(pr.lon_deg);
      alt.value = String((pr.alt_m ?? defaultParkingAlt_m(body)) / 1000);
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
