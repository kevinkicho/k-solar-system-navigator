// Sanity-check spacecraft positions: distance from Sun at a few dates should
// match published NASA tracking values to within a few percent.
const AU = 1.495978707e11;
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);

const SC = [
  { name:'Voyager 1', pos_AU:[-14.9, 43.0, -59.7], vel:[-3376, 9787, -13555] },
  { name:'Voyager 2', pos_AU:[13.2, -36.2, -46.0], vel:[3366, -9241, -11720] },
  { name:'Pioneer 10', pos_AU:[25.6, -6.5, 70.2], vel:[4180, -1060, 11470] },
  { name:'Pioneer 11', pos_AU:[31.3, 10.4, 50.1], vel:[6220, 2070, 9960] },
  { name:'New Horizons', pos_AU:[-4.72, 11.08, 0.63], vel:[5474, -12880, -732] },
];

function propagate(sc, date) {
  const simTimeSec = (date.getTime() - J2000) / 1000;
  return [
    sc.pos_AU[0] + sc.vel[0] * simTimeSec / AU,
    sc.pos_AU[1] + sc.vel[1] * simTimeSec / AU,
    sc.pos_AU[2] + sc.vel[2] * simTimeSec / AU,
  ];
}

// Reference: https://voyager.jpl.nasa.gov/mission/status/ and similar pages
// Distances in AU, ±5 AU tolerance is fine for a rough-physics view.
const refs = {
  'Voyager 1':   { '2020': 148, '2026': 168 },
  'Voyager 2':   { '2020': 124, '2026': 141 },
  'Pioneer 10':  { '2020': 126, '2026': 139 },
  'Pioneer 11':  { '2020': 103, '2026': 115 },
  'New Horizons':{ '2020':  47, '2026':  60 },
};

console.log('spacecraft         distance@2020   reference   distance@2026   reference');
for (const sc of SC) {
  const p20 = propagate(sc, new Date(Date.UTC(2020,0,1)));
  const p26 = propagate(sc, new Date(Date.UTC(2026,0,1)));
  const d20 = Math.hypot(...p20), d26 = Math.hypot(...p26);
  const r = refs[sc.name];
  console.log(`${sc.name.padEnd(18)} ${d20.toFixed(1).padStart(6)} AU       ${r['2020']} AU       ${d26.toFixed(1).padStart(6)} AU       ${r['2026']} AU`);
}
