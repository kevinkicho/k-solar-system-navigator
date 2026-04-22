// Re-run the accuracy tests with the NEW robust Lambert solver.
// This ports the fixed code from index.html verbatim.

const G=6.67430e-11, AU=1.495978707e11, DAY=86400, PI=Math.PI, TWO_PI=2*PI, DEG=PI/180;
const J2000=Date.UTC(2000,0,1,12,0,0);
const MU=G*1.98892e30;

const T = {
  Mercury:{a:0.38709927,e:0.20563593,I:7.00497902,L0:252.25032350,wBar:77.45779628,omega:48.33076593,period:87.969*DAY},
  Venus:{a:0.72333566,e:0.00677672,I:3.39467605,L0:181.97909950,wBar:131.60246718,omega:76.67984255,period:224.701*DAY},
  Earth:{a:1.00000261,e:0.01671123,I:-0.00001531,L0:100.46457166,wBar:102.93768193,omega:0.0,period:365.256*DAY},
  Mars:{a:1.52371034,e:0.09339410,I:1.84969142,L0:355.44656806,wBar:336.05637041,omega:49.55953891,period:686.980*DAY},
  Jupiter:{a:5.20288700,e:0.04838624,I:1.30439695,L0:34.39644051,wBar:14.72847983,omega:100.47390909,period:4332.589*DAY},
  Saturn:{a:9.53667594,e:0.05386179,I:2.48599187,L0:49.95424423,wBar:92.59887831,omega:113.66242448,period:10759.22*DAY},
};
function body(name, exag){const b={...T[name]}; b.I=b.I*DEG*exag; b.L0*=DEG; b.wBar*=DEG; b.omega*=DEG; b.name=name; return b;}
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
  return {x:r*(cosO*cosWV-sinO*sinWV*cosI), y:r*sinWV*sinI, z:r*(sinO*cosWV+cosO*sinWV*cosI)};
}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mag=a=>Math.sqrt(dot(a,a));
const scl=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
function stumpffC(z){if(Math.abs(z)<1e-8)return 1/2-z/24+z*z/720;if(z>0)return (1-Math.cos(Math.sqrt(z)))/z;return (Math.cosh(Math.sqrt(-z))-1)/(-z);}
function stumpffS(z){if(Math.abs(z)<1e-8)return 1/6-z/120+z*z/5040;if(z>0){const s=Math.sqrt(z);return (s-Math.sin(s))/(z*s);}const s=Math.sqrt(-z);return (Math.sinh(s)-s)/((-z)*s);}

// ---- NEW ROBUST LAMBERT (copy of the one now in index.html) ----
function lambert(r1v,r2v,tof,mu){
  const r1=mag(r1v),r2=mag(r2v);
  const cosDth=Math.max(-1,Math.min(1,dot(r1v,r2v)/(r1*r2)));
  const crossY=r1v[2]*r2v[0]-r1v[0]*r2v[2];
  const dtheta=crossY<0?Math.acos(cosDth):TWO_PI-Math.acos(cosDth);
  const sinDth=Math.sin(dtheta);
  if(Math.abs(1-cosDth)<1e-14) return null;
  if(Math.abs(sinDth)<1e-6) return null;
  const A=sinDth*Math.sqrt(r1*r2/(1-cosDth));
  if(Math.abs(A)<1e-10) return null;
  const sqrtMu=Math.sqrt(mu);
  const targetErr=1e-8*sqrtMu*tof;
  const F=z=>{
    const C=stumpffC(z),S=stumpffS(z);
    const sqC=Math.sqrt(Math.abs(C));
    if(sqC<1e-30) return NaN;
    const y=r1+r2+A*(z*S-1)/sqC;
    if(y<0) return NaN;
    const chi=Math.sqrt(y/C);
    return chi*chi*chi*S+A*Math.sqrt(y)-sqrtMu*tof;
  };
  let F0=F(0);
  if(isNaN(F0)){
    for(const zt of [0.1,-0.1,0.5,-0.5,1,-1]){F0=F(zt); if(!isNaN(F0))break;}
    if(isNaN(F0)) return null;
  }
  let z_lo=null,z_hi=null,F_lo,F_hi;
  {
    let zp=0.5,Fp=F(zp);
    for(let i=0;i<60;i++){
      if(!isNaN(Fp)&&Math.sign(Fp)!==Math.sign(F0)){z_lo=0;z_hi=zp;F_lo=F0;F_hi=Fp;break;}
      zp+=0.5; if(zp>39.3)break; Fp=F(zp);
    }
  }
  if(z_lo===null){
    let zn=-0.5,Fn=F(zn);
    for(let i=0;i<80;i++){
      if(!isNaN(Fn)&&Math.sign(Fn)!==Math.sign(F0)){z_lo=zn;z_hi=0;F_lo=Fn;F_hi=F0;break;}
      zn*=1.6; if(zn<-1e6)break; Fn=F(zn);
    }
  }
  if(z_lo===null) return null;
  let z=0.5*(z_lo+z_hi);
  for(let it=0;it<200;it++){
    z=0.5*(z_lo+z_hi);
    const Fz=F(z);
    if(isNaN(Fz)){z_lo=z; continue;}
    if(Math.abs(Fz)<targetErr) break;
    if(Math.sign(Fz)===Math.sign(F_lo)){z_lo=z;F_lo=Fz;} else {z_hi=z;F_hi=Fz;}
    if(z_hi-z_lo<1e-12) break;
  }
  const C=stumpffC(z),S=stumpffS(z);
  const sqC=Math.sqrt(Math.abs(C));
  if(sqC<1e-30) return null;
  const y=r1+r2+A*(z*S-1)/sqC;
  if(y<0||!isFinite(y)) return null;
  const f=1-y/r1, g=A*Math.sqrt(y/mu), gdot=1-y/r2;
  if(Math.abs(g)<1e-30) return null;
  const v1=scl(sub(r2v,scl(r1v,f)),1/g);
  const v2=scl(sub(scl(r2v,gdot),r1v),1/g);
  const vCircRef=Math.sqrt(mu/r1);
  const v1m=mag(v1), v2m=mag(v2);
  if(!isFinite(v1m)||!isFinite(v2m)) return null;
  if(v1m>50*vCircRef||v2m>50*vCircRef) return null;
  return {v1,v2};
}

