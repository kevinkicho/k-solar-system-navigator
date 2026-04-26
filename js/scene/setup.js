import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const container = document.getElementById('renderer-container');

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

export const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
container.appendChild(labelRenderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040810);

export const camera3D = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.001, 500);
camera3D.position.set(0, 8, 12);
camera3D.lookAt(0, 0, 0);

export const controls = new OrbitControls(camera3D, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.05;
controls.maxDistance = 200;
controls.zoomSpeed = 1.2;
controls.rotateSpeed = 0.6;

export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera3D));
composer.addPass(new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.4, 0.7,
));

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera3D.aspect = w / h;
  camera3D.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  composer.setSize(w, h);
});

scene.add(new THREE.PointLight(0xfff0d0, 2.5, 300, 0.5));
scene.add(new THREE.AmbientLight(0x1a2a40, 0.4));

export const texLoader = new THREE.TextureLoader();
texLoader.crossOrigin = 'anonymous';
