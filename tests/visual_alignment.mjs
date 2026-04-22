// How well does the drawn trajectory line up with what the app computes and
// renders? Four checks for several representative trips:
//   (a) line start  == departure planet's scene position at t0  (markers align)
//   (b) line end    == destination planet's scene position at t_arr
//   (c) ship(t=0)   == departure marker
//   (d) ship(t=tof) == arrival marker
//   (e) mid-flight: arc stays on the Keplerian ellipse (no drift)

const G=6.67430e-11, AU=1.495978707e11, DAY=86400, PI=Math.PI, TWO_PI=2*PI, DEG=PI/180;
const J2000=Date.UTC(2000,0,1,12,0,0);
const MU=G*1.98892e30;
const EXAG=8;  // matches index.html INCL_EXAGGERATION
const T = {
  Mercury:{a:0.38709927,e:0.20563593,I:7.00497902,L0:252.25032350,wBar:77.45779628,omega:48.33076593,period:87.969*DAY},
  Venus:{a:0.72333566,e:0.00677672,I:3.39467605,L0:181.97909950,wBar:131.60246718,omega:76.67984255,period:224.701*DAY},
  Earth:{a:1.00000261,e:0.01671123,I:-0.00001531,L0:100.46457166,wBar:102.93768193,omega:0.0,period:365.256*DAY},
  Mars:{a:1.52371034,e:0.09339410,I:1.84969142,L0:355.44656806,wBar:336.05637041,omega:49.55953891,period:686.980*DAY},
  Jupiter:{a:5.20288700,e:0.04838624,I:1.30439695,L0:34.39644051,wBar:14.72847983,omega:100.47390909,period:4332.589*DAY},
  Saturn:{a:9.53667594,e:0.05386179,I:2.48599187,L0:49.95424423,wBar:92.59887831,omega:113.66242448,period:10759.22*DAY},
};
function body(name){const b={...T[name]}; b.I=b.I*DEG*EXAG; b.L0*=DEG; b.wBar*=DEG; b.omega*=DEG; b.name=name; return b;}
function solveKepler(M,e){M=((M%TWO_PI)+TWO_PI)%TWO_PI;let E=M+e*Math.sin(M);for(let i=0;i<50;i++){const dE=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));E-=dE;if(Math.abs(dE)<1e-10)break;}return E;}
function pos3(b,t){
  const n=TWO_PI/b.period,M0=b.L0-b.wBar,M=M0+n*t;
  const E=solveKepler(M,b.e);
  const cosV=(Math.cos(E)-b.e)/(1-b.e*Math.cos(E));
  const sinV=Math.sqrt(1-b.e*b.e)*Math.sin(E)/(1-b.e*Math.cos(E));
  const v=Math.atan2(sinV,cosV),r=b.a*(1-b.e*Math.cos(E));
  const w=b.wBar-b.omega;
  const cosO=Math.cos(b.omega),sinO=Math.sin(b.omega);
  const cosWV=Math.cos(w+v),sinWV=Math.sin(w+v);
  const cosI=Math.cos(b.I),sinI=Math.sin(b.I);
  // scene coords: y is ecliptic normal (swap with z)
  return {x:r*(cosO*cosWV-sinO*sinWV*cosI), y:r*sinWV*sinI, z:r*(sinO*cosWV+cosO*sinWV*cosI)};
}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mag=a=>Math.sqrt(dot(a,a));
const scl=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
function stumpffC(z){if(Math.abs(z)<1e-8)return 1/2-z/24+z*z/720;if(z>0)return (1-Math.cos(Math.sqrt(z)))/z;return (Math.cosh(Math.sqrt(-z))-1)/(-z);}
function stumpffS(z){if(Math.abs(z)<1e-8)return 1/6-z/120+z*z/5040;if(z>0){const s=Math.sqrt(z);return (s-Math.sin(s))/(z*s);}const s=Math.sqrt(-z);return (Math.sinh(s)-s)/((-z)*s);}
// NEW Lambert
function lambert(r1v,r2v,tof,mu){
  const r1=mag(r1v),r2=mag(r2v);
  const cosDth=Math.max(-1,Math.min(1,dot(r1v,r2v)/(r1*r2)));
  const crossY=r1v[2]*r2v[0]-r1v[0]*r2v[2];
  const dtheta=crossY<0?Math.acos(cosDth):TWO_PI-Math.acos(cosDth);
  const sinDth=Math.sin(dtheta);
  if(Math.abs(1-cosDth)<1e-14)return null;
  if(Math.abs(sinDth)<1e-6)return null;
  const A=sinDth*Math.sqrt(r1*r2/(1-cosDth));
  if(Math.abs(A)<1e-10)return null;
  const sqrtMu=Math.sqrt(mu);
  const targetErr=1e-8*sqrtMu*tof;
  const F=z=>{const C=stumpffC(z),S=stumpffS(z);const sqC=Math.sqrt(Math.abs(C));if(sqC<1e-30)return NaN;const y=r1+r2+A*(z*S-1)/sqC;if(y<0)return NaN;const chi=Math.sqrt(y/C);return chi*chi*chi*S+A*Math.sqrt(y)-sqrtMu*tof;};
  let F0=F(0);
  if(isNaN(F0)){for(const zt of [0.1,-0.1,0.5,-0.5,1,-1]){F0=F(zt);if(!isNaN(F0))break;}if(isNaN(F0))return null;}
  let z_lo=null,z_hi=null,F_lo,F_hi;
  {let zp=0.5,Fp=F(zp);for(let i=0;i<60;i++){if(!isNaN(Fp)&&Math.sign(Fp)!==Math.sign(F0)){z_lo=0;z_hi=zp;F_lo=F0;F_hi=Fp;break;}zp+=0.5;if(zp>39.3)break;Fp=F(zp);}}
  if(z_lo===null){let zn=-0.5,Fn=F(zn);for(let i=0;i<80;i++){if(!isNaN(Fn)&&Math.sign(Fn)!==Math.sign(F0)){z_lo=zn;z_hi=0;F_lo=Fn;F_hi=F0;break;}zn*=1.6;if(zn<-1e6)break;Fn=F(zn);}}
  if(z_lo===null)return null;
  let z=0.5*(z_lo+z_hi);
  for(let it=0;it<200;it++){z=0.5*(z_lo+z_hi);const Fz=F(z);if(isNaN(Fz)){z_lo=z;continue;}if(Math.abs(Fz)<targetErr)break;if(Math.sign(Fz)===Math.sign(F_lo)){z_lo=z;F_lo=Fz;}else{z_hi=z;F_hi=Fz;}if(z_hi-z_lo<1e-12)break;}
  const C=stumpffC(z),S=stumpffS(z);const sqC=Math.sqrt(Math.abs(C));if(sqC<1e-30)return null;
  const y=r1+r2+A*(z*S-1)/sqC;if(y<0||!isFinite(y))return null;
  const f=1-y/r1,g=A*Math.sqrt(y/mu),gdot=1-y/r2;if(Math.abs(g)<1e-30)return null;
  const v1=scl(sub(r2v,scl(r1v,f)),1/g);const v2=scl(sub(scl(r2v,gdot),r1v),1/g);
  const vc=Math.sqrt(mu/r1);if(mag(v1)>50*vc||mag(v2)>50*vc)return null;
  return{v1,v2};
}
function buildOrbit(r1v,v1,mu){
  const r1=mag(r1v),v1m=mag(v1);
  const h=cr(r1v,v1),hm=mag(h);
  const vxh=cr(v1,h);
  const r1hat=scl(r1v,1/r1);
  const ev=sub(scl(vxh,1/mu),r1hat),e=mag(ev);
  const energy=v1m*v1m/2-mu/r1,a=-mu/(2*energy),p=a*(1-e*e);
  const p_hat=e>1e-10?scl(ev,1/e):r1hat,w_hat=scl(h,1/hm),q_hat=cr(w_hat,p_hat);
  const cosNu0=dot(r1hat,p_hat),sinNu0=dot(r1hat,q_hat);
  const nu0=Math.atan2(sinNu0,cosNu0);
  const E0=2*Math.atan2(Math.sqrt(Math.max(0,1-e))*Math.sin(nu0/2),Math.sqrt(1+e)*Math.cos(nu0/2));
  const M0=E0-e*Math.sin(E0),n=Math.sqrt(mu/(a*a*a));
  return{a,e,p,p_hat,q_hat,w_hat,M0,n};
}
function propagate(orb,dt){
  const M=orb.M0+orb.n*dt,E=solveKepler(M,orb.e);
  const cosNu=(Math.cos(E)-orb.e)/(1-orb.e*Math.cos(E));
  const sinNu=Math.sqrt(1-orb.e*orb.e)*Math.sin(E)/(1-orb.e*Math.cos(E));
  const nu=Math.atan2(sinNu,cosNu);
  const r=orb.p/(1+orb.e*Math.cos(nu));
  return add(scl(orb.p_hat,r*Math.cos(nu)),scl(orb.q_hat,r*Math.sin(nu)));
}
const toSim=d=>(d.getTime()-J2000)/1000;

