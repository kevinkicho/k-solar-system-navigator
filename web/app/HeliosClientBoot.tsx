'use client';

import { useEffect } from 'react';

const IMPORT_MAP = {
  imports: {
    three: 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/',
    'firebase/app': 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js',
    'firebase/auth': 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js',
    'firebase/firestore': 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js',
    'firebase/database': 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js',
    'firebase/storage': 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js',
  },
};

/**
 * Inject importmap + HELIOS main module once on the client.
 * Keeps physics/Three.js as the existing vanilla ESM SPA.
 */
export default function HeliosClientBoot() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('helios-importmap')) return;

    const map = document.createElement('script');
    map.id = 'helios-importmap';
    map.type = 'importmap';
    map.textContent = JSON.stringify(IMPORT_MAP);
    document.head.appendChild(map);

    const main = document.createElement('script');
    main.id = 'helios-main';
    main.type = 'module';
    main.src = '/js/main.js';
    document.body.appendChild(main);

    // Hide SSR banner once SPA chrome is up (top-bar present)
    const t = window.setInterval(() => {
      if (document.getElementById('top-bar')) {
        const b = document.querySelector('.helios-ssr-banner') as HTMLElement | null;
        if (b) b.style.display = 'none';
        window.clearInterval(t);
      }
    }, 200);
    window.setTimeout(() => window.clearInterval(t), 15000);

    return () => {
      window.clearInterval(t);
    };
  }, []);

  return null;
}
