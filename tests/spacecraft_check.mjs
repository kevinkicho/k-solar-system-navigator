// Sanity-check spacecraft positions against NASA tracking distances, comparing
// (a) linear propagation (the app's old behavior) with
// (b) heliocentric 2-body Kepler propagation (the app's new behavior).
// Expectation: Kepler should match NASA references at least as well as linear
// and better as time goes on — gravitational deceleration is not negligible
// over decades in the outer solar system.
const G = 6.67430e-11;
const M_SUN = 1.98892e30;
const MU = G * M_SUN;
const AU = 1.495978707e11;
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);

const SC = [
  { name:'Voyager 1',    pos_AU:[-14.9, 43.0, -59.7], vel:[-3376, 9787, -13555] },
  { name:'Voyager 2',    pos_AU:[13.2, -36.2, -46.0], vel:[3366, -9241, -11720] },
  { name:'Pioneer 10',   pos_AU:[25.6, -6.5, 70.2],   vel:[4180, -1060, 11470] },
  { name:'Pioneer 11',   pos_AU:[31.3, 10.4, 50.1],   vel:[6220, 2070, 9960] },
  { name:'New Horizons', pos_AU:[-4.72, 11.08, 0.63], vel:[5474, -12880, -732] },
];

const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const mag = a => Math.sqrt(dot(a,a));
const scl = (a,s) => [a[0]*s, a[1]*s, a[2]*s];
const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

function buildHelioOrbit(r0v, v0, mu){
  const r0 = mag(r0v), v0m = mag(v0);
  const h_vec = cross(r0v, v0);
  const h = mag(h_vec);
  const vxh = cross(v0, h_vec);
  const r0hat = scl(r0v, 1/r0);
  const e_vec = sub(scl(vxh, 1/mu), r0hat);
  const e = mag(e_vec);
  const energy = v0m*v0m/2 - mu/r0;
  const a = -mu / (2*energy);
  const p = h*h / mu;
  const p_hat = e>1e-10 ? scl(e_vec, 1/e) : r0hat;
  const w_hat = scl(h_vec, 1/h);
  const q_hat = cross(w_hat, p_hat);
  const cosNu0 = dot(r0hat, p_hat);
  const sinNu0 = dot(r0hat, q_hat);
  const nu0 = Math.atan2(sinNu0, cosNu0);
  const hyperbolic = e > 1;
  let M0, n;
  if (hyperbolic){
    const H0 = 2*Math.atanh(Math.sqrt((e-1)/(e+1))*Math.tan(nu0/2));
    M0 = e*Math.sinh(H0) - H0;
    n = Math.sqrt(mu / Math.pow(Math.abs(a), 3));
  } else {
    const E0 = 2*Math.atan2(Math.sqrt(Math.max(0,1-e))*Math.sin(nu0/2), Math.sqrt(1+e)*Math.cos(nu0/2));
    M0 = E0 - e*Math.sin(E0);
    n = Math.sqrt(mu / (a*a*a));
  }
  return { a, e, p, p_hat, q_hat, w_hat, M0, n, hyperbolic };
}
function propagateHelioOrbit(orb, dt){
  const M = orb.M0 + orb.n*dt;
  let nu;
  if (orb.hyperbolic){
    let H = Math.asinh(M / orb.e);
    for (let i=0;i<60;i++){
      const f = orb.e*Math.sinh(H) - H - M;
      const df = orb.e*Math.cosh(H) - 1;
      const dH = f/df;
      H -= dH;
      if (Math.abs(dH) < 1e-12) break;
    }
    nu = 2*Math.atan2(Math.sqrt(orb.e+1)*Math.sinh(H/2), Math.sqrt(orb.e-1)*Math.cosh(H/2));
  } else {
    // Elliptical fallback; not expected for these spacecraft
    let E = M;
    for (let i=0;i<50;i++){
      const dE = (E - orb.e*Math.sin(E) - M) / (1 - orb.e*Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-10) break;
    }
    const cosNu = (Math.cos(E) - orb.e) / (1 - orb.e*Math.cos(E));
    const sinNu = Math.sqrt(1 - orb.e*orb.e)*Math.sin(E) / (1 - orb.e*Math.cos(E));
    nu = Math.atan2(sinNu, cosNu);
  }
  const r = orb.p / (1 + orb.e*Math.cos(nu));
  return add(scl(orb.p_hat, r*Math.cos(nu)), scl(orb.q_hat, r*Math.sin(nu)));
}

function linear(sc, dt){
  return [
    sc.pos_AU[0]*AU + sc.vel[0]*dt,
    sc.pos_AU[1]*AU + sc.vel[1]*dt,
    sc.pos_AU[2]*AU + sc.vel[2]*dt,
  ];
}
function kepler(sc, dt){
  if (!sc._orb){
    const r0 = [sc.pos_AU[0]*AU, sc.pos_AU[1]*AU, sc.pos_AU[2]*AU];
    sc._orb = buildHelioOrbit(r0, sc.vel, MU);
  }
  return propagateHelioOrbit(sc._orb, dt);
}

// Published NASA tracking distances. Tolerance: a few AU — these are single
// reference values and slightly date-dependent, but good enough for ±2 AU work.
const refs = {
  'Voyager 1':   { '2020': 148, '2026': 168 },
  'Voyager 2':   { '2020': 124, '2026': 141 },
  'Pioneer 10':  { '2020': 126, '2026': 139 },
  'Pioneer 11':  { '2020': 103, '2026': 115 },
  'New Horizons':{ '2020':  47, '2026':  60 },
};

console.log('Spacecraft distance from Sun — linear vs Kepler vs NASA reference');
console.log('─'.repeat(94));
console.log('                  |   @ 2020-01-01              |   @ 2026-01-01              ');
console.log('spacecraft        |  linear   kepler     ref    |  linear   kepler     ref    |  hyperbolic? e');
console.log('─'.repeat(94));
const dt20 = (Date.UTC(2020,0,1) - J2000) / 1000;
const dt26 = (Date.UTC(2026,0,1) - J2000) / 1000;
for (const sc of SC){
  const L20 = mag(linear(sc, dt20))/AU;
  const K20 = mag(kepler(sc, dt20))/AU;
  const L26 = mag(linear(sc, dt26))/AU;
  const K26 = mag(kepler(sc, dt26))/AU;
  const r = refs[sc.name];
  const orb = sc._orb;
  console.log(
    `${sc.name.padEnd(17)} | ${L20.toFixed(1).padStart(6)}  ${K20.toFixed(1).padStart(6)}    ${String(r['2020']).padStart(3)} AU | ` +
    `${L26.toFixed(1).padStart(6)}  ${K26.toFixed(1).padStart(6)}    ${String(r['2026']).padStart(3)} AU | ` +
    `${orb.hyperbolic ? 'yes' : 'no '}         e=${orb.e.toFixed(3)}`
  );
}

// Error summary
let sumLin=0, sumKep=0, n=0;
for (const sc of SC){
  for (const [y, dt] of [[2020,dt20],[2026,dt26]]){
    const L = mag(linear(sc, dt))/AU;
    const K = mag(kepler(sc, dt))/AU;
    const R = refs[sc.name][String(y)];
    sumLin += Math.abs(L-R);
    sumKep += Math.abs(K-R);
    n++;
  }
}
console.log(`\nMean absolute error vs NASA ref:  linear=${(sumLin/n).toFixed(2)} AU,  kepler=${(sumKep/n).toFixed(2)} AU`);