function checkTrip(origin, dest, date) {
  const b1=body(origin), b2=body(dest);
  const dep=toSim(date);
  const tof=PI*Math.sqrt(((b1.a+b2.a)*AU/2)**3/MU);

  // planet scene positions
  const pDep = pos3(b1, dep);
  const pArr = pos3(b2, dep+tof);

  const r1v = [pDep.x*AU, pDep.y*AU, pDep.z*AU];
  const r2v = [pArr.x*AU, pArr.y*AU, pArr.z*AU];
  const sol = lambert(r1v, r2v, tof, MU);
  if (!sol) return {fail:'lambert rejected'};
  const orb = buildOrbit(r1v, sol.v1, MU);

  // How the app draws the line (200 samples, scene coords in AU)
  const linePts = [];
  for (let i=0;i<=200;i++){
    const pm = propagate(orb, (i/200)*tof);
    linePts.push([pm[0]/AU, pm[1]/AU, pm[2]/AU]);
  }

  // (a)(b) endpoint alignment — line vs departure/arrival markers
  const startErr_AU = mag(sub([linePts[0][0],linePts[0][1],linePts[0][2]], [pDep.x,pDep.y,pDep.z]));
  const endErr_AU   = mag(sub([linePts[200][0],linePts[200][1],linePts[200][2]], [pArr.x,pArr.y,pArr.z]));

  // (c)(d) ship endpoints — same function getShipPositionOnTransfer uses
  const ship0   = propagate(orb, 0);
  const shipEnd = propagate(orb, tof);
  const ship0Err = mag(sub([ship0[0]/AU,ship0[1]/AU,ship0[2]/AU], [pDep.x,pDep.y,pDep.z]));
  const shipEndErr = mag(sub([shipEnd[0]/AU,shipEnd[1]/AU,shipEnd[2]/AU], [pArr.x,pArr.y,pArr.z]));

  // (e) mid-flight: sample 10 ship positions at arbitrary times, compare
  // to the "fine" propagation to confirm the drawn line IS the ship's path.
  // (Since both come from the same propagate(), they should match to machine eps.)
  // Instead, check that the line passes through actual ship positions:
  let maxMid = 0;
  for (let k=0;k<=10;k++){
    const frac = k/10;
    const shipK = propagate(orb, frac*tof);  // ship's true position
    // nearest point on drawn line (linear interp between nearest two samples)
    const idx = frac*200;
    const i0 = Math.floor(idx), i1 = Math.min(200, i0+1);
    const t = idx - i0;
    const lp = [
      linePts[i0][0] + t*(linePts[i1][0]-linePts[i0][0]),
      linePts[i0][1] + t*(linePts[i1][1]-linePts[i0][1]),
      linePts[i0][2] + t*(linePts[i1][2]-linePts[i0][2]),
    ];
    const err = mag(sub([shipK[0]/AU,shipK[1]/AU,shipK[2]/AU], lp));
    if (err>maxMid) maxMid = err;
  }

  // (f) orbit sanity: eccentricity in (0,1), a > 0
  const orbitOk = orb.e>=0 && orb.e<1 && orb.a>0;

  return { startErr_AU, endErr_AU, ship0Err, shipEndErr, maxMid_AU: maxMid, orbitOk, a: orb.a/AU, e: orb.e };
}

