// Dwarf planets — committed static element snapshots for educational routing.
// Elements approximate J2000-style heliocentric Keplerian values (SBDB / published).
// Source notes in header comments. Not SPICE-quality.

import { DAY, DEG } from '../constants.js';

export const DWARFS = [
  {
    // https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=1 (Ceres)
    id: 'ceres', name: 'Ceres', kind: 'dwarf',
    mass: 9.3835e20, radius: 4.73e5,
    color: '#b8b0a0', emissive: '#2a2820',
    a: 2.767, e: 0.0785,
    I: 10.59 * DEG, L0: 0 * DEG,
    wBar: 73.6 * DEG, omega: 80.3 * DEG,
    period: 1681.63 * DAY, displayRadius: 0.010,
    flybyEligible: true, routeable: true, selectable: true,
    desc: 'Largest asteroid belt object; dwarf planet. Snapshot elements for trip sketches.',
    epoch: 'J2000-ish snapshot',
    source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=1',
  },
  {
    // Pluto — classic elements
    id: 'pluto', name: 'Pluto', kind: 'dwarf',
    mass: 1.303e22, radius: 1.188e6,
    color: '#c4a484', emissive: '#302010',
    a: 39.482, e: 0.2488,
    I: 17.16 * DEG, L0: 238.93 * DEG,
    wBar: 224.07 * DEG, omega: 110.30 * DEG,
    period: 90560 * DAY, displayRadius: 0.012,
    flybyEligible: true, routeable: true, selectable: true,
    desc: 'Kuiper belt dwarf planet. High eccentricity and inclination.',
    epoch: 'J2000-ish snapshot',
    source: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
  },
  {
    id: 'eris', name: 'Eris', kind: 'dwarf',
    mass: 1.66e22, radius: 1.163e6,
    color: '#d0d4e0', emissive: '#202030',
    a: 67.864, e: 0.436,
    I: 44.04 * DEG, L0: 204.16 * DEG,
    wBar: 151.0 * DEG, omega: 35.95 * DEG,
    period: 203830 * DAY, displayRadius: 0.011,
    flybyEligible: true, routeable: true, selectable: true,
    desc: 'Scattered-disk dwarf planet; more massive than Pluto.',
    epoch: 'J2000-ish snapshot',
    source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Eris',
  },
  {
    id: 'haumea', name: 'Haumea', kind: 'dwarf',
    mass: 4.006e21, radius: 8.16e5,
    color: '#e8e0d0', emissive: '#302820',
    a: 43.116, e: 0.1966,
    I: 28.21 * DEG, L0: 218.2 * DEG,
    wBar: 239.5 * DEG, omega: 121.9 * DEG,
    period: 103468 * DAY, displayRadius: 0.010,
    flybyEligible: true, routeable: true, selectable: true,
    desc: 'Elongated Kuiper belt dwarf planet with rings and moons.',
    epoch: 'J2000-ish snapshot',
    source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Haumea',
  },
];

// Attach L_dot from period so kepler mean longitude advances correctly.
// L_dot unit in bodies: rad / Julian century.
const CENTURY_SEC = 36525 * DAY;
for (const b of DWARFS) {
  if (b.L_dot === undefined) {
    b.L_dot = (2 * Math.PI / b.period) * CENTURY_SEC;
  }
  // Zero rates for frozen snapshot
  b.a_dot = b.a_dot ?? 0;
  b.e_dot = b.e_dot ?? 0;
  b.I_dot = b.I_dot ?? 0;
  b.wBar_dot = b.wBar_dot ?? 0;
  b.omega_dot = b.omega_dot ?? 0;
}
