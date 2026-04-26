import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { TWO_PI } from '../constants.js';
import { SUN_DATA } from '../data/bodies.js';
import { scene } from './setup.js';

const sunTexCanvas = document.createElement('canvas');
sunTexCanvas.width = 512; sunTexCanvas.height = 256;
{
  const cx = sunTexCanvas.getContext('2d');
  cx.fillStyle = '#fff0c0';
  cx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 2400; i++) {
    const sx = Math.random() * 512, sy = Math.random() * 256;
    const sr = 1 + Math.random() * 4;
    const brightness = 180 + Math.floor(Math.random() * 75);
    cx.fillStyle = `rgba(${brightness},${brightness - 40},${Math.max(0, brightness - 120)},0.35)`;
    cx.beginPath(); cx.arc(sx, sy, sr, 0, TWO_PI); cx.fill();
  }
  for (let i = 0; i < 5; i++) {
    const sx = 60 + Math.random() * 390, sy = 50 + Math.random() * 156;
    const sr = 3 + Math.random() * 6;
    cx.fillStyle = 'rgba(120,60,0,0.5)';
    cx.beginPath(); cx.arc(sx, sy, sr, 0, TWO_PI); cx.fill();
  }
}
const sunTexture = new THREE.CanvasTexture(sunTexCanvas);

export const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_DATA.displayRadius, 48, 48),
  new THREE.MeshBasicMaterial({ map: sunTexture }),
);
scene.add(sunMesh);

export let sunGlowSprite;
{
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const cx = c.getContext('2d');
  const grad = cx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,240,180,1)');
  grad.addColorStop(0.15, 'rgba(255,200,80,0.6)');
  grad.addColorStop(0.4, 'rgba(255,160,40,0.15)');
  grad.addColorStop(1, 'rgba(255,120,0,0)');
  cx.fillStyle = grad; cx.fillRect(0, 0, 256, 256);
  sunGlowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9,
  }));
  sunGlowSprite.scale.set(0.6, 0.6, 1);
  scene.add(sunGlowSprite);

  const div = document.createElement('div');
  div.className = 'planet-label'; div.textContent = 'SUN'; div.style.color = '#fff4d6';
  const label = new CSS2DObject(div);
  label.position.set(SUN_DATA.displayRadius + 0.02, 0, 0);
  sunMesh.add(label);
}
