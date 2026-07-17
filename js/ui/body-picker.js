/**
 * Origin / destination body picker — searchable list of all catalog bodies
 * (planets, satellites, dwarfs, NEOs, waypoints).
 */
import {
  listPlanets, listMoons, listDwarfs, listNeos, listWaypoints, findByIdOrName,
} from '../data/catalog.js';
import { moonsByParent } from '../data/moons.js';
import { setRouteDestination, setRouteOrigin } from './route-planner.js';

let openRole = null; // 'origin' | 'dest' | null
let rootEl = null;
let filterInput = null;
let listEl = null;

function ensureDom() {
  if (rootEl) return rootEl;
  rootEl = document.createElement('div');
  rootEl.id = 'body-picker';
  rootEl.hidden = true;
  rootEl.setAttribute('role', 'dialog');
  rootEl.setAttribute('aria-modal', 'true');
  rootEl.setAttribute('aria-label', 'Choose celestial body');
  rootEl.innerHTML = `
    <div class="bp-panel">
      <div class="bp-head">
        <div class="bp-title" id="body-picker-title">Choose body</div>
        <button type="button" class="btn-tiny bp-close" id="body-picker-close">CLOSE</button>
      </div>
      <input type="search" class="bp-search" id="body-picker-search"
        placeholder="Search planets, moons, dwarfs…" autocomplete="off" />
      <div class="bp-list" id="body-picker-list" role="listbox"></div>
      <p class="bp-hint">Tip: drag from the body list, or right-click a body in the scene / list.</p>
    </div>`;
  document.body.appendChild(rootEl);
  filterInput = rootEl.querySelector('#body-picker-search');
  listEl = rootEl.querySelector('#body-picker-list');
  rootEl.querySelector('#body-picker-close').onclick = closeBodyPicker;
  rootEl.addEventListener('click', (e) => {
    if (e.target === rootEl) closeBodyPicker();
  });
  filterInput.addEventListener('input', () => renderList(filterInput.value));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openRole) closeBodyPicker();
  });
  return rootEl;
}

function groupedBodies() {
  const groups = [];
  groups.push({ title: 'Planets', items: listPlanets() });
  // Satellites grouped by parent
  const parents = Object.keys(moonsByParent || {}).sort();
  if (parents.length) {
    const moons = listMoons();
    for (const p of parents) {
      const items = moons.filter((m) => m.parent === p);
      if (items.length) groups.push({ title: `${p} satellites`, items });
    }
  } else {
    groups.push({ title: 'Satellites', items: listMoons() });
  }
  const dwarfs = listDwarfs();
  if (dwarfs.length) groups.push({ title: 'Dwarf planets', items: dwarfs });
  const neos = listNeos();
  if (neos.length) groups.push({ title: 'NEOs / small bodies', items: neos });
  const wps = listWaypoints();
  if (wps.length) groups.push({ title: 'Waypoints', items: wps });
  return groups;
}

function renderList(query = '') {
  ensureDom();
  const q = String(query || '').trim().toLowerCase();
  const groups = groupedBodies();
  let html = '';
  let n = 0;
  for (const g of groups) {
    const items = g.items.filter((b) => {
      if (b.routeable === false) return false;
      if (!q) return true;
      const hay = `${b.name} ${b.parent || ''} ${b.kind || ''} ${b.desc || ''}`.toLowerCase();
      return hay.includes(q);
    });
    if (!items.length) continue;
    html += `<div class="bp-group-title">${g.title}</div>`;
    for (const b of items) {
      n++;
      const sub = b.parent
        ? `<span class="bp-sub">${b.parent} moon</span>`
        : `<span class="bp-sub">${b.kind || 'body'}</span>`;
      html += `
        <button type="button" class="bp-item" role="option" data-id="${b.id || b.name}" data-name="${b.name}">
          <span class="bp-dot" style="background:${b.color || '#5a7a90'}"></span>
          <span class="bp-name">${b.name}</span>
          ${sub}
        </button>`;
    }
  }
  if (!n) html = `<div class="bp-empty">No bodies match “${query}”</div>`;
  listEl.innerHTML = html;
  listEl.querySelectorAll('.bp-item').forEach((btn) => {
    btn.onclick = () => {
      const body = findByIdOrName(btn.dataset.id) || findByIdOrName(btn.dataset.name);
      if (!body) return;
      if (openRole === 'origin') setRouteOrigin(body);
      else if (openRole === 'dest') setRouteDestination(body);
      closeBodyPicker();
    };
  });
}

export function openBodyPicker(role) {
  ensureDom();
  openRole = role === 'dest' ? 'dest' : 'origin';
  const title = rootEl.querySelector('#body-picker-title');
  title.textContent = openRole === 'origin' ? 'SET ORIGIN' : 'SET DESTINATION';
  title.style.color = openRole === 'origin' ? 'var(--green)' : 'var(--amber)';
  filterInput.value = '';
  renderList('');
  rootEl.hidden = false;
  // Focus search after paint
  requestAnimationFrame(() => filterInput.focus());
}

export function closeBodyPicker() {
  if (!rootEl) return;
  rootEl.hidden = true;
  openRole = null;
}

export function wireBodyPicker() {
  ensureDom();
  const origin = document.getElementById('route-origin');
  const dest = document.getElementById('route-dest');
  function bindSlot(el, role) {
    if (!el) return;
    el.addEventListener('click', (e) => {
      if (e.target.closest('select, input, button')) return;
      openBodyPicker(role);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openBodyPicker(role);
      }
    });
    el.title = role === 'origin'
      ? 'Click to pick origin · drag a body · right-click scene/list'
      : 'Click to pick destination · drag a body · right-click scene/list';
  }
  bindSlot(origin, 'origin');
  bindSlot(dest, 'dest');
}
