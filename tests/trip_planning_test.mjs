// Standalone numerical test for the solar-system-navigator trip planner.
// Math ported verbatim from index.html so we can validate accuracy without a browser.

// -------------------- CONSTANTS --------------------
const G_CONST = 6.67430e-11;
const AU = 1.495978707e11;
const DAY = 86400;
const PI = Math.PI;
const TWO_PI = 2 * PI;
const DEG = PI / 180;
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);

// IMPORTANT: the app visually exaggerates inclination. For *physics* we
// want the real plane. We run tests both with and without exaggeration.
function makeBodies(INCL_EXAGGERATION = 1) {
  return {
    Sun:  { name:'Sun', mass:1.98892e30, radius:6.9634e8 },
    Mercury:{ name:'Mercury', mass:3.3011e23,
      a:0.38709927, e:0.20563593,
      I:7.00497902*DEG*INCL_EXAGGERATION, L0:252.25032350*DEG,
      wBar:77.45779628*DEG, omega:48.33076593*DEG,
      period:87.969*DAY },
    Venus:{ name:'Venus', mass:4.8675e24,
      a:0.72333566, e:0.00677672,
      I:3.39467605*DEG*INCL_EXAGGERATION, L0:181.97909950*DEG,
      wBar:131.60246718*DEG, omega:76.67984255*DEG,
      period:224.701*DAY },
    Earth:{ name:'Earth', mass:5.97237e24,
      a:1.00000261, e:0.01671123,
      I:-0.00001531*DEG*INCL_EXAGGERATION, L0:100.46457166*DEG,
      wBar:102.93768193*DEG, omega:0.0,
      period:365.256*DAY },
    Mars:{ name:'Mars', mass:6.4171e23,
      a:1.52371034, e:0.09339410,
      I:1.84969142*DEG*INCL_EXAGGERATION, L0:355.44656806*DEG,
      wBar:336.05637041*DEG, omega:49.55953891*DEG,
      period:686.980*DAY },
    Jupiter:{ name:'Jupiter', mass:1.8982e27,
      a:5.20288700, e:0.04838624,
      I:1.30439695*DEG*INCL_EXAGGERATION, L0:34.39644051*DEG,
      wBar:14.72847983*DEG, omega:100.47390909*DEG,
      period:4332.589*DAY },
    Saturn:{ name:'Saturn', mass:5.6834e26,
      a:9.53667594, e:0.05386179,
      I:2.48599187*DEG*INCL_EXAGGERATION, L0:49.95424423*DEG,
      wBar:92.59887831*DEG, omega:113.66242448*DEG,
      period:10759.22*DAY },
    Uranus:{ name:'Uranus', mass:8.6810e25,
      a:19.18916464, e:0.04725744,
      I:0.77263783*DEG*INCL_EXAGGERATION, L0:313.23810451*DEG,
      wBar:170.95427630*DEG, omega:74.01692503*DEG,
      period:30688.5*DAY },
    Neptune:{ name:'Neptune', mass:1.02413e26,
      a:30.06992276, e:0.00859048,
      I:1.77004347*DEG*INCL_EXAGGERATION, L0:304.87997031*DEG,
      wBar:44.96476227*DEG, omega:131.78422574*DEG,
      period:60182.0*DAY },
  };
}

const SUN_MASS = 1.98892e30;
const MU_SUN   = G_CONST * SUN_MASS;