function buildOrbit(r1v,v1,mu){
  const r1=mag(r1v),v1m=mag(v1);
  const h=cross(r1v,v1), hm=mag(h);
  const vxh=cross(v1,h);
  const r1hat=scl(r1v,1/r1);
  const ev=sub(scl(vxh,1/mu),r1hat), e=mag(ev);
  const energy=v1m*v1m/2-mu/r1, a=-mu/(2*energy), p=a*(1-e*e);
  const p_hat=e>1e-10?scl(ev,1/e):r1hat, w_hat=scl(h,1/hm), q_hat=cross(w_hat,p_hat);
  const cosNu0=dot(r1hat,p_hat), sinNu0=dot(r1hat,q_hat);
  const nu0=Math.atan2(sinNu0,cosNu0);
  const E0=2*Math.atan2(Math.sqrt(Math.max(0,1-e))*Math.sin(nu0/2),Math.sqrt(1+e)*Math.cos(nu0/2));
  const M0=E0-e*Math.sin(E0), n=Math.sqrt(mu/(a*a*a));
  return {a,e,p,p_hat,q_hat,w_hat,M0,n};
}
function propagate(orb,dt){
  const M=orb.M0+orb.n*dt, E=solveKepler(M,orb.e);
  const cosNu=(Math.cos(E)-orb.e)/(1-orb.e*Math.cos(E));
  const sinNu=Math.sqrt(1-orb.e*orb.e)*Math.sin(E)/(1-orb.e*Math.cos(E));
  const nu=Math.atan2(sinNu,cosNu);
  const r=orb.p/(1+orb.e*Math.cos(nu));
  return add(scl(orb.p_hat,r*Math.cos(nu)), scl(orb.q_hat,r*Math.sin(nu)));
}
function hohmannTOF(b1,b2){const aT=(b1.a+b2.a)*AU/2; return PI*Math.sqrt(aT**3/MU);}
const toSim = d => (d.getTime()-J2000)/1000;

console.log('='.repeat(70));
console.log(' VERIFY — NEW BRACKETED LAMBERT + PHYSICS/VISUAL DECOUPLING');
console.log('='.repeat(70));

// 1. The previously-broken 2026-04-23 scan
console.log('\n[1] Earth→Mars Lambert scan near 2026-04-23 (PHYSICAL, real incl):');
const eR=body('Earth',1), mR=body('Mars',1);
console.log('  hour   Δv(km/s)   miss(km)   status');
for (const h of [0, 1, 6, 12, 24, 47/60, 48, 72, 168]){
  const dep=toSim(new Date(Date.UTC(2026,3,23))) + h*3600;
  const tof=hohmannTOF(eR,mR);
  const d=pos3(eR,dep), a=pos3(mR,dep+tof);
  const r1v=[d.x*AU,d.y*AU,d.z*AU], r2v=[a.x*AU,a.y*AU,a.z*AU];
  const s=lambert(r1v,r2v,tof,MU);
  if (!s){ console.log(`  ${h.toFixed(2).padStart(5)}   FAIL     ----      lambert rejected`); continue; }
  const o=buildOrbit(r1v,s.v1,MU);
  const fin=propagate(o,tof);
  const miss=mag(sub(fin,r2v))/1000;
  const vEc=Math.sqrt(MU/(eR.a*AU)), vMc=Math.sqrt(MU/(mR.a*AU));
  const dv=(Math.abs(mag(s.v1)-vEc)+Math.abs(mag(s.v2)-vMc))/1000;
  const ok = dv<50 && miss<1000 ? 'OK' : 'BAD';
  console.log(`  ${h.toFixed(2).padStart(5)}  ${dv.toFixed(3).padStart(8)}  ${miss.toFixed(1).padStart(9)}   ${ok}`);
}

