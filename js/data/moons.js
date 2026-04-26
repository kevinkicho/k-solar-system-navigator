import { DAY, MOON_ORBIT_SCALE, TWO_PI } from '../constants.js';
import { BODIES } from './bodies.js';

export const MOONS = [
  // ---- EARTH ----
  {
    name: 'Moon', parent: 'Earth', mass: 7.342e22, radius: 1.7374e6,
    color: '#c8c8c8', emissive: '#222222',
    a_km: 384400, e: 0.0549, I: 5.145,
    period: 27.322 * DAY, displayRadius: 0.008,
    desc: 'Earth\'s only natural satellite. Tidally locked.',
  },
  // ---- MARS ----
  {
    name: 'Phobos', parent: 'Mars', mass: 1.0659e16, radius: 11.267e3,
    color: '#8a7a6a', emissive: '#1a1510',
    a_km: 9376, e: 0.0151, I: 1.093,
    period: 0.31891 * DAY, displayRadius: 0.004,
    desc: 'Larger moon of Mars. Orbits closer than any other known moon.',
  },
  {
    name: 'Deimos', parent: 'Mars', mass: 1.4762e15, radius: 6.2e3,
    color: '#9a8a7a', emissive: '#1a1510',
    a_km: 23463, e: 0.00033, I: 0.93,
    period: 1.263 * DAY, displayRadius: 0.003,
    desc: 'Smaller moon of Mars. Likely a captured asteroid.',
  },
  // ---- JUPITER — Galilean moons + notable others ----
  {
    name: 'Io', parent: 'Jupiter', mass: 8.9319e22, radius: 1.8216e6,
    color: '#e8d050', emissive: '#3a3010',
    a_km: 421700, e: 0.0041, I: 0.036,
    period: 1.769 * DAY, displayRadius: 0.007,
    desc: 'Most volcanically active body in the solar system.',
  },
  {
    name: 'Europa', parent: 'Jupiter', mass: 4.7998e22, radius: 1.5608e6,
    color: '#c8b898', emissive: '#252015',
    a_km: 671034, e: 0.009, I: 0.466,
    period: 3.551 * DAY, displayRadius: 0.007,
    desc: 'Subsurface ocean beneath icy crust. Prime target for life search.',
  },
  {
    name: 'Ganymede', parent: 'Jupiter', mass: 1.4819e23, radius: 2.6341e6,
    color: '#a0a0a8', emissive: '#202025',
    a_km: 1070412, e: 0.0013, I: 0.177,
    period: 7.155 * DAY, displayRadius: 0.009,
    desc: 'Largest moon in the solar system. Larger than Mercury.',
  },
  {
    name: 'Callisto', parent: 'Jupiter', mass: 1.0759e23, radius: 2.4103e6,
    color: '#706858', emissive: '#151210',
    a_km: 1882709, e: 0.0074, I: 0.192,
    period: 16.689 * DAY, displayRadius: 0.008,
    desc: 'Most heavily cratered object in the solar system.',
  },
  {
    name: 'Amalthea', parent: 'Jupiter', mass: 2.08e18, radius: 83.5e3,
    color: '#c05030', emissive: '#201008',
    a_km: 181366, e: 0.003, I: 0.380,
    period: 0.498 * DAY, displayRadius: 0.003,
    desc: 'Reddest object in the solar system. Irregular shape.',
  },
  {
    name: 'Himalia', parent: 'Jupiter', mass: 4.2e18, radius: 85e3,
    color: '#808078', emissive: '#151515',
    a_km: 11461000, e: 0.162, I: 27.50,
    period: 250.56 * DAY, displayRadius: 0.003,
    desc: 'Largest irregular satellite of Jupiter.',
  },
  // ---- SATURN ----
  {
    name: 'Mimas', parent: 'Saturn', mass: 3.7493e19, radius: 198.2e3,
    color: '#c0c0c0', emissive: '#1a1a1a',
    a_km: 185539, e: 0.0196, I: 1.574,
    period: 0.942 * DAY, displayRadius: 0.004,
    desc: 'Death Star moon. Giant Herschel crater dominates surface.',
  },
  {
    name: 'Enceladus', parent: 'Saturn', mass: 1.0802e20, radius: 252.1e3,
    color: '#f0f0ff', emissive: '#202028',
    a_km: 237948, e: 0.0047, I: 0.009,
    period: 1.370 * DAY, displayRadius: 0.005,
    desc: 'Geysers of water ice from subsurface ocean. Possible life.',
  },
  {
    name: 'Tethys', parent: 'Saturn', mass: 6.1745e20, radius: 531.1e3,
    color: '#d0d0d0', emissive: '#1a1a1a',
    a_km: 294619, e: 0.0001, I: 1.12,
    period: 1.888 * DAY, displayRadius: 0.005,
    desc: 'Icy moon with massive Odysseus crater and Ithaca Chasma.',
  },
  {
    name: 'Dione', parent: 'Saturn', mass: 1.0955e21, radius: 561.4e3,
    color: '#c8c8c8', emissive: '#181818',
    a_km: 377396, e: 0.0022, I: 0.019,
    period: 2.737 * DAY, displayRadius: 0.005,
    desc: 'Icy moon with wispy terrain and possible subsurface ocean.',
  },
  {
    name: 'Rhea', parent: 'Saturn', mass: 2.3065e21, radius: 763.8e3,
    color: '#b8b8b8', emissive: '#161616',
    a_km: 527108, e: 0.0013, I: 0.345,
    period: 4.518 * DAY, displayRadius: 0.006,
    desc: 'Second-largest moon of Saturn. Heavily cratered ice body.',
  },
  {
    name: 'Titan', parent: 'Saturn', mass: 1.3452e23, radius: 2.5747e6,
    color: '#d4a040', emissive: '#302008',
    a_km: 1221870, e: 0.0288, I: 0.348,
    period: 15.945 * DAY, displayRadius: 0.009,
    desc: 'Only moon with a dense atmosphere. Methane lakes and rain.',
  },
  {
    name: 'Hyperion', parent: 'Saturn', mass: 5.62e18, radius: 135e3,
    color: '#b0a090', emissive: '#1a1510',
    a_km: 1481009, e: 0.1230, I: 0.43,
    period: 21.277 * DAY, displayRadius: 0.004,
    desc: 'Chaotic rotation. Sponge-like appearance with deep craters.',
  },
  {
    name: 'Iapetus', parent: 'Saturn', mass: 1.8056e21, radius: 734.5e3,
    color: '#908070', emissive: '#151210',
    a_km: 3560820, e: 0.0286, I: 15.47,
    period: 79.322 * DAY, displayRadius: 0.006,
    desc: 'Two-toned moon: one hemisphere dark, the other bright white.',
  },
  // ---- URANUS ----
  {
    name: 'Miranda', parent: 'Uranus', mass: 6.59e19, radius: 235.8e3,
    color: '#a0a0a8', emissive: '#181820',
    a_km: 129390, e: 0.0013, I: 4.232,
    period: 1.413 * DAY, displayRadius: 0.004,
    desc: 'Extreme geological features. 20km high Verona Rupes cliff.',
  },
  {
    name: 'Ariel', parent: 'Uranus', mass: 1.353e21, radius: 578.9e3,
    color: '#b0b0b8', emissive: '#181820',
    a_km: 190900, e: 0.0012, I: 0.260,
    period: 2.520 * DAY, displayRadius: 0.005,
    desc: 'Brightest and youngest surface of the Uranian moons.',
  },
  {
    name: 'Umbriel', parent: 'Uranus', mass: 1.172e21, radius: 584.7e3,
    color: '#686868', emissive: '#101010',
    a_km: 266000, e: 0.0039, I: 0.128,
    period: 4.144 * DAY, displayRadius: 0.005,
    desc: 'Darkest of the large Uranian moons. Ancient cratered surface.',
  },
  {
    name: 'Titania', parent: 'Uranus', mass: 3.527e21, radius: 788.4e3,
    color: '#b8b0a8', emissive: '#181815',
    a_km: 435910, e: 0.0011, I: 0.079,
    period: 8.706 * DAY, displayRadius: 0.006,
    desc: 'Largest moon of Uranus. Named after Shakespeare\'s fairy queen.',
  },
  {
    name: 'Oberon', parent: 'Uranus', mass: 3.014e21, radius: 761.4e3,
    color: '#a09890', emissive: '#181515',
    a_km: 583520, e: 0.0014, I: 0.058,
    period: 13.463 * DAY, displayRadius: 0.006,
    desc: 'Outermost major moon of Uranus. Dark, heavily cratered.',
  },
  // ---- NEPTUNE ----
  {
    name: 'Proteus', parent: 'Neptune', mass: 4.4e19, radius: 210e3,
    color: '#707070', emissive: '#101010',
    a_km: 117647, e: 0.0005, I: 0.524,
    period: 1.122 * DAY, displayRadius: 0.004,
    desc: 'Largest irregular-shaped moon. Nearly spherical at its size limit.',
  },
  {
    name: 'Triton', parent: 'Neptune', mass: 2.14e22, radius: 1.3534e6,
    color: '#a0c0c8', emissive: '#152025',
    a_km: 354759, e: 0.000016, I: 156.885,
    period: 5.877 * DAY, displayRadius: 0.007,
    desc: 'Retrograde orbit — likely captured dwarf planet. Nitrogen geysers.',
  },
  {
    name: 'Nereid', parent: 'Neptune', mass: 3.1e19, radius: 170e3,
    color: '#909090', emissive: '#121212',
    a_km: 5513400, e: 0.7507, I: 7.23,
    period: 360.14 * DAY, displayRadius: 0.003,
    desc: 'Most eccentric orbit of any moon. Likely a captured object.',
  },
];

// Group moons by parent so we can assign incrementing display-orbit radii.
export const moonsByParent = {};
for (const moon of MOONS) {
  if (!moonsByParent[moon.parent]) moonsByParent[moon.parent] = [];
  moonsByParent[moon.parent].push(moon);
}

for (const parent in moonsByParent) {
  const moons = moonsByParent[parent];
  moons.sort((a, b) => a.a_km - b.a_km);
  const parentBody = BODIES.find(b => b.name === parent);
  const baseRadius = parentBody ? parentBody.displayRadius * 2.5 : 0.05;
  for (let i = 0; i < moons.length; i++) {
    moons[i].displayOrbit = baseRadius + (i + 1) * MOON_ORBIT_SCALE * 0.28;
    moons[i].M0 = (i * 2.399) % TWO_PI;
  }
}
