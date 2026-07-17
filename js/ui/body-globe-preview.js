/**
 * Three.js globe for the body dossier modal — fitted to container.
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
let ro = null;
let contentRadius = 1.05;

function disposePreview() {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  if (ro) {
    try { ro.disconnect(); } catch { /* */ }
    ro = null;
  }
  if (mesh) {
    mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            m.map?.dispose?.();
            m.dispose?.();
          });
        } else {
          obj.material.map?.dispose?.();
          obj.material.dispose?.();
        }
      }
    });
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

function fitCamera() {
  if (!camera || !mountEl || !renderer) return;
  const w = Math.max(120, mountEl.clientWidth || 240);
  const h = Math.max(120, mountEl.clientHeight || 240);
  camera.aspect = w / h;
  // Frame sphere (+ rings) with margin
  const fov = camera.fov * (Math.PI / 180);
  const dist = (contentRadius * 1.25) / Math.tan(fov / 2);
  camera.position.set(0, contentRadius * 0.12, dist);
  camera.lookAt(0, 0, 0);
  camera.near = Math.max(0.01, dist / 100);
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function tick(t) {
  if (!renderer || !scene || !camera || !mesh) return;
  const dt = lastT ? (t - lastT) / 1000 : 0;
  lastT = t;
  const sense = spinSec < 0 ? -1 : 1;
  mesh.rotation.y += sense * dt * (Math.PI * 2) / 14;
  renderer.render(scene, camera);
  raf = requestAnimationFrame(tick);
}

/**
 * Mount a spinning globe into `container` for `body`.
 */
export function mountBodyGlobePreview(container, body) {
  disposePreview();
  if (!container || !body) return;

  mountEl = container;
  // Force layout size before measuring
  if (!mountEl.style.minHeight) mountEl.style.minHeight = '220px';

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(2.5, 1.2, 3.5);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x7799bb, 0.5));
  // Soft fill from left so dark limb is readable
  const fill = new THREE.DirectionalLight(0x88aacc, 0.35);
  fill.position.set(-2, 0.5, -1);
  scene.add(fill);

  const color = new THREE.Color(body.color || '#88aacc');
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(body.emissive || '#111122'),
    emissiveIntensity: 0.18,
    roughness: 0.88,
    metalness: 0.04,
  });
  mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), mat);
  mesh.rotation.z = 0.22;
  scene.add(mesh);
  contentRadius = 1.08;

  if (body.name === 'Saturn') {
    const ringGeo = new THREE.RingGeometry(1.22, 2.0, 96);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc8b890,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.35;
    mesh.add(ring);
    contentRadius = 2.05;
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
        mesh.material.emissiveIntensity = 0.05;
        mesh.material.needsUpdate = true;
      },
      undefined,
      () => { /* solid color fallback */ },
    );
  }

  fitCamera();
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => fitCamera());
    ro.observe(container);
  }
  // Second fit after layout settles
  requestAnimationFrame(() => {
    fitCamera();
    lastT = 0;
    raf = requestAnimationFrame(tick);
  });
}

export function disposeBodyGlobePreview() {
  disposePreview();
}