// -------------------- KEPLER / POSITIONS --------------------
function solveKepler(M, e, tol = 1e-10) {
  M = ((M % TWO_PI) + TWO_PI) % TWO_PI;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 50; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

function getBodyPosition3D(body, timeSec) {
  const n = TWO_PI / body.period;
  const M0 = body.L0 - body.wBar;
  const M = M0 + n * timeSec;
  const E = solveKepler(M, body.e);
  const cosE = Math.cos(E), sinE = Math.sin(E);
  const cosV = (cosE - body.e) / (1 - body.e * cosE);
  const sinV = (Math.sqrt(1 - body.e * body.e) * sinE) / (1 - body.e * cosE);
  const v = Math.atan2(sinV, cosV);
  const r = body.a * (1 - body.e * cosE);
  const w = body.wBar - body.omega;
  const cosO = Math.cos(body.omega), sinO = Math.sin(body.omega);
  const cosWV = Math.cos(w + v), sinWV = Math.sin(w + v);
  const cosI = Math.cos(body.I), sinI = Math.sin(body.I);
  const xe = r * (cosO * cosWV - sinO * sinWV * cosI);
  const ye = r * (sinO * cosWV + cosO * sinWV * cosI);
  const ze = r * (sinWV * sinI);
  return { x: xe, y: ze, z: ye, r, v, E };   // scene axes: y = out of plane
}

// -------------------- HOHMANN --------------------
function hohmannTransfer(b1, b2, dep) {
  const pos1 = getBodyPosition3D(b1, dep);
  const pos2 = getBodyPosition3D(b2, dep);
  const r1 = b1.a, r2 = b2.a;
  const r1m = r1 * AU, r2m = r2 * AU;
  const aT_m = (r1m + r2m) / 2;
  const transferTime = PI * Math.sqrt(aT_m**3 / MU_SUN);
  const v1c = Math.sqrt(MU_SUN / r1m);
  const v1t = Math.sqrt(MU_SUN * (2/r1m - 1/aT_m));
  const dv1 = Math.abs(v1t - v1c);
  const v2c = Math.sqrt(MU_SUN / r2m);
  const v2t = Math.sqrt(MU_SUN * (2/r2m - 1/aT_m));
  const dv2 = Math.abs(v2c - v2t);
  const arrivalSimTime = dep + transferTime;
  const posArrival = getBodyPosition3D(b2, arrivalSimTime);
  return { transferTime, dv1, dv2, dvTotal: dv1+dv2, aT: aT_m,
           pos1, pos2, posArrival, body1:b1, body2:b2,
           departureSimTime: dep, arrivalSimTime };
}

// -------------------- LAMBERT --------------------
function v3dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function v3cross(a,b){return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];}
function v3mag(a){return Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);}
function v3scale(a,s){return [a[0]*s,a[1]*s,a[2]*s];}
function v3add(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
function v3sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}

function stumpffC(z){
  if (Math.abs(z)<1e-8) return 1/2 - z/24 + z*z/720;
  if (z>0) return (1-Math.cos(Math.sqrt(z)))/z;
  return (Math.cosh(Math.sqrt(-z))-1)/(-z);
}
function stumpffS(z){
  if (Math.abs(z)<1e-8) return 1/6 - z/120 + z*z/5040;
  if (z>0){const s=Math.sqrt(z); return (s-Math.sin(s))/(z*s);}
  const s=Math.sqrt(-z); return (Math.sinh(s)-s)/((-z)*s);
}

