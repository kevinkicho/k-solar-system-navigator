import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { DAY, PI } from '../constants.js';
import { BODIES } from '../data/bodies.js';
import { generateOrbitPoints } from '../physics/kepler.js';
import { scene, texLoader } from './setup.js';

// Pinned commit (not @master) — solid-color materials remain if load fails.
const TEX_BASE = 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@01ca2b7/images/';

const PLANET_TEXTURES = {
  Mercury: 'mercurymap.jpg',
  Venus:   'venusmap.jpg',
  Earth:   'earthmap1k.jpg',
  Mars:    'marsmap1k.jpg',
  Jupiter: 'jupitermap.jpg',
  Saturn:  'saturnmap.jpg',
  Uranus:  'uranusmap.jpg',
  Neptune: 'neptunemap.jpg',
};

// Sidereal rotation period (seconds). Negative = retrograde (Venus, Uranus).
const PLANET_ROTATION_SEC = {
  Mercury:  5067360,
  Venus:  -20996755,
  Earth:      86164,
  Mars:       88642,
  Jupiter:    35730,
  Saturn:     38018,
  Uranus:    -62064,
  Neptune:    57996,
};

export const planetMeshes = new Map();
export const planetLabels = new Map();
export const orbitLines = new Map();
// { map, period } pairs animated each frame so equirectangular textures spin via UV offset.
export const planetTextureTargets = [];

for (const body of BODIES) {
  const group = new THREE.Group();
  scene.add(group);
  planetMeshes.set(body.name, group);

  const sphereMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(body.color),
    emissive: new THREE.Color(body.emissive),
    emissiveIntensity: 0.3, roughness: 0.9, metalness: 0.05,
  });
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(body.displayRadius, 48, 48),
    sphereMat,
  );
  group.add(sphere);

  const texFile = PLANET_TEXTURES[body.name];
  if (texFile) {
    texLoader.load(TEX_BASE + texFile,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        sphereMat.map = tex;
        sphereMat.color.setHex(0xffffff);
        sphereMat.emissiveIntensity = 0.08;
        sphereMat.needsUpdate = true;
        planetTextureTargets.push({ map: tex, period: PLANET_ROTATION_SEC[body.name] });
      },
      undefined,
      () => { /* keep solid-color fallback */ },
    );
  }

  // Soft atmosphere limb (Fresnel-ish shell) for gas giants + Earth/Mars/Venus
  if (['Earth', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(body.name)) {
    const atmoColor = body.name === 'Earth' ? 0x4fc3f7
      : body.name === 'Mars' ? 0xff8a65
        : body.name === 'Venus' ? 0xffe082
          : new THREE.Color(body.color).getHex();
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(body.displayRadius * 1.06, 32, 32),
      new THREE.MeshBasicMaterial({
        color: atmoColor,
        transparent: true,
        opacity: 0.12,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    atmo.name = 'atmosphere';
    atmo.userData.isAtmosphere = true;
    group.add(atmo);
  }

  if (body.name === 'Earth') {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55,
      depthWrite: false, roughness: 1.0, metalness: 0.0,
    });
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(body.displayRadius * 1.015, 48, 48), cloudMat);
    group.add(clouds);
    texLoader.load(TEX_BASE + 'earthcloudmap.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      cloudMat.map = tex;
      cloudMat.alphaMap = tex;
      cloudMat.needsUpdate = true;
      planetTextureTargets.push({ map: tex, period: PLANET_ROTATION_SEC.Earth * 0.9 });
    }, undefined, () => { /* keep solid-color fallback */ });

    // City lights / night side — additive emissive shell (texture when available)
    const nightMat = new THREE.MeshBasicMaterial({
      color: 0xffcc80,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const night = new THREE.Mesh(
      new THREE.SphereGeometry(body.displayRadius * 1.001, 48, 48),
      nightMat,
    );
    night.name = 'earth-night';
    group.add(night);
    // threex-planets style night lights (may 404 → keep invisible)
    texLoader.load(TEX_BASE + 'earthlights1k.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      nightMat.map = tex;
      nightMat.opacity = 0.55;
      nightMat.needsUpdate = true;
      planetTextureTargets.push({ map: tex, period: PLANET_ROTATION_SEC.Earth });
    }, undefined, () => {
      // Procedural dim night glow fallback
      nightMat.opacity = 0.08;
      nightMat.color.setHex(0x1a237e);
    });
  }

  if (body.name === 'Saturn') {
    const inner = body.displayRadius * 1.4;
    const outer = body.displayRadius * 2.3;
    const ringGeo = new THREE.RingGeometry(inner, outer, 128, 1);
    const pos = ringGeo.attributes.position;
    const uv  = ringGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    uv.needsUpdate = true;
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide,
      transparent: true, opacity: 0.9, depthWrite: false,
    });
    texLoader.load(TEX_BASE + 'saturnringcolor.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      ringMat.map = tex;
      ringMat.alphaMap = tex;
      ringMat.needsUpdate = true;
    }, undefined, () => { /* keep solid-color fallback */ });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -PI / 2.3;
    group.add(ring);
  }

  const div = document.createElement('div');
  div.className = 'planet-label';
  div.textContent = body.name.toUpperCase();
  div.style.color = body.color;
  const label = new CSS2DObject(div);
  label.position.set(body.displayRadius + 0.01, body.displayRadius * 0.5, 0);
  group.add(label);
  planetLabels.set(body.name, div);

  const orbitGeo = new THREE.BufferGeometry().setFromPoints(
    generateOrbitPoints(body).map(p => new THREE.Vector3(p.x, p.y, p.z)),
  );
  const orbitMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(body.color), transparent: true, opacity: 0.2,
  });
  const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
  scene.add(orbitLine);
  orbitLines.set(body.name, { line: orbitLine, material: orbitMat });
}

// Earth's Moon also gets a texture target — added by scene/moons.js once it loads.
export { TEX_BASE, PLANET_ROTATION_SEC, DAY };