// 2. Convergence & accuracy sweep — real inclinations
console.log('\n[2] Convergence sweep (REAL inclinations, monthly 2026-2028):');
const names=['Mercury','Venus','Earth','Mars','Jupiter','Saturn'];
let totalOk=0, totalFail=0, totalBad=0;
for (const a of names) for (const b of names){ if(a===b) continue;
  const b1=body(a,1), b2=body(b,1);
  let ok=0, fail=0, bad=0;
  for (let yr=2026; yr<=2028; yr++) for (let mo=0; mo<12; mo++){
    const dep=toSim(new Date(Date.UTC(yr,mo,1)));
    const tof=hohmannTOF(b1,b2);
    const d=pos3(b1,dep), ar=pos3(b2,dep+tof);
    const r1v=[d.x*AU,d.y*AU,d.z*AU], r2v=[ar.x*AU,ar.y*AU,ar.z*AU];
    const s=lambert(r1v,r2v,tof,MU);
    if (!s){ fail++; continue; }
    const o=buildOrbit(r1v,s.v1,MU);
    const fin=propagate(o,tof);
    const miss=mag(sub(fin,r2v))/1000;
    const dv=mag(s.v1)/1000;
    if (miss>1000 || !isFinite(dv)) bad++; else ok++;
  }
  totalOk+=ok; totalFail+=fail; totalBad+=bad;
  const tot=ok+fail+bad;
  const flag = bad>0 ? ' ← BAD' : (fail/tot>0.3 ? ' ← HIGH FAIL' : '');
  console.log(`   ${a.padEnd(8)}→${b.padEnd(8)}  ok:${String(ok).padStart(2)}/${tot}  reject:${String(fail).padStart(2)}  bad:${String(bad).padStart(2)}${flag}`);
}
console.log(`   TOTAL: ok ${totalOk}, rejected ${totalFail}, bad (wrong answer) ${totalBad}`);

// 3. Same with app's ×8 inclinations (what users see)
console.log('\n[3] Convergence sweep (×8 VISUAL inclinations, monthly 2026-2028):');
let tOk=0, tFail=0, tBad=0;
for (const a of names) for (const b of names){ if(a===b) continue;
  const b1=body(a,8), b2=body(b,8);
  let ok=0, fail=0, bad=0;
  for (let yr=2026; yr<=2028; yr++) for (let mo=0; mo<12; mo++){
    const dep=toSim(new Date(Date.UTC(yr,mo,1)));
    const tof=hohmannTOF(b1,b2);
    const d=pos3(b1,dep), ar=pos3(b2,dep+tof);
    const r1v=[d.x*AU,d.y*AU,d.z*AU], r2v=[ar.x*AU,ar.y*AU,ar.z*AU];
    const s=lambert(r1v,r2v,tof,MU);
    if (!s){ fail++; continue; }
    const o=buildOrbit(r1v,s.v1,MU);
    const fin=propagate(o,tof);
    const miss=mag(sub(fin,r2v))/1000;
    const dv=mag(s.v1)/1000;
    if (miss>1000 || !isFinite(dv)) bad++; else ok++;
  }
  tOk+=ok; tFail+=fail; tBad+=bad;
}
console.log(`   TOTAL ×8: ok ${tOk}, rejected ${tFail}, bad (wrong answer) ${tBad}`);

// 4. Concrete Δv at the actual Mars launch window (Dec 2026)
console.log('\n[4] Earth→Mars 2026-12-01 departure, REAL inclinations:');
{
  const eR=body('Earth',1), mR=body('Mars',1);
  const dep=toSim(new Date(Date.UTC(2026,11,1)));
  const tof=hohmannTOF(eR,mR);
  const d=pos3(eR,dep), a=pos3(mR,dep+tof);
  const r1v=[d.x*AU,d.y*AU,d.z*AU], r2v=[a.x*AU,a.y*AU,a.z*AU];
  const s=lambert(r1v,r2v,tof,MU);
  const vEc=Math.sqrt(MU/(eR.a*AU)), vMc=Math.sqrt(MU/(mR.a*AU));
  const dv1=Math.abs(mag(s.v1)-vEc)/1000, dv2=Math.abs(mag(s.v2)-vMc)/1000;
  console.log(`   transit: ${(tof/DAY).toFixed(1)} days`);
  console.log(`   Δv1: ${dv1.toFixed(3)} km/s,  Δv2: ${dv2.toFixed(3)} km/s,  total: ${(dv1+dv2).toFixed(3)} km/s`);
  console.log(`   (textbook Hohmann ref ≈ 5.594 km/s when phasing is optimal)`);
}

console.log('\n' + '='.repeat(70));
