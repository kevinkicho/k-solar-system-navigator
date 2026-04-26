import * as THREE from 'three';
import { TWO_PI } from '../constants.js';
import { scene } from './setup.js';
import { notify } from '../ui/format.js';

// B-V color index → RGB approximation of black-body spectrum.
function bvToColor(bv) {
  const ci = Math.max(-0.4, Math.min(2.0, bv));
  let r, g, b;
  if (ci < 0.0)        { r = 0.61 + 0.39 * (ci + 0.4) / 0.4; g = 0.70 + 0.30 * (ci + 0.4) / 0.4; b = 1.0; }
  else if (ci < 0.15)  { r = 0.83 + 0.17 * ci / 0.15; g = 0.87 + 0.13 * ci / 0.15; b = 1.0; }
  else if (ci < 0.40)  { r = 1.0; g = 1.0; b = 1.0 - 0.15 * (ci - 0.15) / 0.25; }
  else if (ci < 0.80)  { r = 1.0; g = 1.0 - 0.22 * (ci - 0.40) / 0.40; b = 0.85 - 0.35 * (ci - 0.40) / 0.40; }
  else if (ci < 1.40)  { r = 1.0; g = 0.78 - 0.30 * (ci - 0.80) / 0.60; b = 0.50 - 0.30 * (ci - 0.80) / 0.60; }
  else                 { r = 1.0 - 0.15 * (ci - 1.40) / 0.60; g = 0.48 - 0.18 * (ci - 1.40) / 0.60; b = 0.20 - 0.12 * (ci - 1.40) / 0.60; }
  return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
}

function magToSize(mag) {
  const t = Math.max(0, Math.min(1, (mag + 1.5) / 8.5));
  return 1.2 * Math.pow(1 - t, 2.2) + 0.08;
}

export let starFieldPoints = null;

export async function loadStarField() {
  try {
    const resp = await fetch('hyg_v42.csv');
    const text = await resp.text();
    const lines = text.split('\n');
    const header = lines[0].split(',').map(h => h.replace(/"/g, ''));

    const iX = header.indexOf('x');
    const iY = header.indexOf('y');
    const iZ = header.indexOf('z');
    const iMag = header.indexOf('mag');
    const iCI = header.indexOf('ci');
    const iProper = header.indexOf('proper');

    const stars = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].match(/(".*?"|[^,]*)/g);
      if (!cols) continue;
      const clean = col => (col || '').replace(/^"|"$/g, '').trim();

      const x = parseFloat(clean(cols[iX]));
      const y = parseFloat(clean(cols[iY]));
      const z = parseFloat(clean(cols[iZ]));
      const mag = parseFloat(clean(cols[iMag]));
      const ci = parseFloat(clean(cols[iCI]));
      const proper = clean(cols[iProper]);

      if (isNaN(x) || isNaN(y) || isNaN(z) || isNaN(mag)) continue;
      if (mag > 7.5) continue;
      const len = Math.sqrt(x*x + y*y + z*z);
      if (len < 0.001) continue;

      stars.push({ x, y, z, mag, ci: isNaN(ci) ? 0.65 : ci, proper, len });
    }

    console.log(`Loaded ${stars.length} stars from HYG v4.2`);

    const count = stars.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const STAR_SPHERE_RADIUS = 180;

    for (let i = 0; i < count; i++) {
      const s = stars[i];
      const nx = s.x / s.len, ny = s.y / s.len, nz = s.z / s.len;
      positions[i*3]     = nx * STAR_SPHERE_RADIUS;
      positions[i*3 + 1] = nz * STAR_SPHERE_RADIUS;  // HYG z -> scene y (up)
      positions[i*3 + 2] = ny * STAR_SPHERE_RADIUS;  // HYG y -> scene z
      const [r, g, b] = bvToColor(s.ci);
      colors[i*3] = r; colors[i*3+1] = g; colors[i*3+2] = b;
      sizes[i] = magToSize(s.mag);
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (200.0 / -mvPosition.z);
          gl_PointSize = clamp(gl_PointSize, 0.5, 8.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(vColor, alpha * 0.9);
        }
      `,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    starFieldPoints = new THREE.Points(starGeo, starMaterial);
    scene.add(starFieldPoints);
    notify(`${count.toLocaleString()} REAL STARS LOADED`);
  } catch (err) {
    console.error('Failed to load star data, falling back to random stars:', err);
    const starGeo = new THREE.BufferGeometry();
    const n = 4000, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * TWO_PI;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 150 + Math.random() * 100;
      pos[i*3] = r*Math.sin(phi)*Math.cos(theta);
      pos[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
      pos[i*3+2] = r*Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xccddff, size: 0.15, sizeAttenuation: true, transparent: true, opacity: 0.8,
    })));
  }
}