function solveLambert(r1v, r2v, tof, mu){
  const r1=v3mag(r1v), r2=v3mag(r2v);
  const cosDth = Math.max(-1, Math.min(1, v3dot(r1v,r2v)/(r1*r2)));
  const crossY = r1v[2]*r2v[0] - r1v[0]*r2v[2];
  const dtheta = crossY < 0 ? Math.acos(cosDth) : TWO_PI - Math.acos(cosDth);
  const sinDth = Math.sin(dtheta);
  if (Math.abs(1-cosDth)<1e-14) return null;
  const A = sinDth * Math.sqrt(r1*r2/(1-cosDth));
  if (Math.abs(A)<1e-10) return null;
  const sqrtMu = Math.sqrt(mu);

  let z = 0.1;
  for (let iter=0; iter<400; iter++){
    let C=stumpffC(z), S=stumpffS(z);
    let sqC=Math.sqrt(Math.abs(C)); if(sqC<1e-30) sqC=1e-30;
    let y=r1+r2+A*(z*S-1)/sqC;
    if (y<0){z=Math.abs(z)+0.5; continue;}
    const chi=Math.sqrt(y/C);
    const F=chi**3*S + A*Math.sqrt(y) - sqrtMu*tof;
    const eps=1e-7*(1+Math.abs(z));
    const C2=stumpffC(z+eps), S2=stumpffS(z+eps);
    let sqC2=Math.sqrt(Math.abs(C2)); if(sqC2<1e-30) sqC2=1e-30;
    const y2=r1+r2+A*((z+eps)*S2-1)/sqC2;
    if (y2<0){z+=0.5; continue;}
    const chi2=Math.sqrt(y2/C2);
    const F2=chi2**3*S2 + A*Math.sqrt(y2) - sqrtMu*tof;
    const dFdz=(F2-F)/eps;
    if (Math.abs(dFdz)<1e-30) break;
    const zNew=z-F/dFdz;
    if (Math.abs(zNew-z)<1e-10){z=zNew; break;}
    z=zNew;
  }
  const C=stumpffC(z), S=stumpffS(z);
  let sqC=Math.sqrt(Math.abs(C)); if(sqC<1e-30) return null;
  const y=r1+r2+A*(z*S-1)/sqC;
  if (y<0) return null;
  const f=1-y/r1, g=A*Math.sqrt(y/mu), gdot=1-y/r2;
  if (Math.abs(g)<1e-30) return null;
  const v1=v3scale(v3sub(r2v, v3scale(r1v,f)), 1/g);
  const v2=v3scale(v3sub(v3scale(r2v,gdot), r1v), 1/g);
  return {v1, v2, z};
}

function buildTransferOrbit(r1v, v1, mu){
  const r1=v3mag(r1v), v1m=v3mag(v1);
  const h_vec=v3cross(r1v, v1);
  const h=v3mag(h_vec);
  const vxh=v3cross(v1, h_vec);
  const r1hat=v3scale(r1v, 1/r1);
  const e_vec=v3sub(v3scale(vxh, 1/mu), r1hat);
  const e=v3mag(e_vec);
  const energy=v1m*v1m/2 - mu/r1;
  const a=-mu/(2*energy);
  const p=a*(1-e*e);
  const p_hat=e>1e-10 ? v3scale(e_vec, 1/e) : r1hat;
  const w_hat=v3scale(h_vec, 1/h);
  const q_hat=v3cross(w_hat, p_hat);
  const cosNu0=v3dot(r1hat, p_hat), sinNu0=v3dot(r1hat, q_hat);
  const nu0=Math.atan2(sinNu0, cosNu0);
  const E0=2*Math.atan2(Math.sqrt(Math.max(0,1-e))*Math.sin(nu0/2),
                        Math.sqrt(1+e)*Math.cos(nu0/2));
  const M0=E0 - e*Math.sin(E0);
  const n=Math.sqrt(mu/(a*a*a));
  return { a, e, p, p_hat, q_hat, w_hat, M0, n };
}

function propagateOrbit(orb, dt){
  const M=orb.M0 + orb.n*dt;
  const E=solveKepler(M, orb.e);
  const cosNu=(Math.cos(E)-orb.e)/(1-orb.e*Math.cos(E));
  const sinNu=Math.sqrt(1-orb.e*orb.e)*Math.sin(E)/(1-orb.e*Math.cos(E));
  const nu=Math.atan2(sinNu, cosNu);
  const r=orb.p/(1+orb.e*Math.cos(nu));
  return v3add(v3scale(orb.p_hat, r*Math.cos(nu)),
               v3scale(orb.q_hat, r*Math.sin(nu)));
}

// -------------------- HELPERS --------------------
const dateToSimTime = d => (d.getTime() - J2000) / 1000;
const fmtDate = t => new Date(J2000 + t*1000).toISOString().slice(0,10);

function heliocentricDistanceAU(body, simTime) {
  const p = getBodyPosition3D(body, simTime);
  return Math.sqrt(p.x*p.x + p.y*p.y + p.z*p.z);
}

