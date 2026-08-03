/**
 * Fidelity wizard presets — product pipeline shortcuts.
 * Never claims OD / flight certification.
 */

/** @typedef {'inner-product'|'outer-dense'|'publication'|'ops-review'|'hermetic-l1'} FidelityPresetId */

export const FIDELITY_PRESETS = [
  {
    id: 'inner-product',
    label: 'Inner planets product pipeline',
    detail: 'sample-DE / L2–L3 · physical path · multi-rev on · no Horizons required',
    apply: {
      ephemerisBackend: 'sample-de',
      fidelityLevel: 'L2-plan',
      pathGeometry: 'physical',
      horizonsEndpointInject: false,
      pathAccuracy: { preferSampleDeOuter: true, multiRevLambert: true, nbodyOverlay: false },
    },
  },
  {
    id: 'outer-dense',
    label: 'Outer + moons (dense SPK warm)',
    detail: 'sample-DE + prefer outer · physical path · optional dense packs',
    apply: {
      ephemerisBackend: 'sample-de',
      fidelityLevel: 'L2-plan',
      pathGeometry: 'physical',
      horizonsEndpointInject: false,
      pathAccuracy: { preferSampleDeOuter: true, multiRevLambert: true, nbodyOverlay: false },
      warmDenseSpk: true,
    },
  },
  {
    id: 'publication',
    label: 'Publication figure honesty',
    detail: 'Force physical path + dual overlay available · residual-friendly',
    apply: {
      ephemerisBackend: 'sample-de',
      fidelityLevel: 'L2-plan',
      pathGeometry: 'physical',
      pathAccuracy: { nbodyOverlay: true, multiRevLambert: true },
      mapMode: true,
    },
  },
  {
    id: 'ops-review',
    label: 'OPS review workflow',
    detail: 'flightOpsMode + light-time compare sketch · still not certified',
    apply: {
      ephemerisBackend: 'sample-de',
      fidelityLevel: 'L3-plan',
      pathGeometry: 'physical',
      flightOpsMode: true,
      lightTimeNeedCompare: true,
      horizonsEndpointInject: false,
    },
  },
  {
    id: 'hermetic-l1',
    label: 'Hermetic L1 (debug / CI only)',
    detail: 'Offline approx — not product mode',
    apply: {
      ephemerisBackend: 'approx',
      fidelityLevel: 'L1',
      pathGeometry: 'physical',
      horizonsEndpointInject: false,
      flightOpsMode: false,
      pathAccuracy: { preferSampleDeOuter: false, nbodyOverlay: false },
    },
  },
];

/**
 * Apply preset fields onto app state (mutates).
 * @param {object} appState
 * @param {string} presetId
 * @returns {{ ok: boolean, preset?: object, error?: string }}
 */
export function applyFidelityPreset(appState, presetId) {
  const preset = FIDELITY_PRESETS.find((p) => p.id === presetId);
  if (!preset) return { ok: false, error: `unknown preset ${presetId}` };
  const a = preset.apply;
  if (a.ephemerisBackend != null) appState.ephemerisBackend = a.ephemerisBackend;
  if (a.fidelityLevel != null) appState.fidelityLevel = a.fidelityLevel;
  if (a.pathGeometry != null) appState.pathGeometry = a.pathGeometry;
  if (a.horizonsEndpointInject != null) appState.horizonsEndpointInject = a.horizonsEndpointInject;
  if (a.flightOpsMode != null) appState.flightOpsMode = a.flightOpsMode;
  if (a.lightTimeNeedCompare != null) appState.lightTimeNeedCompare = a.lightTimeNeedCompare;
  if (a.mapMode != null) appState.mapMode = a.mapMode;
  if (a.pathAccuracy && appState.pathAccuracy) {
    Object.assign(appState.pathAccuracy, a.pathAccuracy);
  }
  // Promote L3 when sample says DE bake
  if (appState.ephemerisBackend === 'sample-de' && appState.fidelityLevel === 'L1') {
    appState.fidelityLevel = 'L2-plan';
  }
  return {
    ok: true,
    preset: { id: preset.id, label: preset.label, warmDenseSpk: !!a.warmDenseSpk },
    product_class: 'preliminary-not-flight-certified',
  };
}

export function listFidelityPresets() {
  return FIDELITY_PRESETS.map(({ id, label, detail }) => ({ id, label, detail }));
}
