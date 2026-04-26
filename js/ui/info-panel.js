import { AU, DAY, DEG, G_CONST } from '../constants.js';
import { BODIES, SUN_DATA } from '../data/bodies.js';
import { moonsByParent } from '../data/moons.js';
import { state } from '../state.js';
import { formatDist, formatMass, formatTime, formatVelocity } from './format.js';

export function updateInfoPanel() {
  const el = document.getElementById('body-info');
  const body = state.selectedBody;
  if (!body) {
    el.innerHTML = `<div class="info-section"><h3>Select a Body</h3><div class="info-row"><span class="key">Click a planet or moon to inspect</span></div></div>`;
    return;
  }

  if (body.parent) {
    const parentBody = BODIES.find(b => b.name === body.parent);
    const parentMass = parentBody ? parentBody.mass : 0;
    const orbVel = parentMass > 0 ? Math.sqrt(G_CONST * parentMass / (body.a_km * 1000)) : 0;
    const moonCount = moonsByParent[body.parent] ? moonsByParent[body.parent].length : 0;

    el.innerHTML = `
      <div class="info-section">
        <h3 style="color:${body.color}">${body.name}</h3>
        <div class="info-row"><span class="key" style="color:${body.color};font-size:11px">${body.desc}</span></div>
        <div class="info-row"><span class="key">Parent</span><span class="val" style="color:${parentBody?.color || 'inherit'}">${body.parent} (${moonCount} satellites)</span></div>
      </div>
      <div class="info-section">
        <h3>Orbital Data</h3>
        <div class="info-row"><span class="key">Semi-major axis</span><span class="val highlight">${(body.a_km).toLocaleString()} km</span></div>
        <div class="info-row"><span class="key">Eccentricity</span><span class="val">${body.e.toFixed(6)}</span></div>
        <div class="info-row"><span class="key">Period</span><span class="val">${formatTime(body.period)}</span></div>
        <div class="info-row"><span class="key">Period (days)</span><span class="val">${(body.period / DAY).toFixed(3)} days</span></div>
        <div class="info-row"><span class="key">Inclination</span><span class="val">${body.I.toFixed(3)}&deg;</span></div>
        <div class="info-row"><span class="key">Orbital velocity</span><span class="val green">${formatVelocity(orbVel)}</span></div>
      </div>
      <div class="info-section">
        <h3>Physical Data</h3>
        <div class="info-row"><span class="key">Mass</span><span class="val">${formatMass(body.mass)}</span></div>
        <div class="info-row"><span class="key">Radius</span><span class="val">${formatDist(body.radius)}</span></div>
        <div class="info-row"><span class="key">Surface gravity</span><span class="val">${(G_CONST * body.mass / (body.radius * body.radius) / 9.81).toFixed(3)} g</span></div>
        <div class="info-row"><span class="key">Escape velocity</span><span class="val">${formatVelocity(Math.sqrt(2 * G_CONST * body.mass / body.radius))}</span></div>
      </div>`;
    return;
  }

  const pos = state.bodyPositions.get(body.name);
  const dist = pos ? pos.r * AU : 0;
  const vel = dist > 0 ? Math.sqrt(G_CONST * SUN_DATA.mass / dist) : 0;
  const moons = moonsByParent[body.name];
  const moonInfo = moons ? `<div class="info-row"><span class="key">Known satellites</span><span class="val highlight">${moons.length}</span></div>` : '';

  el.innerHTML = `
    <div class="info-section">
      <h3 style="color:${body.color}">${body.name}</h3>
      <div class="info-row"><span class="key" style="color:${body.color};font-size:11px">${body.desc}</span></div>
    </div>
    <div class="info-section">
      <h3>Orbital Data</h3>
      <div class="info-row"><span class="key">Semi-major axis</span><span class="val">${formatDist(body.a * AU)}</span></div>
      <div class="info-row"><span class="key">Semi-major (AU)</span><span class="val highlight">${body.a.toFixed(4)} AU</span></div>
      <div class="info-row"><span class="key">Eccentricity</span><span class="val">${body.e.toFixed(6)}</span></div>
      <div class="info-row"><span class="key">Period</span><span class="val">${formatTime(body.period)}</span></div>
      <div class="info-row"><span class="key">Inclination</span><span class="val">${(body.I / DEG).toFixed(3)}&deg;</span></div>
      ${moonInfo}
    </div>
    <div class="info-section">
      <h3>Current State</h3>
      <div class="info-row"><span class="key">Distance from Sun</span><span class="val highlight">${formatDist(dist)}</span></div>
      <div class="info-row"><span class="key">Distance (AU)</span><span class="val">${(dist / AU).toFixed(4)} AU</span></div>
      <div class="info-row"><span class="key">Orbital velocity</span><span class="val green">${formatVelocity(vel)}</span></div>
      <div class="info-row"><span class="key">Position X</span><span class="val">${pos ? pos.x.toFixed(4) : 0} AU</span></div>
      <div class="info-row"><span class="key">Position Y</span><span class="val">${pos ? pos.z.toFixed(4) : 0} AU</span></div>
      <div class="info-row"><span class="key">Position Z</span><span class="val">${pos ? pos.y.toFixed(4) : 0} AU</span></div>
    </div>
    <div class="info-section">
      <h3>Physical Data</h3>
      <div class="info-row"><span class="key">Mass</span><span class="val">${formatMass(body.mass)}</span></div>
      <div class="info-row"><span class="key">Radius</span><span class="val">${formatDist(body.radius)}</span></div>
      <div class="info-row"><span class="key">Surface gravity</span><span class="val">${(G_CONST * body.mass / (body.radius * body.radius) / 9.81).toFixed(2)} g</span></div>
      <div class="info-row"><span class="key">Escape velocity</span><span class="val">${formatVelocity(Math.sqrt(2 * G_CONST * body.mass / body.radius))}</span></div>
    </div>`;
}