// =============================================================
// TESTS
// =============================================================
console.log('='.repeat(68));
console.log(' SOLAR SYSTEM NAVIGATOR — TRIP PLANNING ACCURACY TEST');
console.log('='.repeat(68));

const BODIES_REAL = makeBodies(1);     // real orbital plane
const BODIES_VIS  = makeBodies(8);     // scene's visual tilt

// ---- TEST 1: heliocentric distance at J2000 ----
console.log('\n[1] Heliocentric distance at J2000 (should match each body.a closely):');
for (const name of ['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune']) {
  const b = BODIES_REAL[name];
  const r = heliocentricDistanceAU(b, 0);
  console.log(`   ${name.padEnd(8)} r = ${r.toFixed(4)} AU   (a = ${b.a.toFixed(4)})`);
}

// ---- TEST 2: heliocentric distances on 2026-04-23 vs JPL Horizons refs ----
// Reference values from JPL Horizons (heliocentric, ecliptic), approx:
//   Mercury ~ 0.33–0.47 AU (varies)
//   Venus   ~ 0.72 AU (near circular)
//   Earth   ~ 1.00 AU
//   Mars    ~ 1.60 AU (2026-04 is near aphelion side)
//   Jupiter ~ 5.25 AU
// We only check order of magnitude / sensible range.
const t_2026_04_23 = dateToSimTime(new Date(Date.UTC(2026,3,23,0,47,0)));
console.log('\n[2] Heliocentric distance on 2026-04-23 (vs reasonable ranges):');
const expected = {
  Mercury: [0.307, 0.467],
  Venus:   [0.718, 0.728],
  Earth:   [0.983, 1.017],
  Mars:    [1.38, 1.67],
  Jupiter: [4.95, 5.45],
  Saturn:  [9.0, 10.1],
  Uranus:  [18.3, 20.1],
  Neptune: [29.8, 30.3],
};
for (const name of Object.keys(expected)) {
  const r = heliocentricDistanceAU(BODIES_REAL[name], t_2026_04_23);
  const [lo,hi] = expected[name];
  const ok = r>=lo && r<=hi;
  console.log(`   ${name.padEnd(8)} r = ${r.toFixed(4)} AU   [${lo}–${hi}]  ${ok?'OK':'OUT OF RANGE'}`);
}

// ---- TEST 3: Hohmann transfer time & Δv vs textbook values ----
console.log('\n[3] Hohmann transfer — textbook values:');
// Textbook: Earth→Mars Hohmann
//   Transit ~ 258.8 days ≈ 0.709 yr
//   Δv1 ≈ 2.945 km/s, Δv2 ≈ 2.649 km/s, total ≈ 5.594 km/s
// Earth→Venus Hohmann
//   Transit ~ 146.1 days
//   Total Δv ≈ 5.20 km/s
// Earth→Jupiter Hohmann
//   Transit ~ 2.73 yr = 997 days
//   Total Δv ≈ 14.44 km/s
const cases = [
  ['Earth','Mars',    258.8, 5.594],
  ['Earth','Venus',   146.1, 5.20],
  ['Earth','Jupiter', 997.0, 14.44],
  ['Earth','Saturn',  2208,  15.73],
];
for (const [a,b, refDays, refDv] of cases) {
  const tr = hohmannTransfer(BODIES_REAL[a], BODIES_REAL[b], 0);
  const days = tr.transferTime/DAY;
  const dv = tr.dvTotal/1000; // km/s
  const errT = 100*Math.abs(days-refDays)/refDays;
  const errDv = 100*Math.abs(dv-refDv)/refDv;
  console.log(`   ${a}→${b.padEnd(8)} transit=${days.toFixed(1)}d (ref ${refDays.toFixed(1)}d, err ${errT.toFixed(2)}%)`
              + `   Δv=${dv.toFixed(3)} km/s (ref ${refDv.toFixed(3)}, err ${errDv.toFixed(2)}%)`);
}

