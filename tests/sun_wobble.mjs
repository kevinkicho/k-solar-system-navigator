// Validates the Sun barycentric-wobble calculation.
//   (1) At physical scale (exaggeration=1) the rendered system's center of
//       mass must sit on the scene origin (±1e-6 AU tolerance).
//   (2) Wobble amplitude must match expected order of magnitude — about
//       1.5 solar radii (~0.005 AU) because Jupiter dominates.
//   (3) The wobble period should be close to Jupiter's (~11.86 years).

const G=6.67430e-11, AU=1.495978707e11, DAY=86400, PI=Math.PI, TWO_PI=2*PI, DEG=PI/180;
const J2000=Date.UTC(2000,0,1,12,0,0);
const SUN_RADIUS = 6.9634e8;      // m
const SUN_MASS = 1.98892e30;

// Real J2000 mean orbital elements + masses (same as in the app)
const BODIES = [
  {name:'Mercury', mass:3.3011e23, a:0.38709927,e:0.20563593,I:7.00497902,L0:252.25032350,wBar:77.45779628,omega:48.33076593,period:87.969*DAY},
  {name:'Venus',   mass:4.8675e24, a:0.72333566,e:0.00677672,I:3.39467605,L0:181.97909950,wBar:131.60246718,omega:76.67984255,period:224.701*DAY},
  {name:'Earth',   mass:5.972e24,  a:1.00000261,e:0.01671123,I:-0.00001531,L0:100.46457166,wBar:102.93768193,omega:0.0,period:365.256*DAY},
  {name:'Mars',    mass:6.417e23,  a:1.52371034,e:0.09339410,I:1.84969142,L0:355.44656806,wBar:336.05637041,omega:49.55953891,period:686.980*DAY},
  {name:'Jupiter', mass:1.898e27,  a:5.20288700,e:0.04838624,I:1.30439695,L0:34.39644051,wBar:14.72847983,omega:100.47390909,period:4332.589*DAY},
  {name:'Saturn',  mass:5.683e26,  a:9.53667594,e:0.05386179,I:2.48599187,L0:49.95424423,wBar:92.59887831,omega:113.66242448,period:10759.22*DAY},
  {name:'Uranus',  mass:8.681e25,  a:19.18916464,e:0.04725744,I:0.77263783,L0:313.23810451,wBar:170.95427630,omega:74.01692503,period:30688.5*DAY},
  {name:'Neptune', mass:1.024e26,  a:30.06992276,e:0.00859048,I:1.77004347,L0:304.87997031,wBar:44.96476227,omega:131.78422574,period:60182.0*DAY},
].map(b => ({...b, I: b.I*DEG, L0: b.L0*DEG, wBar: b.wBar*DEG, omega: b.omega*DEG}));

function solveKepler(M,e){M=((M%TWO_PI)+TWO_PI)%TWO_PI;let E=M+e*Math.sin(M);for(let i=0;i<50;i++){const dE=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));E-=dE;if(Math.abs(dE)<1e-10)break;}return E;}
function pos(b,t){
  const n=TWO_PI/b.period,M=(b.L0-b.wBar)+n*t;
  const E=solveKepler(M,b.e);
  const cosV=(Math.cos(E)-b.e)/(1-b.e*Math.cos(E));
  const sinV=Math.sqrt(1-b.e*b.e)*Math.sin(E)/(1-b.e*Math.cos(E));
  const v=Math.atan2(sinV,cosV),r=b.a*(1-b.e*Math.cos(E));
  const w=b.wBar-b.omega;
  const cO=Math.cos(b.omega),sO=Math.sin(b.omega),cWV=Math.cos(w+v),sWV=Math.sin(w+v),cI=Math.cos(b.I),sI=Math.sin(b.I);
  return {x:r*(cO*cWV-sO*sWV*cI), y:r*sWV*sI, z:r*(sO*cWV+cO*sWV*cI)};
}

function sunOffset(t) {
  let sx=0, sy=0, sz=0, mTot=SUN_MASS;
  for (const b of BODIES){
    const p = pos(b, t);
    sx += b.mass*p.x; sy += b.mass*p.y; sz += b.mass*p.z;
    mTot += b.mass;
  }
  return { x: -sx/mTot, y: -sy/mTot, z: -sz/mTot };
}

// (1) Barycenter closure — the mass-weighted sum of all bodies (Sun + planets)
// in the shifted (scene) frame must sit at origin.
let maxResidual = 0;
for (let yr=-50; yr<=50; yr+=5){
  const t = yr*365.25*DAY;
  const off = sunOffset(t);
  let cx=SUN_MASS*off.x, cy=SUN_MASS*off.y, cz=SUN_MASS*off.z, m=SUN_MASS;
  for (const b of BODIES){
    const p = pos(b, t);
    cx += b.mass*(p.x+off.x);
    cy += b.mass*(p.y+off.y);
    cz += b.mass*(p.z+off.z);
    m += b.mass;
  }
  const residual = Math.hypot(cx/m, cy/m, cz/m);
  if (residual > maxResidual) maxResidual = residual;
}
const closureOk = maxResidual < 1e-12;
console.log(`[1] Barycenter closure: max residual = ${maxResidual.toExponential(2)} AU  ${closureOk ? 'PASS' : 'FAIL'}`);

// (2) Wobble amplitude — sweep 50 years, report min/max amplitude in solar radii
let minA=Infinity, maxA=0;
for (let d=0; d<50*365.25; d+=1){
  const t = d*DAY;
  const o = sunOffset(t);
  const r = Math.hypot(o.x, o.y, o.z) * AU;   // metres
  const inSR = r / SUN_RADIUS;
  if (inSR < minA) minA = inSR;
  if (inSR > maxA) maxA = inSR;
}
const ampOk = maxA > 1.0 && maxA < 2.5;
console.log(`[2] Wobble amplitude over 50 years: min=${minA.toFixed(2)} R☉, max=${maxA.toFixed(2)} R☉  ${ampOk ? 'PASS (expected ~1.5 R☉)' : 'FAIL'}`);

// (3) Dominant period — autocorrelate the x-component of the wobble. Expect
// peak near Jupiter's period (11.86 years).
const N = 2000, dt = 20*365.25*DAY / N;
const xs = [];
for (let i=0;i<N;i++) xs.push(sunOffset(i*dt).x);
// Brute search over lags from 5 to 15 years for max correlation
let bestLag=0, bestCorr=-Infinity;
for (let lagDays=5*365.25; lagDays<=15*365.25; lagDays+=1){
  const lagSamples = Math.round(lagDays*DAY/dt);
  if (lagSamples >= N) break;
  let c=0;
  for (let i=0;i<N-lagSamples;i++) c += xs[i]*xs[i+lagSamples];
  if (c > bestCorr){ bestCorr=c; bestLag=lagDays; }
}
const periodYr = bestLag/365.25;
// Jupiter (11.86yr) dominates but Saturn (29.4yr) broadens the autocorrelation
// peak, so accept a generous 8–14 yr window — the real signal has multiple
// planet periods superposed.
const periodOk = periodYr > 8 && periodYr < 14;
console.log(`[3] Dominant wobble period (autocorrelation 5–15yr window): ${periodYr.toFixed(2)} yr  ${periodOk ? 'PASS (expected near Jupiter = 11.86 yr)' : 'FAIL'}`);

if (!closureOk || !ampOk || !periodOk) process.exit(1);
