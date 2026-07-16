// Mutable shared application state. Imported by any module that needs to read or
// update cross-cutting state (selection, route, mission, per-frame body positions).
export const state = {
  selectedBody: null,
  routeOrigin: null,
  routeDestination: null,
  // flybys: [{ bodyId, bodyName?, simTime }]
  flybys: [],
  transferData: null,
  showTransferOrbit: false,
  followMode: false,
  hoveredBody: null,

  // Per-frame world positions (barycentric scene coords, AU).
  bodyPositions: new Map(),
  moonPositions: new Map(),

  // Vehicle / budget (PR 6–7).
  vehicleId: 'sh-starship',
  abstractBudget_m_s: 8000,
  costBasis: 'helio', // 'helio' | 'mission' — multi-leg always coerced to helio
  userTofDays: null,  // optional TOF override from porkchop / share
  moonMissionSuggestDone: false,

  // Display (PR 5).
  display: {
    mode: 'cinematic', // 'cinematic' | 'schematic'
  },

  // Classroom mode (PR 15).
  classroomMode: false,

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
