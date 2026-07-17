import * as THREE from 'three';
import { BODIES } from '../data/bodies.js';
import { MOONS } from '../data/moons.js';
import { state } from '../state.js';
import { moonLabels, moonOrbitLines } from '../scene/moons.js';
import { orbitLines, planetLabels } from '../scene/planets.js';
import { selectionRing } from '../scene/selection-ring.js';
import { updateInfoPanel } from './info-panel.js';
import { openBodyDossier } from './body-dossier-modal.js';

/**
 * @param {object|null} body
 * @param {{ openDossier?: boolean }} [opts] — openDossier defaults true when body set
 */
export function selectBody(body, opts = {}) {
  state.selectedBody = body;
  updateInfoPanel();
  for (const [name, div] of planetLabels) div.classList.toggle('selected', body && body.name === name);
  for (const [name, div] of moonLabels) div.classList.toggle('selected', body && body.name === name);
  for (const [name, { material }] of orbitLines) {
    if (body && body.name === name) { material.opacity = 0.6; }
    else if (state.routeOrigin && state.routeOrigin.name === name) { material.opacity = 0.5; material.color.set(0x00e676); }
    else if (state.routeDestination && state.routeDestination.name === name) { material.opacity = 0.5; material.color.set(0xff9800); }
    else { material.opacity = 0.2; const b = BODIES.find(b => b.name === name); if (b) material.color.set(new THREE.Color(b.color)); }
  }
  for (const [name, { material }] of moonOrbitLines) {
    if (body && body.name === name) { material.opacity = 0.5; }
    else if (body && body.parent && body.parent === MOONS.find(m => m.name === name)?.parent) { material.opacity = 0.15; }
    else { material.opacity = 0.1; }
  }
  if (body) {
    selectionRing.visible = true;
    const s = body.displayRadius * 1.8;
    selectionRing.scale.set(s, s, s);
    if (body.parent) {
      const container = document.getElementById(`moons-${body.parent}`);
      if (container) container.style.display = 'block';
    }
    const openDossier = opts.openDossier !== false;
    if (openDossier) openBodyDossier(body);
  } else {
    selectionRing.visible = false;
    if (state.followMode) state.followMode = false;
  }
}
