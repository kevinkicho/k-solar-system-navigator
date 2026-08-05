// Mutable shared application state.

/** Product default path geometry (ship ≡ dashed path ≡ Need). */
export const PRODUCT_PATH_GEOMETRY = 'physical';

/**
 * Resolve path geometry with industrial default physical (never silent visual).
 * @param {string|null|undefined} [override]
 * @returns {'visual'|'physical'|'both'}
 */
export function effectivePathGeometry(override) {
  const g = override != null && override !== '' ? override : state.pathGeometry;
  if (g === 'visual' || g === 'physical' || g === 'both') return g;
  return PRODUCT_PATH_GEOMETRY;
}

/**
 * Geometry for Need-honest sampling (exports, dual overlay physical branch).
 * Dual overlay (`both`) rides the physical / Need branch.
 * @param {string|null|undefined} [override]
 * @returns {'visual'|'physical'}
 */
export function pathSampleGeometry(override) {
  const g = effectivePathGeometry(override);
  return (g === 'physical' || g === 'both') ? 'physical' : 'visual';
}

/**
 * Present / cinematic: sample **physical** Lambert, then apply
 * cinematic_endpoints display transform (one solve, display projection).
 * Need/Δv always physical. Compare/Ops still dual-overlay when enabled.
 *
 * @returns {boolean}
 */
export function useCinematicEndpointTransform() {
  if (state.physicsAccurate || state.mapMode) return false;
  if (state.display?.mode === 'schematic') return false;
  const mode = state.productMode || 'present';
  if (mode === 'analyze' || mode === 'compare' || mode === 'ops') return false;
  return true;
}

/**
 * Geometry for the drawn polyline, fly study ship, path bead, and camera tour.
 *
 * Present (cinematic): physical orbit + endpoint blend transform (not a second Lambert).
 * Schematic / Analyze / ACCURATE / MAP: honor pathGeometry / physical as appropriate.
 *
 * @param {string|null|undefined} [override]
 * @returns {'visual'|'physical'}
 */
export function scenePathGeometry(override) {
  if (override === 'visual' || override === 'physical') return override;
  // Physics-accurate / map / schematic: path honesty with real inclinations
  if (state.physicsAccurate || state.mapMode) return 'physical';
  if (state.display?.mode === 'schematic') {
    return pathSampleGeometry();
  }
  // Present: physical samples + cinematic endpoint transform (one orbit)
  if (useCinematicEndpointTransform()) return 'physical';
  // Legacy fallback: separate visual Lambert branch
  return 'visual';
}

