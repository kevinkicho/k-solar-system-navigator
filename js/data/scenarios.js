// Pre-baked mission profiles. Clicking one populates origin, destination,
// departure date, and any gravity-assist flybys in the route planner. The
// user can then hit "Compute Transfer" to see the trajectory.
//
// Dates are chosen so the heliocentric geometry under our JPL Approximate-
// Positions model produces a feasible Lambert solution. Flyby dates are
// approximate — hitting "SNAP" after loading will optimize them ±30 days.
//
// Format:
//   id          — stable identifier
//   name        — display label
//   summary     — one-line description shown next to the dropdown
//   origin      — planet name (must be in BODIES)
//   destination — planet name
//   departureUTC — absolute UTC milliseconds (Date.UTC(...))
//   flybys      — [{ bodyName, dateUTC }] in chronological order, or []
export const SCENARIOS = [
  {
    id: 'mars-2026',
    name: 'Earth → Mars · 2026 launch window',
    summary: 'Real upcoming opportunity — late-Nov launch, ~258-day transit',
    origin: 'Earth',
    destination: 'Mars',
    departureUTC: Date.UTC(2026, 10, 21),    // Nov 21, 2026
    flybys: [],
  },
  {
    id: 'mars-2033-ideal',
    name: 'Earth → Mars · 2033 minimum-energy window',
    summary: 'Ideal Hohmann opportunity, ~5.3 km/s total Δv',
    origin: 'Earth',
    destination: 'Mars',
    departureUTC: Date.UTC(2033, 3, 22),     // Apr 22, 2033
    flybys: [],
  },
  {
    id: 'mars-return-2029',
    name: 'Mars → Earth · 2029 return',
    summary: 'Return leg from a 2026 arrival; demonstrates outbound-and-return planning',
    origin: 'Mars',
    destination: 'Earth',
    departureUTC: Date.UTC(2029, 0, 15),     // Jan 15, 2029
    flybys: [],
  },
  {
    id: 'jupiter-direct',
    name: 'Earth → Jupiter · direct Hohmann',
    summary: '~1000-day cruise, ~14 km/s Δv — outside Super Heavy budget without an assist',
    origin: 'Earth',
    destination: 'Jupiter',
    departureUTC: Date.UTC(2031, 7, 15),
    flybys: [],
  },
  {
    id: 'jupiter-via-mars',
    name: 'Earth → Mars (flyby) → Jupiter',
    summary: 'Gravity-assist past Mars to lower the Jupiter arrival energy',
    origin: 'Earth',
    destination: 'Jupiter',
    departureUTC: Date.UTC(2031, 0, 10),
    flybys: [
      { bodyName: 'Mars', dateUTC: Date.UTC(2031, 9, 1) },
    ],
  },
  {
    id: 'venus-mars-via-venus',
    name: 'Earth → Venus (flyby) → Mars',
    summary: 'Inner-system gravity assist — short-period demo of Type-I patched conic',
    origin: 'Earth',
    destination: 'Mars',
    departureUTC: Date.UTC(2027, 0, 10),
    flybys: [
      { bodyName: 'Venus', dateUTC: Date.UTC(2027, 5, 15) },
    ],
  },
  {
    id: 'saturn-direct',
    name: 'Earth → Saturn · direct Hohmann',
    summary: '~6-year cruise, demonstrates outer-system targeting',
    origin: 'Earth',
    destination: 'Saturn',
    departureUTC: Date.UTC(2030, 5, 1),
    flybys: [],
  },
  {
    id: 'ceres-direct',
    name: 'Earth → Ceres · belt rendezvous sketch',
    summary: 'Dwarf-planet target in the main belt (snapshot elements)',
    origin: 'Earth',
    destination: 'Ceres',
    departureUTC: Date.UTC(2028, 4, 1),
    flybys: [],
  },
  {
    id: 'bennu-sample',
    name: 'Earth → Bennu · NEO sketch',
    summary: 'OSIRIS-REx-class NEO target using committed snapshot elements',
    origin: 'Earth',
    destination: 'Bennu',
    departureUTC: Date.UTC(2027, 8, 15),
    flybys: [],
  },
  {
    id: 'em-l2-sketch',
    name: 'Earth → EM-L2 · geometric sketch',
    summary: 'Collinear L2 waypoint (not CR3BP) — educational only',
    origin: 'Earth',
    destination: 'EM-L2',
    departureUTC: Date.UTC(2026, 6, 1),
    flybys: [],
  },
  {
    id: 'pluto-direct',
    name: 'Earth → Pluto · outer sketch',
    summary: 'Long-cruise dwarf-planet transfer (snapshot elements)',
    origin: 'Earth',
    destination: 'Pluto',
    departureUTC: Date.UTC(2029, 0, 20),
    flybys: [],
  },
  {
    id: 'venus-direct',
    name: 'Earth → Venus · inner window',
    summary: 'Short-period inner-planet transfer',
    origin: 'Earth',
    destination: 'Venus',
    departureUTC: Date.UTC(2026, 9, 1),
    flybys: [],
  },
];
