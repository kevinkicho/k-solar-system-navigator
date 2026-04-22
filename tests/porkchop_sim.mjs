// Offline port of the porkchop sweep to verify it finds the real launch windows.
const G=6.67430e-11, AU=1.495978707e11, DAY=86400, PI=Math.PI, TWO_PI=2*PI, DEG=PI/180;
const J2000=Date.UTC(2000,0,1,12,0,0);
const MU=G*1.98892e30;
const T = {
  Earth:{a:1.00000261,e:0.01671123,I:-0.00001531,L0:100.46457166,wBar:102.93768193,omega:0.0,period:365.256*DAY},
  Mars:{a:1.52371034,e:0.09339410,I:1.84969142,L0:355.44656806,wBar:336.05637041,omega:49.55953891,period:686.980*DAY},
  Venus:{a:0.72333566,e:0.00677672,I:3.39467605,L0:181.97909950,wBar:131.60246718,omega:76.67984255,period:224.701*DAY},
  Jupiter:{a:5.20288700,e:0.04838624,I:1.30439695,L0:34.39644051,wBar:14.72847983,omega:100.47390909,period:4332.589*DAY},
};
function body(name){const b={...T[name]}; b.I=b.I*DEG; b.L0*=DEG; b.wBar*=DEG; b.omega*=DEG; b.name=name; return b;}
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
  return{v1,v2};
}
const toSim=d=>(d.getTime()-J2000)/1000;
const fromSim=t=>new Date(J2000+t*1000);

function sweep(b1, b2, departStart, years){
  const GX=65, GY=52;
  const aT=(b1.a+b2.a)*AU/2;
  const hohmannTof=PI*Math.sqrt(aT**3/MU);
  const departEnd = departStart + years*365.25*DAY;
  const tofMin = Math.max(10*DAY, 0.35*hohmannTof);
  const tofMax = 2.2*hohmannTof;
  let minDv=Infinity, minDep, minTof;
  const t0=performance.now();
  let solved=0, failed=0;
  for (let iy=0; iy<GY; iy++){
    for (let ix=0; ix<GX; ix++){
      const tof=tofMin+((iy+0.5)/GY)*(tofMax-tofMin);
      const dep=departStart+((ix+0.5)/GX)*(departEnd-departStart);
      const d=pos3(b1,dep), a=pos3(b2,dep+tof);
      const s=lambert([d.x*AU,d.y*AU,d.z*AU],[a.x*AU,a.y*AU,a.z*AU], tof, MU);
      if (!s){ failed++; continue; }
      // Planet velocity via centered finite difference
      const da=pos3(b1,dep-60), db=pos3(b1,dep+60);
      const vb1=[(db.x-da.x)/120*AU,(db.y-da.y)/120*AU,(db.z-da.z)/120*AU];
      const ea=pos3(b2,dep+tof-60), eb=pos3(b2,dep+tof+60);
      const vb2=[(eb.x-ea.x)/120*AU,(eb.y-ea.y)/120*AU,(eb.z-ea.z)/120*AU];
      const dv=mag(sub(s.v1,vb1))+mag(sub(s.v2,vb2));
      if (dv<minDv){ minDv=dv; minDep=dep; minTof=tof; }
      solved++;
    }
  }
  return { ms: performance.now()-t0, solved, failed, minDv, minDep, minTof };
}

const today = toSim(new Date(Date.UTC(2026,3,22)));   // app's "today"
for (const [o,d] of [['Earth','Mars'],['Earth','Venus'],['Earth','Jupiter'],['Mars','Jupiter']]){
  const b1=body(o), b2=body(d);
  const r = sweep(b1, b2, today, 5);
  const depDate = r.minDep!==undefined ? fromSim(r.minDep).toISOString().slice(0,10) : '—';
  const arrDate = r.minDep!==undefined ? fromSim(r.minDep + r.minTof).toISOString().slice(0,10) : '—';
  console.log(`${o}→${d.padEnd(8)} min Δv=${(r.minDv/1000).toFixed(2)} km/s  depart=${depDate}  TOF=${(r.minTof/DAY).toFixed(0)}d  arrive=${arrDate}  sweep=${r.ms.toFixed(0)}ms (${r.solved} solved, ${r.failed} failed)`);
}