// ---- TEST 4: Lambert solver — does the arc actually reach the destination? ----
console.log('\n[4] Lambert solver (REAL inclinations) — Earth→Mars 2026-04-23:');
{
  const earth = BODIES_REAL.Earth, mars = BODIES_REAL.Mars;
  const dep = t_2026_04_23;
  const tr = hohmannTransfer(earth, mars, dep);
  // Mirror exactly how the app builds r1v, r2v (uses dep.y/z swap via scene coords)
  const d = getBodyPosition3D(earth, dep);
  const a = getBodyPosition3D(mars, tr.arrivalSimTime);
  const r1v = [d.x*AU, d.y*AU, d.z*AU];
  const r2v = [a.x*AU, a.y*AU, a.z*AU];
  const sol = solveLambert(r1v, r2v, tr.transferTime, MU_SUN);
  if (!sol) { console.log('   LAMBERT FAILED'); }
  else {
    const orbit = buildTransferOrbit(r1v, sol.v1, MU_SUN);
    const finalPos = propagateOrbit(orbit, tr.transferTime);
    const miss = v3mag(v3sub(finalPos, r2v));
    const v1mag = v3mag(sol.v1);
    const v2mag = v3mag(sol.v2);
    // Earth orbital speed at r=1 AU
    const vEarth = Math.sqrt(MU_SUN / (1.0*AU));
    const vMars  = Math.sqrt(MU_SUN / (1.524*AU));
    const dv1 = Math.abs(v1mag - vEarth);
    const dv2 = Math.abs(v2mag - vMars);
    console.log(`   transit  ${ (tr.transferTime/DAY).toFixed(1) } days`);
    console.log(`   a        ${ (orbit.a/AU).toFixed(4) } AU   e ${ orbit.e.toFixed(4) }`);
    console.log(`   v1       ${ (v1mag/1000).toFixed(3) } km/s   (Earth circular ${ (vEarth/1000).toFixed(3) })`);
    console.log(`   v2       ${ (v2mag/1000).toFixed(3) } km/s   (Mars circular ${ (vMars/1000).toFixed(3) })`);
    console.log(`   Δv1      ${ (dv1/1000).toFixed(3) } km/s`);
    console.log(`   Δv2      ${ (dv2/1000).toFixed(3) } km/s`);
    console.log(`   total Δv ${ ((dv1+dv2)/1000).toFixed(3) } km/s   (Hohmann ref 5.594)`);
    console.log(`   MISS at arrival: ${ (miss/1000).toFixed(1) } km    (destination = planet Mars)`);
    console.log(`   (Mars radius ≈ 3390 km — miss < few km means the arc actually meets the planet)`);
  }
}

// ---- TEST 5: Lambert with APP's exaggerated inclinations ----
// This is what the app actually does.
console.log('\n[5] Lambert solver (APP\'s ×8 exaggerated inclinations) — Earth→Mars 2026-04-23:');
{
  const earth = BODIES_VIS.Earth, mars = BODIES_VIS.Mars;
  const dep = t_2026_04_23;
  const tr = hohmannTransfer(earth, mars, dep);
  const d = getBodyPosition3D(earth, dep);
  const a = getBodyPosition3D(mars, tr.arrivalSimTime);
  const r1v = [d.x*AU, d.y*AU, d.z*AU];
  const r2v = [a.x*AU, a.y*AU, a.z*AU];
  const sol = solveLambert(r1v, r2v, tr.transferTime, MU_SUN);
  if (!sol) { console.log('   LAMBERT FAILED'); }
  else {
    const orbit = buildTransferOrbit(r1v, sol.v1, MU_SUN);
    const finalPos = propagateOrbit(orbit, tr.transferTime);
    const miss = v3mag(v3sub(finalPos, r2v));
    const v1mag = v3mag(sol.v1);
    const v2mag = v3mag(sol.v2);
    const vEarth = Math.sqrt(MU_SUN / (1.0*AU));
    const vMars  = Math.sqrt(MU_SUN / (1.524*AU));
    const dv1 = Math.abs(v1mag - vEarth);
    const dv2 = Math.abs(v2mag - vMars);
    console.log(`   transit  ${ (tr.transferTime/DAY).toFixed(1) } days`);
    console.log(`   a        ${ (orbit.a/AU).toFixed(4) } AU   e ${ orbit.e.toFixed(4) }`);
    console.log(`   total Δv ${ ((dv1+dv2)/1000).toFixed(3) } km/s`);
    console.log(`   MISS at arrival: ${ (miss/1000).toFixed(1) } km`);
    console.log(`   NOTE: exaggerated inclinations inflate required plane-change Δv`);
  }
}