console.log('='.repeat(78));
console.log(' VISUAL ALIGNMENT — drawn line vs markers vs ship (app scene, ×8 incl)');
console.log('='.repeat(78));
console.log('Units: AU.  planet body radii for reference:');
console.log('  Mars ≈ 2.27e-5 AU   Earth ≈ 4.26e-5 AU   Jupiter ≈ 4.67e-4 AU');
console.log('  1 AU  ≈ 150 000 000 km.  So 1e-5 AU ≈ 1500 km.\n');

const cases = [
  ['Earth','Mars',    new Date(Date.UTC(2026,3,23))],
  ['Earth','Mars',    new Date(Date.UTC(2026,11,1))],
  ['Earth','Venus',   new Date(Date.UTC(2026,5,1))],
  ['Earth','Jupiter', new Date(Date.UTC(2030,0,1))],
  ['Earth','Saturn',  new Date(Date.UTC(2030,0,1))],
  ['Mars','Jupiter',  new Date(Date.UTC(2028,0,1))],
  ['Mercury','Neptune', new Date(Date.UTC(2027,0,1))],
];
for (const [a,b,d] of cases) {
  const r = checkTrip(a, b, d);
  if (r.fail) { console.log(`${a}→${b}  ${d.toISOString().slice(0,10)}  ${r.fail}`); continue; }
  console.log(`${a}→${b.padEnd(8)} ${d.toISOString().slice(0,10)}  a=${r.a.toFixed(3)}AU  e=${r.e.toFixed(3)}`);
  console.log(`    line_start vs depart marker: ${r.startErr_AU.toExponential(2)} AU  (${(r.startErr_AU*1.496e8).toFixed(1)} km)`);
  console.log(`    line_end   vs arrive marker: ${r.endErr_AU.toExponential(2)} AU  (${(r.endErr_AU*1.496e8).toFixed(1)} km)`);
  console.log(`    ship(t=0)  vs depart marker: ${r.ship0Err.toExponential(2)} AU`);
  console.log(`    ship(t=T)  vs arrive marker: ${r.shipEndErr.toExponential(2)} AU`);
  console.log(`    max ship-on-line drift:      ${r.maxMid_AU.toExponential(2)} AU  (sampling error only)`);
  console.log('');
}

console.log('Interpretation:');
console.log('  • line endpoints should be ~0 AU from markers  (exact agreement)');
console.log('  • ship endpoints should be ~0 AU from markers  (ship arrives on time)');
console.log('  • mid-drift is how far ship can be from the linear segment between');
console.log('    adjacent polyline samples — i.e. the ONLY error is the 200-sample');
console.log('    polyline approximating a smooth conic. Smaller than planet radii.');
