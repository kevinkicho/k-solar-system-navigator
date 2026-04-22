// Close-up diagnostic: scan many departure times near 2026-04-23 Earth→Mars
// and see where Lambert returns sane vs nonsense numbers.

const G=6.67430e-11, AU=1.495978707e11, DAY=86400, PI=Math.PI, TWO_PI=2*PI, DEG=PI/180;
const J2000=Date.UTC(2000,0,1,12,0,0);
const MU=G*1.98892e30;

function mk(name,exag){
  const tbl={
    Earth:{a:1.00000261,e:0.01671123,I:-0.00001531,L0:100.46457166,wBar:102.93768193,omega:0.0,period:365.256*DAY},
    Mars:{a:1.52371034,e:0.09339410,I:1.84969142,L0:355.44656806,wBar:336.05637041,omega:49.55953891,period:686.980*DAY},
  };
  const b={...tbl[name]}; b.I=b.I*DEG*exag; b.L0*=DEG; b.wBar*=DEG; b.omega*=DEG; return b;
}
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
const v3dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const v3cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const v3mag=a=>Math.sqrt(v3dot(a,a));
const v3s=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const v3sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
function stumpffC(z){if(Math.abs(z)<1e-8)return 1/2-z/24+z*z/720;if(z>0)return (1-Math.cos(Math.sqrt(z)))/z;return (Math.cosh(Math.sqrt(-z))-1)/(-z);}
function stumpffS(z){if(Math.abs(z)<1e-8)return 1/6-z/120+z*z/5040;if(z>0){const s=Math.sqrt(z);return (s-Math.sin(s))/(z*s);}const s=Math.sqrt(-z);return (Math.sinh(s)-s)/((-z)*s);}
function lambert(r1v,r2v,tof,mu,trace=false){
  const r1=v3mag(r1v),r2=v3mag(r2v);
  const cosDth=Math.max(-1,Math.min(1,v3dot(r1v,r2v)/(r1*r2)));
  const crossY=r1v[2]*r2v[0]-r1v[0]*r2v[2];
  const dtheta=crossY<0?Math.acos(cosDth):TWO_PI-Math.acos(cosDth);
  const sinDth=Math.sin(dtheta);
  if(Math.abs(1-cosDth)<1e-14) return null;
  const A=sinDth*Math.sqrt(r1*r2/(1-cosDth));
  if(trace) console.log(`     Δθ=${(dtheta/DEG).toFixed(3)}°  cosDθ=${cosDth.toFixed(6)}  A=${A.toExponential(3)}`);
  if(Math.abs(A)<1e-10) return null;
  const sqrtMu=Math.sqrt(mu);
  let z=0.1, it;
  for(it=0;it<400;it++){
    let C=stumpffC(z),S=stumpffS(z);let sqC=Math.sqrt(Math.abs(C));if(sqC<1e-30)sqC=1e-30;
    let y=r1+r2+A*(z*S-1)/sqC;if(y<0){z=Math.abs(z)+0.5;continue;}
    const chi=Math.sqrt(y/C);
    const F=chi**3*S+A*Math.sqrt(y)-sqrtMu*tof;
    const eps=1e-7*(1+Math.abs(z));
    const C2=stumpffC(z+eps),S2=stumpffS(z+eps);let sqC2=Math.sqrt(Math.abs(C2));if(sqC2<1e-30)sqC2=1e-30;
    const y2=r1+r2+A*((z+eps)*S2-1)/sqC2;if(y2<0){z+=0.5;continue;}
    const chi2=Math.sqrt(y2/C2);
    const F2=chi2**3*S2+A*Math.sqrt(y2)-sqrtMu*tof;
    const dF=(F2-F)/eps;if(Math.abs(dF)<1e-30)break;
    const zN=z-F/dF;if(Math.abs(zN-z)<1e-10){z=zN;break;}z=zN;
  }
  const C=stumpffC(z),S=stumpffS(z);let sqC=Math.sqrt(Math.abs(C));if(sqC<1e-30)return null;
  const y=r1+r2+A*(z*S-1)/sqC;if(y<0) return null;
  const f=1-y/r1,g=A*Math.sqrt(y/mu),gdot=1-y/r2;
  const v1=v3s(v3sub(r2v,v3s(r1v,f)),1/g),v2=v3s(v3sub(v3s(r2v,gdot),r1v),1/g);
  return {v1,v2,z,iters:it, y, g};
}
const toSim=d=>(d.getTime()-J2000)/1000;

const earth=mk('Earth',8), mars=mk('Mars',8);