/** Path sample opts for ship ≡ dashed line under current product mode. */
export function scenePathSampleOpts(extra = {}) {
  const geometry = scenePathGeometry();
  const cinematic = useCinematicEndpointTransform();
  return {
    geometry,
    exaggerate: geometry === 'visual',
    displayTransform: cinematic ? 'cinematic_endpoints' : null,
    offsetExaggerate: cinematic ? true : (geometry === 'visual'),
    ...extra,
  };
}

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

  // Cargo-aware platform — product default unrefueled SS injection
  cargoMass_kg: 0,
  starshipArch: 'unrefueled', // 'legacy-demo' | 'unrefueled' | 'tanker-n'
  tankerCount: 0,
  falcon9Variant: 'expendable', // 'expendable' | 'asds'
  aeroassistFactor: 0, // 0–0.9
  measurementPhase: null, // null → autoPhase
  // K1: 'L1' | 'L2-compare' | 'L2-plan' | 'L2-horizons' | 'L3-plan'
  // Product default L2/L3 from offline sample table (promotes L3-plan when DE440s bake present).
  fidelityLevel: 'L2-plan',
  // Planning geometry backend — animation always approx Kepler; falls back to approx OOR.
  ephemerisBackend: 'sample-de', // 'approx' | 'sample-de'
  /**
   * Opt-in live Horizons endpoint inject for Lambert Need (network).
   * Populates inject cache before compute. NOT SPICE / NOT default offline path.
   */
  horizonsEndpointInject: false,
  /**
   * Flight-ops analysis workflow (NOT certified, NOT range safety).
   * Surfaces light-time, ops gates, OEM-like export; prefers L3-plan table when available.
   */
  flightOpsMode: false,
  /**
   * When true, Need includes light-time TOF compare sketch (analysis only).
   * Does not replace geometric Lambert Need.
   */
  lightTimeNeedCompare: false,
  /** Last porkchop multi-candidate shortlist (client). */
  windowShortlist: null,
  /**
   * When true (default), plane-change Δv sketch may add to Need
   * for Earth departures with launch-site DLA band exceeded.
   */
  planeChangeNeedAddon: true,

  display: {
    mode: 'cinematic',
  },
  /**
   * Named product mode: 'present' | 'analyze' | 'compare' | 'ops'
   * See js/domain/display-modes.js — preferred over raw pathGeometry/map/accurate knobs.
   */
  productMode: 'present',
  /**
   * Physics-accurate scene mode (not a Three.js solver — uses our Lambert/ephemeris).
   * Forces schematic frames + physical path geometry + dual overlay optional.
   */
  physicsAccurate: false,
  /**
   * Body radii: false = cinematic displayRadius; true = R/AU × trueScaleBoost (semi-true).
   * Pure 1:1 AU scale is invisible for planets; boost is labeled in the HUD.
   */
  trueScaleBodies: false,
  trueScaleBoost: 200,
  /** Three.js teaching overlays */
  showDvArrows: true,
  showPathBead: true,
  showAtmospheres: true,

  /**
   * Path rendering (trajectory accuracy design Phases 1–4).
   * Convenience mirrors under pathAccuracy; top-level keys kept for PR1 call sites.
   */
  pathOffsetPolicy: 'time_varying',
  pathSampleMode: 'equal_time',
  /** Ghost markers align with path ends (ship–line honesty). */
  endpointMarkerPolicy: 'match_path_end',
  /**
   * 'visual' | 'physical' | 'both'
   * Product default physical so the dashed path matches Need geometry;
   * cinematic visual tilt remains available via MAP / display controls.
   */
  pathGeometry: 'physical',
  /** 'static' | 'rebuild' | 'trail_only' during mission */
  flightPathMode: 'static',
  pathAccuracy: {
    forceVisualLongWay: true,
    sharedPathBuilder: true,
    adaptiveSampling: true, // densify high-e / long arcs via path refine
    /** Allow multi-rev Lambert when TOF / flag policy enables it */
    multiRevLambert: true,
    multiRevMax: 1,
    preferSampleDeOuter: true, // banner only, no silent switch
    nbodyOverlay: false,
  },
  /** Monotonic id to cancel path-refine / n-body workers */
  pathRefineRequestId: 0,
  lastPathRebuildWallMs: 0,

  /**
   * @deprecated Classroom mode removed — always false. Kept for legacy share/worker payloads.
   */
  classroomMode: false,
  /**
   * Map mode: schematic display + dual path geometry for accurate trajectory mapping.
   * Cinematic remains the default presentation; map mode is one click away.
   */
  mapMode: false,
  /**
   * Render quality: 'auto' | 'high' | 'low' (bloom / heavy FX).
   * auto = high desktop, low on mobile or prefers-reduced-motion.
   */
  qualityTier: 'auto',
  /**
   * Transfer ribbon tube + time ticks (Three.js TubeGeometry).
   */
  showTransferRibbon: true,
  /**
   * Firebase Auth mirror (filled by js/firebase/auth.js).
   * enabled=false with ?firebase=0 / missing config.
   */
  firebase: {
    enabled: false,
    uid: null,
    email: null,
    displayName: null,
  },
  /** Reliability: Launch requires vehicle margin feasible (K6). */
  planStrictVehicle: true,
  /**
   * Latest gravity-assist suggestion pack from SUGGEST GA (or null).
   * User Accept applies a path; Keep clears without changing the route.
   */
  gaSuggestions: null,
  /**
   * Latest intelligent itinerary pack from SUGGEST ITINERARY (or null).
   * Local multi-leg template seeds — not a global tour optimum.
   */
  itinerarySuggestions: null,
  /** Window families clustered from shortlist (studio). */
  windowFamilies: null,
  /** Architecture trade matrix (studio). */
  architectureMatrix: null,
  /** Educational DSM nodes (Need sketch add-on — not re-optimized Lambert). */
  dsmNodes: [],
  /** Plan compare pins (max 3; also localStorage). */
  planPins: null,
  /** Optional arrival capture class sketch (m/s) for Need waterfall. */
  captureBudget_m_s: 0,
  /**
   * Mobile companion mode — denser Results/studio, less cinematic chrome.
   * Also ?companion=1
   */
  companionMode: false,
  /** AI multi-role (navigator|vehicle|fidelity|ops|orchestrator). */
  aiRole: 'orchestrator',
  /** Optional ascent loss class budget (m/s), not mixed into Lambert Need. */
  ascentLossBudget_m_s: 0,
  /** Launch-site band for DLA gate (default any = no constraint). */
  launchSiteId: 'any',
  /** If true, G_SITE_DLA is fail instead of warn. */
  planStrictSite: false,
  /**
   * AI co-pilot (Ollama Cloud) — core assistant for mission design.
   * model is selected in FAB UI; key stays on server (.env OLLAMA_API_KEY).
   */
  ai: {
    model: null, // filled from localStorage / /api/models default
    toolsEnabled: false,
    /** Tone: industrial (terse) | coach (teaching) */
    personality: 'industrial',
  },

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

/** Product defaults: unrefueled Starship arch + sample-DE ephemeris. */
export function applyProductVehicleDefaults() {
  state.starshipArch = 'unrefueled';
  applyProductEphemerisDefaults();
}

/** Product default: offline sample-DE endpoints (L2-plan; promotes L3-plan when SPICE-baked). */
export function applyProductEphemerisDefaults() {
  state.ephemerisBackend = 'sample-de';
  state.fidelityLevel = 'L2-plan';
  if (state.pathAccuracy) state.pathAccuracy.preferSampleDeOuter = true;
}

/**
 * Force offline L1 approx planning (debug / hermetic only — not a product mode).
 * Prefer sample-DE / L3-plan for industrial work.
 */
export function forceOfflineL1Ephemeris() {
  state.fidelityLevel = 'L1';
  state.ephemerisBackend = 'approx';
  state.horizonsEndpointInject = false;
  if (state.pathAccuracy) {
    state.pathAccuracy.preferSampleDeOuter = false;
    state.pathAccuracy.nbodyOverlay = false;
  }
  state.pathGeometry = 'physical';
}

/** Bump refine/n-body request id (stale worker results ignored). */
export function bumpPathRefineRequestId() {
  state.pathRefineRequestId = (state.pathRefineRequestId || 0) + 1;
  return state.pathRefineRequestId;
}
