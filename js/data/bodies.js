import { DAY, DEG } from '../constants.js';

export const SUN_DATA = {
  name: 'Sun', mass: 1.98892e30, radius: 6.9634e8,
  color: '#fff4d6', displayRadius: 0.06,
};

export const BODIES = [
  {
    name: 'Mercury', mass: 3.3011e23, radius: 2.4397e6,
    color: '#b0a898', emissive: '#2a2520',
    a: 0.38709927, e: 0.20563593,
    I: 7.00497902 * DEG, L0: 252.25032350 * DEG,
    wBar: 77.45779628 * DEG, omega: 48.33076593 * DEG,
    period: 87.969 * DAY, displayRadius: 0.012,
    desc: 'Closest planet to the Sun. Heavily cratered, no atmosphere.',
  },
  {
    name: 'Venus', mass: 4.8675e24, radius: 6.0518e6,
    color: '#e8cda0', emissive: '#3a3020',
    a: 0.72333566, e: 0.00677672,
    I: 3.39467605 * DEG, L0: 181.97909950 * DEG,
    wBar: 131.60246718 * DEG, omega: 76.67984255 * DEG,
    period: 224.701 * DAY, displayRadius: 0.018,
    desc: 'Thick CO2 atmosphere, surface temp ~465C. Rotates retrograde.',
  },
  {
    name: 'Earth', mass: 5.97237e24, radius: 6.371e6,
    color: '#4a90d9', emissive: '#0a2040',
    a: 1.00000261, e: 0.01671123,
    I: -0.00001531 * DEG, L0: 100.46457166 * DEG,
    wBar: 102.93768193 * DEG, omega: 0.0,
    period: 365.256 * DAY, displayRadius: 0.020,
    desc: 'Our home. Only known planet harboring life.',
  },
  {
    name: 'Mars', mass: 6.4171e23, radius: 3.3895e6,
    color: '#c1440e', emissive: '#301005',
    a: 1.52371034, e: 0.09339410,
    I: 1.84969142 * DEG, L0: 355.44656806 * DEG,
    wBar: 336.05637041 * DEG, omega: 49.55953891 * DEG,
    period: 686.980 * DAY, displayRadius: 0.016,
    desc: 'The Red Planet. Target for human colonization.',
  },
  {
    name: 'Jupiter', mass: 1.8982e27, radius: 6.9911e7,
    color: '#c8a55a', emissive: '#302510',
    a: 5.20288700, e: 0.04838624,
    I: 1.30439695 * DEG, L0: 34.39644051 * DEG,
    wBar: 14.72847983 * DEG, omega: 100.47390909 * DEG,
    period: 4332.589 * DAY, displayRadius: 0.045,
    desc: 'Gas giant. 2.5x mass of all other planets combined.',
  },
  {
    name: 'Saturn', mass: 5.6834e26, radius: 5.8232e7,
    color: '#e0c878', emissive: '#352d15',
    a: 9.53667594, e: 0.05386179,
    I: 2.48599187 * DEG, L0: 49.95424423 * DEG,
    wBar: 92.59887831 * DEG, omega: 113.66242448 * DEG,
    period: 10759.22 * DAY, displayRadius: 0.040,
    desc: 'Iconic ring system. Least dense planet.',
  },
  {
    name: 'Uranus', mass: 8.6810e25, radius: 2.5362e7,
    color: '#72b5c4', emissive: '#152530',
    a: 19.18916464, e: 0.04725744,
    I: 0.77263783 * DEG, L0: 313.23810451 * DEG,
    wBar: 170.95427630 * DEG, omega: 74.01692503 * DEG,
    period: 30688.5 * DAY, displayRadius: 0.030,
    desc: 'Ice giant. Rotates on its side (97.8 degree tilt).',
  },
  {
    name: 'Neptune', mass: 1.02413e26, radius: 2.4622e7,
    color: '#3a5fcd', emissive: '#0a1530',
    a: 30.06992276, e: 0.00859048,
    I: 1.77004347 * DEG, L0: 304.87997031 * DEG,
    wBar: 44.96476227 * DEG, omega: 131.78422574 * DEG,
    period: 60182.0 * DAY, displayRadius: 0.028,
    desc: 'Farthest planet. Winds up to 2,100 km/h.',
  },
];

export function findBodyByName(name) {
  if (!name) return null;
  return BODIES.find(b => b.name === name) || null;
}
