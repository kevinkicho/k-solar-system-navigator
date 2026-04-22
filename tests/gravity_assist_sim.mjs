// Simulate Earth → Venus flyby → Mars and verify:
//   (a) Lambert converges on both legs
//   (b) Turning angle is feasible at Venus (not absurdly sharp)
//   (c) Total Δv is plausible (roughly Earth-Mars direct minus the V∞ boost)
const G=6.67430e-11, AU=1.495978707e11, DAY=86400, PI=Math.PI, TWO_PI=2*PI, DEG=PI/180;
const J2000=Date.UTC(2000,0,1,12,0,0);
const MU=G*1.98892e30;

const T = {
  Venus:{a:0.72333566,e:0.00677672,I:3.39467605,L0:181.97909950,wBar:131.60246718,omega:76.67984255,period:224.701*DAY,mass:4.8675e24,radius:6.0518e6},
  Earth:{a:1.00000261,e:0.01671123,I:-0.00001531,L0:100.46457166,wBar:102.93768193,omega:0.0,period:365.256*DAY,mass:5.97237e24,radius:6.371e6},
  Mars:{a:1.52371034,e:0.09339410,I:1.84969142,L0:355.44656806,wBar:336.05637041,omega:49.55953891,period:686.980*DAY,mass:6.4171e23,radius:3.3895e6},
  Jupiter:{a:5.20288700,e:0.04838624,I:1.30439695,L0:34.39644051,wBar:14.72847983,omega:100.47390909,period:4332.589*DAY,mass:1.8982e27,radius:6.9911e7},
};
function body(name){const b={...T[name]};b.I=b.I*DEG;b.L0*=DEG;b.wBar*=DEG;b.omega*=DEG;b.name=name;return b;}
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
function vel3(b,t){const dt=60, pa=pos3(b,t-dt), pb=pos3(b,t+dt); return [(pb.x-pa.x)/120*AU,(pb.y-pa.y)/120*AU,(pb.z-pa.z)/120*AU];}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const mag=a=>Math.sqrt(dot(a,a));
const scl=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
function stumpffC(z){if(Math.abs(z)<1e-8)return 1/2-z/24+z*z/720;if(z>0)return (1-Math.cos(Math.sqrt(z)))/z;return (Math.cosh(Math.sqrt(-z))-1)/(-z);}
function stumpffS(z){if(Math.abs(z)<1e-8)return 1/6-z/120+z*z/5040;if(z>0){const s=Math.sqrt(z);return (s-Math.sin(s))/(z*s);}const s=Math.sqrt(-z);return (Math.sinh(s)-s)/((-z)*s);}
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
  return {v1,v2};
}
function gaInfo(planet, vInfIn, vInfOut){
  const mu_p = G * planet.mass;
  const minR = planet.radius * 1.1;
  const magIn = mag(vInfIn), magOut = mag(vInfOut);
  const magAvg = 0.5*(magIn+magOut);
  const cosDelta = Math.max(-1,Math.min(1, dot(vInfIn,vInfOut)/(magIn*magOut)));
  const delta = Math.acos(cosDelta);
  const sinHalf = Math.sin(delta/2);
  const rP = sinHalf > 1e-6 ? mu_p/(magAvg*magAvg)*(1/sinHalf-1) : Infinity;
  const eMin = 1 + minR*magAvg*magAvg/mu_p;
  const deltaMax = 2*Math.asin(1/eMin);
  return { magIn, magOut, delta, rP, minR, deltaMax, achievable: rP>=minR, dvFlyby: Math.abs(magOut-magIn) };
}
const toSim=d=>(d.getTime()-J2000)/1000;
const fmt=t=>new Date(J2000+t*1000).toISOString().slice(0,10);

