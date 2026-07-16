// Approximate collinear Earth–Moon Lagrange geometry (NOT CR3BP).
// L1: 0.84 along Earth→Moon; L2: 1.16 along Earth→Moon.
// Δv involving these is a geometric sketch only.

export const WAYPOINTS = [
  {
    id: 'em-l1',
    name: 'EM-L1',
    kind: 'waypoint',
    color: '#00e676',
    emissive: '#003018',
    displayRadius: 0.008,
    routeable: true,
    selectable: true,
    flybyEligible: false,
    waypointOf: { primaryId: 'earth', secondaryId: 'moon', lagrange: 'L1', f: 0.84 },
    desc: 'Approximate collinear Earth–Moon L1 (0.84 R_EM). Geometric sketch — not CR3BP.',
    sketch: true,
  },
  {
    id: 'em-l2',
    name: 'EM-L2',
    kind: 'waypoint',
    color: '#69f0ae',
    emissive: '#003020',
    displayRadius: 0.008,
    routeable: true,
    selectable: true,
    flybyEligible: false,
    waypointOf: { primaryId: 'earth', secondaryId: 'moon', lagrange: 'L2', f: 1.16 },
    desc: 'Approximate collinear Earth–Moon L2 (1.16 R_EM). Geometric sketch — not CR3BP.',
    sketch: true,
  },
];
