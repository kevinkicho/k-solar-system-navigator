import { BODIES, findBodyByName, findRoutingBodySync } from '../data/bodies.js';
import { MOONS, moonsByParent } from '../data/moons.js';
import { state } from '../state.js';
import { notify } from './format.js';
import { selectBody } from './selection.js';

function makeDraggable(el, bodyName) {
  el.draggable = true;
  el.addEventListener('dragstart', (ev) => {
    ev.dataTransfer.setData('text/plain', bodyName);
    ev.dataTransfer.effectAllowed = 'copy';
  });
}

// route-planner can't be imported here without a cycle, so we inject these handlers.
let setRouteOrigin = null;
let setRouteDestination = null;
export function bindRouteSetters({ origin, destination }) {
  setRouteOrigin = origin;
  setRouteDestination = destination;
}

export function buildBodyList() {
  const el = document.getElementById('body-list');
  el.innerHTML = '';
  for (const body of BODIES) {
    const item = document.createElement('div');
    item.className = 'body-item'; item.dataset.name = body.name;
    item.innerHTML = `<div class="body-dot" style="color:${body.color};background:${body.color}"></div>
      <span class="body-name">${body.name}</span><span class="body-dist" id="dist-${body.name}">--</span>`;
    item.onclick = () => selectBody(body);
    item.oncontextmenu = (ev) => {
      ev.preventDefault();
      if (!setRouteOrigin || !setRouteDestination) return;
      if (!state.routeOrigin) setRouteOrigin(body);
      else if (!state.routeDestination && body !== state.routeOrigin) setRouteDestination(body);
      else { setRouteOrigin(body); setRouteDestination(null); }
    };
    makeDraggable(item, body.name);
    el.appendChild(item);

    const moons = moonsByParent[body.name];
    if (moons && moons.length > 0) {
      const moonContainer = document.createElement('div');
      moonContainer.id = `moons-${body.name}`;
      moonContainer.style.display = 'none';

      for (const moon of moons) {
        const mItem = document.createElement('div');
        mItem.className = 'moon-item'; mItem.dataset.name = moon.name;
        mItem.innerHTML = `<div class="moon-dot" style="color:${moon.color};background:${moon.color}"></div>
          <span class="moon-name">${moon.name}</span>`;
        mItem.onclick = () => selectBody(moon);
        // Right-click sets origin/destination just like planets.
        mItem.oncontextmenu = (ev) => {
          ev.preventDefault();
          if (!setRouteOrigin || !setRouteDestination) return;
          if (!state.routeOrigin) setRouteOrigin(moon);
          else if (!state.routeDestination && moon !== state.routeOrigin) setRouteDestination(moon);
          else { setRouteOrigin(moon); setRouteDestination(null); }
        };
        makeDraggable(mItem, moon.name);
        moonContainer.appendChild(mItem);
      }
      el.appendChild(moonContainer);

      const toggle = document.createElement('div');
      toggle.className = 'moon-toggle';
      toggle.textContent = `▸ ${moons.length} satellite${moons.length > 1 ? 's' : ''}`;
      toggle.onclick = () => {
        const visible = moonContainer.style.display !== 'none';
        moonContainer.style.display = visible ? 'none' : 'block';
        toggle.textContent = `${visible ? '▸' : '▾'} ${moons.length} satellite${moons.length > 1 ? 's' : ''}`;
      };
      el.insertBefore(toggle, moonContainer);
    }
  }
}

export function updateBodyList() {
  for (const body of BODIES) {
    const pos = state.bodyPositions.get(body.name);
    if (!pos) continue;
    const el = document.getElementById(`dist-${body.name}`);
    if (el) el.textContent = pos.r.toFixed(2) + ' AU';
    const item = document.querySelector(`.body-item[data-name="${body.name}"]`);
    if (item) {
      item.classList.toggle('selected', state.selectedBody === body);
      item.classList.toggle('origin-set', state.routeOrigin === body);
      item.classList.toggle('dest-set', state.routeDestination === body);
    }
  }
  for (const moon of MOONS) {
    const item = document.querySelector(`.moon-item[data-name="${moon.name}"]`);
    if (item) item.classList.toggle('selected', state.selectedBody === moon);
  }
}

export function setupRouteDropTargets() {
  const originSlot = document.getElementById('route-origin');
  const destSlot = document.getElementById('route-dest');

  function setupDropTarget(slotEl, setFn) {
    slotEl.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
      slotEl.classList.add('drag-over');
    });
    slotEl.addEventListener('dragleave', () => {
      slotEl.classList.remove('drag-over');
    });
    slotEl.addEventListener('drop', (ev) => {
      ev.preventDefault();
      slotEl.classList.remove('drag-over');
      const name = ev.dataTransfer.getData('text/plain');
      // Search planets first, then moons.
      const body = findRoutingBodySync(name, MOONS);
      if (body) setFn(body);
    });
  }

  setupDropTarget(originSlot, (b) => setRouteOrigin && setRouteOrigin(b));
  setupDropTarget(destSlot,   (b) => setRouteDestination && setRouteDestination(b));
}