function runRoute(name, waypoints){
  console.log(`\n=== ${name} ===`);
  const legs = [];
  for (let i=0; i<waypoints.length-1; i++){
    const a=waypoints[i], b=waypoints[i+1];
    const pA=pos3(a.body, a.t), pB=pos3(b.body, b.t);
    const r1=[pA.x*AU,pA.y*AU,pA.z*AU], r2=[pB.x*AU,pB.y*AU,pB.z*AU];
    const tof = b.t - a.t;
    const sol = lambert(r1, r2, tof, MU);
    legs.push({ sol, tof, a, b });
  }
  let totalDv = 0;
  for (let i=0; i<waypoints.length; i++){
    const wp = waypoints[i];
    const vP = vel3(wp.body, wp.t);
    if (i===0){
      const L=legs[0]; if(!L.sol){console.log(`  leg 1 failed`); continue;}
      const dv=mag(sub(L.sol.v1, vP));
      console.log(`  Depart ${wp.body.name} ${fmt(wp.t)}   Δv = ${(dv/1000).toFixed(2)} km/s`);
      totalDv += dv;
    } else if (i===waypoints.length-1){
      const L=legs[i-1]; if(!L.sol){console.log(`  leg ${i} failed`); continue;}
      const dv=mag(sub(L.sol.v2, vP));
      console.log(`  Arrive ${wp.body.name} ${fmt(wp.t)}   Δv = ${(dv/1000).toFixed(2)} km/s`);
      totalDv += dv;
    } else {
      const Lin=legs[i-1], Lout=legs[i];
      if (!Lin.sol||!Lout.sol){console.log(`  flyby ${i} leg failed`); continue;}
      const vIn = sub(Lin.sol.v2, vP), vOut = sub(Lout.sol.v1, vP);
      const g = gaInfo(wp.body, vIn, vOut);
      console.log(`  Flyby ${wp.body.name} ${fmt(wp.t)}`);
      console.log(`       V∞ in  ${(g.magIn/1000).toFixed(2)} km/s   out ${(g.magOut/1000).toFixed(2)} km/s   Δv_powered ${(g.dvFlyby/1000).toFixed(2)}`);
      console.log(`       Turning ${(g.delta/DEG).toFixed(1)}° (max ${(g.deltaMax/DEG).toFixed(1)}°)`);
      console.log(`       Periapsis ${isFinite(g.rP)?(g.rP/1000).toFixed(0):'∞'} km (min ${ (g.minR/1000).toFixed(0) })  ${g.achievable?'OK':'TOO SHARP'}`);
      totalDv += g.dvFlyby;
    }
  }
  for (let i=0;i<legs.length;i++){
    const L=legs[i];
    console.log(`  Leg ${i+1}: ${L.a.body.name}→${L.b.body.name}  ${(L.tof/DAY).toFixed(0)} days  ${L.sol?'solved':'FAILED'}`);
  }
  console.log(`  TOTAL Δv: ${(totalDv/1000).toFixed(2)} km/s`);
}

// Venus-assist to Mars — realistic Mariner-10-ish profile
runRoute('Earth → Venus flyby → Mars',
  [
    {body: body('Earth'), t: toSim(new Date(Date.UTC(2027, 0, 10)))},
    {body: body('Venus'), t: toSim(new Date(Date.UTC(2027, 5, 15)))},
    {body: body('Mars'),  t: toSim(new Date(Date.UTC(2028, 3, 10)))},
  ]);

// Direct Earth → Mars for comparison (same dates, no flyby)
runRoute('Earth → Mars direct (same launch)',
  [
    {body: body('Earth'), t: toSim(new Date(Date.UTC(2027, 0, 10)))},
    {body: body('Mars'),  t: toSim(new Date(Date.UTC(2028, 3, 10)))},
  ]);

// Jupiter via Venus-Earth-Earth (VEEGA) — Galileo-style
runRoute('Earth → Venus → Earth → Jupiter (VEEGA-style)',
  [
    {body: body('Earth'), t: toSim(new Date(Date.UTC(2029, 9, 15)))},
    {body: body('Venus'), t: toSim(new Date(Date.UTC(2030, 3, 5)))},
    {body: body('Earth'), t: toSim(new Date(Date.UTC(2031, 0, 20)))},
    {body: body('Jupiter'),t: toSim(new Date(Date.UTC(2032, 11, 15)))},
  ]);
