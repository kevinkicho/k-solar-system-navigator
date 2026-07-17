// Mutable shared application state.
export const state = {
  selectedBody: null,
  routeOrigin: null,
  routeDestination: null,
  /** Optional planetocentric surface endpoints { enabled, lat_deg, lon_deg, alt_m }. */
  routeOriginPoint: null,
  routeDestPoint: null,
  // flybys: [{ bodyId, bodyName?, simTime, surfacePoint? }]
  flybys: [],
  /** Multi-leg window density: 'coarse' (default) | 'thorough' (denser local seed, not global opt). */
  multiLegSearchMode: 'coarse',
  transferData: null,
  showTransferOrbit: false,
  followMode: false,
  hoveredBody: null,

  bodyPositions: new Map(),
  moonPositions: new Map(),

  // Vehicle / budget
  vehicleId: 'sh-starship',
  abstractBudget_m_s: 8000,
  costBasis: 'helio', // 'helio' | 'mission'
  userTofDays: null,
  moonMissionSuggestDone: false,

  // Cargo-aware platform (K2, K25: default arch legacy until Card enables unrefueled)
  cargoMass_kg: 0,
  starshipArch: 'legacy-demo', // 'legacy-demo' | 'unrefueled' | 'tanker-n'
  tankerCount: 0,
  falcon9Variant: 'expendable', // 'expendable' | 'asds'
  aeroassistFactor: 0, // 0–0.9
  measurementPhase: null, // null → autoPhase
  // K1: 'L1' | 'L2-compare' | 'L2-plan' (legacy 'L2' treated as L2-compare)
  fidelityLevel: 'L1',
  // K5: planning geometry backend — animation always approx
  ephemerisBackend: 'approx', // 'approx' | 'sample-de'

  display: {
    mode: 'cinematic',
  },

  classroomMode: false,
  /** Reliability: Launch requires vehicle margin feasible (K6). */
  planStrictVehicle: true,
  /** Optional educational ascent loss (m/s), not mixed into Lambert Need. */
  ascentLossBudget_m_s: 0,
  /** Educational launch-site band for DLA gate (default any = no constraint). */
  launchSiteId: 'any',
  /** If true, G_SITE_DLA is fail instead of warn. */
  planStrictSite: false,

  mission: {
    active: false,
    departureSimTime: 0,
    arrivalSimTime: 0,
    transferData: null,
    arrived: false,
    lastTrailTime: 0,
    currentLegIndex: -1,
    flybysTriggered: new Set(),
  },
};

/** Call after Measurement Card ships to flip product default (K25 / PR 9). */
export function applyProductVehicleDefaults() {
  if (state.classroomMode) return;
  state.starshipArch = 'unrefueled';
}

/** Classroom / product: force offline L1 planning (K3). */
export function forceOfflineL1Ephemeris() {
  state.fidelityLevel = 'L1';
  state.ephemerisBackend = 'approx';
}
