/**
 * Small Three.js globe for the body dossier modal.
 * Uses the same NASA-derived equirectangular maps as the main scene when available.
 */
import * as THREE from 'three';
import {
  textureUrlForBody, spinPeriodSec,
} from '../data/body-media.js';

let raf = 0;
let renderer = null;
let scene = null;
let camera = null;
let mesh = null;
let mountEl = null;
let spinSec = 86400;
let lastT = 0;

function disposePreview() {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  if (mesh) {
    mesh.geometry?.dispose?.();
    if (mesh.material) {
      mesh.material.map?.dispose?.();
      mesh.material.dispose?.();
    }
    mesh = null;
  }
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement?.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer = null;
  }
  scene = null;
  camera = null;
  mountEl = null;
}

function tick(t) {
  if (!renderer || !scene || !camera || !mesh) return;
  const dt = lastT ? (t - lastT) / 1000 : 0;
  lastT = t;
  // Slow educational spin (~1 rev per 12 s wall time, direction from sidereal sign)
  const sense = spinSec < 0 ? -1 : 1;
  mesh.rotation.y += sense * dt * (Math.PI * 2) / 12;
  renderer.render(scene, camera);
  raf = requestAnimationFrame(tick);
}

/**
 * Mount a spinning globe into `container` for `body`.
 * Call disposeBodyGlobePreview() when closing the modal.
 */
export function mountBodyGlobePreview(container, body) {
  disposePreview();
  if (!container || !body) return;

  mountEl = container;
  const w = Math.max(160, container.clientWidth || 220);
  const h = Math.max(160, container.clientHeight || 220);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
  camera.position.set(0, 0.15, 2.6);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const light = new THREE.DirectionalLight(0xffffff, 1.15);
  light.position.set(3, 1.5, 4);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x6688aa, 0.45));

  const color = new THREE.Color(body.color || '#88aacc');
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(body.emissive || '#111122'),
    emissiveIntensity: 0.2,
    roughness: 0.85,
    metalness: 0.05,
  });
  mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), mat);
  // Slight axial tilt for presence
  mesh.rotation.z = 0.25;
  scene.add(mesh);

  // Saturn-class ring sketch
  if (body.name === 'Saturn') {
    const ringGeo = new THREE.RingGeometry(1.25, 2.05, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc8b890,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.4;
    mesh.add(ring);
  }

  spinSec = spinPeriodSec(body);
  const texUrl = textureUrlForBody(body);
  if (texUrl) {
    const loader = new THREE.TextureLoader();
    loader.load(
      texUrl,
      (tex) => {
        if (!mesh) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        mesh.material.map = tex;
        mesh.material.color.setHex(0xffffff);
        mesh.material.emissiveIntensity = 0.06;
        mesh.material.needsUpdate = true;
      },
      undefined,
      () => { /* keep solid color */ },
    );
  }

  lastT = 0;
  raf = requestAnimationFrame(tick);
}

export function disposeBodyGlobePreview() {
  disposePreview();
}
