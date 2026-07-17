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
  /** When true, camera target tracks the mission ship each frame. */
  followShip: false,
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

  /**
   * Path rendering (trajectory accuracy design Phases 1–4).
   * Convenience mirrors under pathAccuracy; top-level keys kept for PR1 call sites.
   */
  pathOffsetPolicy: 'time_varying',
  pathSampleMode: 'equal_time',
  endpointMarkerPolicy: 'epoch_true',
  /** 'visual' | 'physical' | 'both' — dual overlay when both */
  pathGeometry: 'visual',
  /** 'static' | 'rebuild' | 'trail_only' during mission */
  flightPathMode: 'static',
  pathAccuracy: {
    forceVisualLongWay: true,
    sharedPathBuilder: true,
    adaptiveSampling: false, // ON only after worker (PR8) optional soak
    multiRevLambert: false,
    multiRevMax: 1,
    preferSampleDeOuter: true, // banner only, no silent switch
    nbodyOverlay: false,
  },
  /** Monotonic id to cancel path-refine / n-body workers */
  pathRefineRequestId: 0,
  lastPathRebuildWallMs: 0,

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
  if (state.pathAccuracy) {
    state.pathAccuracy.preferSampleDeOuter = false;
    state.pathAccuracy.nbodyOverlay = false;
  }
  // Classroom: label path as physical (incl. factor = 1)
  state.pathGeometry = 'physical';
}

/** Bump refine/n-body request id (stale worker results ignored). */
export function bumpPathRefineRequestId() {
  state.pathRefineRequestId = (state.pathRefineRequestId || 0) + 1;
  return state.pathRefineRequestId;
}
