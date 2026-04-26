// Real spacecraft state vectors anchored at J2000 (simTime=0) in scene coords (AU).
// At init we build a heliocentric 2-body (hyperbolic) Kepler orbit from (pos, vel) so
// propagation stays accurate as solar gravity continues to decelerate the craft. All
// five probes are post-last-flyby by J2000, so the Sun is the only significant
// gravitating body. Positions before each spacecraft's launch date are not rendered.
export const SPACECRAFT = [
  {
    name: 'Voyager 1',
    color: '#ffcc33',
    launchDate: Date.UTC(1977, 8, 5),
    pos_AU: [-14.9, 43.0, -59.7],
    vel_m_s: [-3376, 9787, -13555],
    desc: 'Launched 1977. Jupiter + Saturn flybys. Farthest human-made object.',
  },
  {
    name: 'Voyager 2',
    color: '#ff9f1c',
    launchDate: Date.UTC(1977, 7, 20),
    pos_AU: [13.2, -36.2, -46.0],
    vel_m_s: [3366, -9241, -11720],
    desc: 'Launched 1977. Only craft to visit Uranus (1986) and Neptune (1989).',
  },
  {
    name: 'Pioneer 10',
    color: '#90a4ae',
    launchDate: Date.UTC(1972, 2, 2),
    pos_AU: [25.6, -6.5, 70.2],
    vel_m_s: [4180, -1060, 11470],
    desc: 'Launched 1972. First craft to Jupiter. Signal lost 2003.',
  },
  {
    name: 'Pioneer 11',
    color: '#78909c',
    launchDate: Date.UTC(1973, 3, 6),
    pos_AU: [31.3, 10.4, 50.1],
    vel_m_s: [6220, 2070, 9960],
    desc: 'Launched 1973. First craft to Saturn. Signal lost 1995.',
  },
  {
    name: 'New Horizons',
    color: '#64b5f6',
    // Linear propagation only valid AFTER the Pluto flyby (Jul 14 2015).
    launchDate: Date.UTC(2015, 6, 14),
    pos_AU: [-4.72, 11.08, 0.63],
    vel_m_s: [5474, -12880, -732],
    desc: 'Launched 2006. Pluto flyby 2015, Arrokoth 2019.',
  },
];
