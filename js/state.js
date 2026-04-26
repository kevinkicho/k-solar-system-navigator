// Mutable shared application state. Imported by any module that needs to read or
// update cross-cutting state (selection, route, mission, per-frame body positions).
export const state = {
  selectedBody: null,
  routeOrigin: null,
  routeDestination: null,
  flybys: [],          // [{ bodyName, simTime }]
  transferData: null,
  showTransferOrbit: false,
  followMode: false,
  hoveredBody: null,

  // Per-frame world positions (barycentric scene coords, AU).
  bodyPositions: new Map(),
  moonPositions: new Map(),

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