console.log('Earth→Mars, scanning departure times near 2026-04-23 with app inclinations (×8):');
console.log('hour  TOF(d)   Δθ(°)    z       |v1|km/s   Δv(total,km/s)   stable?');
for (let hours of [0, 1, 6, 12, 24, 47/60, 48, 72, 168]){
  const dep = toSim(new Date(Date.UTC(2026,3,23,0,0,0))) + hours*3600;
  const r1m=earth.a*AU, r2m=mars.a*AU, aT=(r1m+r2m)/2;
  const tof=PI*Math.sqrt(aT**3/MU);
  const d=pos3(earth,dep), a=pos3(mars,dep+tof);
  const r1v=[d.x*AU,d.y*AU,d.z*AU], r2v=[a.x*AU,a.y*AU,a.z*AU];
  const sol=lambert(r1v,r2v,tof,MU);
  if (!sol){ console.log(`${hours.toFixed(2).padStart(5)} ${(tof/DAY).toFixed(1).padStart(7)}   FAIL`); continue; }
  const v1=v3mag(sol.v1)/1000, v2=v3mag(sol.v2)/1000;
  const vEc=Math.sqrt(MU/(earth.a*AU))/1000, vMc=Math.sqrt(MU/(mars.a*AU))/1000;
  const dv=Math.abs(v1-vEc)+Math.abs(v2-vMc);
  const r1=v3mag(r1v),r2=v3mag(r2v);
  const cosDth=v3dot(r1v,r2v)/(r1*r2);
  const dth=Math.acos(Math.max(-1,Math.min(1,cosDth)));
  const crossY=r1v[2]*r2v[0]-r1v[0]*r2v[2];
  const Δθ=crossY<0?dth:TWO_PI-dth;
  const stable = v1<200 && v2<200 ? 'yes' : 'NO — GARBAGE';
  console.log(`${hours.toFixed(2).padStart(5)} ${(tof/DAY).toFixed(1).padStart(7)}  ${(Δθ/DEG).toFixed(3).padStart(7)}  ${sol.z.toExponential(2).padStart(10)}  ${v1.toFixed(2).padStart(9)}  ${dv.toFixed(2).padStart(12)}   ${stable}`);
}

console.log('\nNow with REAL inclinations (×1):');
const earthR=mk('Earth',1), marsR=mk('Mars',1);
console.log('hour  TOF(d)   Δθ(°)    z       |v1|km/s   Δv(total,km/s)   stable?  miss(km)');
function buildOrbit(r1v,v1,mu){
  const r1=v3mag(r1v),v1m=v3mag(v1);
  const h=v3cross(r1v,v1), hm=v3mag(h);
  const vxh=v3cross(v1,h);
  const r1hat=v3s(r1v,1/r1);
  const ev=v3sub(v3s(vxh,1/mu),r1hat), e=v3mag(ev);
  const energy=v1m*v1m/2-mu/r1, a=-mu/(2*energy), p=a*(1-e*e);
  const p_hat=e>1e-10?v3s(ev,1/e):r1hat, w_hat=v3s(h,1/hm), q_hat=v3cross(w_hat,p_hat);
  const cosNu0=v3dot(r1hat,p_hat), sinNu0=v3dot(r1hat,q_hat);
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
  return [orb.p_hat[0]*r*Math.cos(nu)+orb.q_hat[0]*r*Math.sin(nu),
          orb.p_hat[1]*r*Math.cos(nu)+orb.q_hat[1]*r*Math.sin(nu),
          orb.p_hat[2]*r*Math.cos(nu)+orb.q_hat[2]*r*Math.sin(nu)];
}
for (let hours of [0, 1, 6, 12, 24, 47/60, 48, 72, 168]){
  const dep = toSim(new Date(Date.UTC(2026,3,23,0,0,0))) + hours*3600;
  const r1m=earthR.a*AU, r2m=marsR.a*AU, aT=(r1m+r2m)/2;
  const tof=PI*Math.sqrt(aT**3/MU);
  const d=pos3(earthR,dep), a=pos3(marsR,dep+tof);
  const r1v=[d.x*AU,d.y*AU,d.z*AU], r2v=[a.x*AU,a.y*AU,a.z*AU];
  const sol=lambert(r1v,r2v,tof,MU);
  if (!sol){ console.log(`${hours.toFixed(2).padStart(5)} FAIL`); continue; }
  const orb=buildOrbit(r1v,sol.v1,MU);
  const fin=propagate(orb,tof);
  const miss=v3mag(v3sub(fin,r2v))/1000;
  const v1=v3mag(sol.v1)/1000, v2=v3mag(sol.v2)/1000;
  const vEc=Math.sqrt(MU/(earthR.a*AU))/1000, vMc=Math.sqrt(MU/(marsR.a*AU))/1000;
  const dv=Math.abs(v1-vEc)+Math.abs(v2-vMc);
  const cosDth=v3dot(r1v,r2v)/(v3mag(r1v)*v3mag(r2v));
  const dth=Math.acos(Math.max(-1,Math.min(1,cosDth)));
  const crossY=r1v[2]*r2v[0]-r1v[0]*r2v[2];
  const Δθ=crossY<0?dth:TWO_PI-dth;
  const stable=v1<200 && v2<200?'yes':'NO';
  console.log(`${hours.toFixed(2).padStart(5)} ${(tof/DAY).toFixed(1).padStart(7)}  ${(Δθ/DEG).toFixed(3).padStart(7)}  ${sol.z.toExponential(2).padStart(10)}  ${v1.toFixed(2).padStart(9)}  ${dv.toFixed(2).padStart(12)}   ${stable}   ${miss.toFixed(0).padStart(10)}`);
}