// ---- TEST 6: Lambert convergence across many routes/dates ----
console.log('\n[6] Lambert convergence sweep (real inclinations, monthly departures 2026-2028):');
const pairs = [
  ['Earth','Mars'], ['Earth','Venus'], ['Earth','Jupiter'],
  ['Earth','Mercury'], ['Mars','Jupiter']
];
for (const [a,b] of pairs) {
  let ok=0, fail=0;
  for (let yr=2026; yr<=2028; yr++){
    for (let mo=0; mo<12; mo++){
      const t = dateToSimTime(new Date(Date.UTC(yr, mo, 1)));
      const tr = hohmannTransfer(BODIES_REAL[a], BODIES_REAL[b], t);
      const d = getBodyPosition3D(BODIES_REAL[a], t);
      const ar = getBodyPosition3D(BODIES_REAL[b], tr.arrivalSimTime);
      const r1v=[d.x*AU,d.y*AU,d.z*AU], r2v=[ar.x*AU,ar.y*AU,ar.z*AU];
      const sol = solveLambert(r1v, r2v, tr.transferTime, MU_SUN);
      if (!sol) { fail++; continue; }
      const orb = buildTransferOrbit(r1v, sol.v1, MU_SUN);
      const fin = propagateOrbit(orb, tr.transferTime);
      const miss = v3mag(v3sub(fin, r2v));
      if (miss > 1e7) fail++; else ok++;  // >10 000 km is a bad hit
    }
  }
  console.log(`   ${a}→${b.padEnd(8)} ${ok}/${ok+fail} converged & hit within 10 000 km`);
}

// ---- TEST 7: Simulated mission arrival check ----
// The mission visual interpolates via propagateOrbit(orbit, elapsed).
// Compare final ship position to Mars position at arrival time.
console.log('\n[7] Mission visual — ship position at arrival vs Mars (real inclinations):');
{
  const earth=BODIES_REAL.Earth, mars=BODIES_REAL.Mars;
  const dep = t_2026_04_23;
  const tr = hohmannTransfer(earth, mars, dep);
  const d = getBodyPosition3D(earth, dep);
  const a = getBodyPosition3D(mars, tr.arrivalSimTime);
  const r1v=[d.x*AU,d.y*AU,d.z*AU], r2v=[a.x*AU,a.y*AU,a.z*AU];
  const sol = solveLambert(r1v, r2v, tr.transferTime, MU_SUN);
  const orbit = buildTransferOrbit(r1v, sol.v1, MU_SUN);
  // Ship 80% progress
  for (const p of [0.1, 0.25, 0.5, 0.75, 0.9, 1.0]){
    const elapsed = p * tr.transferTime;
    const ship = propagateOrbit(orbit, elapsed);
    // Where is Mars at that moment?
    const marsThen = getBodyPosition3D(mars, dep + elapsed);
    const marsV = [marsThen.x*AU, marsThen.y*AU, marsThen.z*AU];
    const dist = v3mag(v3sub(ship, marsV))/AU;
    const rShip = v3mag(ship)/AU;
    console.log(`   progress ${ (p*100).toFixed(0).padStart(3) }%   r_ship=${rShip.toFixed(3)} AU   dist_to_Mars=${dist.toFixed(4)} AU`);
  }
}

console.log('\n' + '='.repeat(68));
console.log(' DONE.');
console.log('='.repeat(68));
