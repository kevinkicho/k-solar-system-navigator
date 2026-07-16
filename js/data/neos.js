// Curated near-Earth objects — static element snapshots for educational routing.
// Epoch / source per object. Not live SBDB; recompute windows with care.

import { DAY, DEG } from '../constants.js';

const CENTURY_SEC = 36525 * DAY;

export const NEOS = [
  {
    id: 'apophis', name: 'Apophis', kind: 'neo',
    mass: 6.1e10, radius: 185,
    color: '#ff8866', emissive: '#401808',
    a: 0.9224, e: 0.1912,
    I: 3.339 * DEG, L0: 0 * DEG,
    wBar: 126.4 * DEG, omega: 204.4 * DEG,
    period: 323.6 * DAY, displayRadius: 0.006,
    flybyEligible: true, routeable: true, selectable: true,
    desc: 'Aten NEA famous for close Earth approaches. Sketch elements only.',
    epoch: 'approx snapshot',
    source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Apophis',
  },
  {
    id: 'bennu', name: 'Bennu', kind: 'neo',
    mass: 7.33e10, radius: 262.5,
    color: '#887766', emissive: '#201810',
    a: 1.126, e: 0.2037,
    I: 6.035 * DEG, L0: 0 * DEG,
    wBar: 66.2 * DEG, omega: 2.06 * DEG,
    period: 436.6 * DAY, displayRadius: 0.006,
    flybyEligible: true, routeable: true, selectable: true,
    desc: 'OSIRIS-REx target. Carbonaceous NEA.',
    epoch: 'approx snapshot',
    source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Bennu',
  },
  {
    id: 'eros', name: 'Eros', kind: 'neo',
    mass: 6.69e15, radius: 8420,
    color: '#c8a070', emissive: '#302010',
    a: 1.458, e: 0.2227,
    I: 10.83 * DEG, L0: 0 * DEG,
    wBar: 178.7 * DEG, omega: 304.4 * DEG,
    period: 643.2 * DAY, displayRadius: 0.007,
    flybyEligible: true, routeable: true, selectable: true,
    desc: 'Amor asteroid; NEAR Shoemaker orbiter target.',
    epoch: 'approx snapshot',
    source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Eros',
  },
  {
    id: 'itokawa', name: 'Itokawa', kind: 'neo',
    mass: 3.51e10, radius: 165,
    color: '#a89880', emissive: '#282018',
    a: 1.324, e: 0.2803,
    I: 1.622 * DEG, L0: 0 * DEG,
    wBar: 162.8 * DEG, omega: 69.1 * DEG,
    period: 556.4 * DAY, displayRadius: 0.005,
    flybyEligible: false, routeable: true, selectable: true,
    desc: 'Hayabusa sample-return target. S-type rubble pile.',
    epoch: 'approx snapshot',
    source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Itokawa',
  },
  {
    id: 'ryugu', name: 'Ryugu', kind: 'neo',
    mass: 4.50e11, radius: 448,
    color: '#665544', emissive: '#181008',
    a: 1.190, e: 0.1902,
    I: 5.884 * DEG, L0: 0 * DEG,
    wBar: 211.4 * DEG, omega: 251.6 * DEG,
    period: 473.9 * DAY, displayRadius: 0.006,
    flybyEligible: false, routeable: true, selectable: true,
    desc: 'Hayabusa2 target. C-type NEA.',
    epoch: 'approx snapshot',
    source: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Ryugu',
  },
];

for (const b of NEOS) {
  b.L_dot = (2 * Math.PI / b.period) * CENTURY_SEC;
  b.a_dot = 0; b.e_dot = 0; b.I_dot = 0; b.wBar_dot = 0; b.omega_dot = 0;
}
