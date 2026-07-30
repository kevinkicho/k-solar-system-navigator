/**
 * Screen-space label layout for CSS2D canvas chrome.
 * After CSS2DRenderer paints, nudge or hide overlapping labels so
 * planet / moon / path / ship text does not stack unreadable.
 */

/** @typedef {{ el: HTMLElement, priority: number, kind: string, cx: number, cy: number, w: number, h: number }} LabelBox */

const MIN_GAP = 6;
const MAX_NUDGE_Y = 56;
const NUDGE_STEP = 14;

/** Kind → priority (higher wins when culling). */
const KIND_PRIORITY = {
  selected: 100,
  planet: 80,
  sun: 75,
  ship: 70,
  ghost: 55,
  spacecraft: 45,
  moon: 40,
  'path-tick': 30,
  'path-bead': 35,
  other: 10,
};

function classify(el) {
  if (!el || !el.classList) return 'other';
  if (el.classList.contains('selected')) return 'selected';
  if (el.classList.contains('ship-label')) return 'ship';
  if (el.classList.contains('ghost-label')) return 'ghost';
  if (el.classList.contains('path-bead-label')) return 'path-bead';
  if (el.classList.contains('path-tick-label')) return 'path-tick';
  const text = (el.textContent || '').trim().toUpperCase();
  if (text === 'SUN') return 'sun';
  // Spacecraft names are longer / have different styling often at 9px
  if (el.style?.fontSize === '9px' && el.classList.contains('planet-label')) {
    // moons are 8px, spacecraft 9px in our scene modules
    return 'spacecraft';
  }
  if (el.style?.fontSize === '8px') return 'moon';
  if (el.classList.contains('planet-label')) return 'planet';
  return 'other';
}

function boxesOverlap(a, b, gap = MIN_GAP) {
  return !(
    a.cx + a.w / 2 + gap < b.cx - b.w / 2
    || b.cx + b.w / 2 + gap < a.cx - a.w / 2
    || a.cy + a.h / 2 + gap < b.cy - b.h / 2
    || b.cy + b.h / 2 + gap < a.cy - a.h / 2
  );
}

/**
 * Collect on-screen CSS2D label elements under the label renderer root.
 * @returns {LabelBox[]}
 */
function collectBoxes() {
  if (typeof document === 'undefined') return [];
  // CSS2DRenderer appends a div; walk all labeled elements in document that are scene labels
  const nodes = document.querySelectorAll(
    '.planet-label, .ship-label, .path-tick-label, .path-bead-label, .ghost-label',
  );
  /** @type {LabelBox[]} */
  const boxes = [];
  for (const el of nodes) {
    if (!(el instanceof HTMLElement)) continue;
    // Hidden by three when behind camera / parent invisible
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;
    // Reset prior layout so measurement is from CSS2D placement
    el.style.marginTop = '';
    el.style.marginLeft = '';
    el.dataset.labelHidden = '';
    if (el.style.visibility === 'hidden' && el.dataset.labelLayoutHide === '1') {
      el.style.visibility = '';
      el.dataset.labelLayoutHide = '';
    }
  }
  // Second pass measure after reset
  for (const el of nodes) {
    if (!(el instanceof HTMLElement)) continue;
    const st = getComputedStyle(el);
    if (st.display === 'none' || Number(st.opacity) === 0) continue;
    // Off-screen or not rendered
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) {
      continue;
    }
    const kind = classify(el);
    boxes.push({
      el,
      kind,
      priority: KIND_PRIORITY[kind] ?? KIND_PRIORITY.other,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      w: r.width,
      h: r.height,
    });
  }
  // Stable: higher priority first
  boxes.sort((a, b) => b.priority - a.priority || a.kind.localeCompare(b.kind));
  return boxes;
}

/**
 * Resolve overlaps: nudge lower-priority labels vertically, then hide if still colliding.
 * Call **after** `labelRenderer.render`.
 */
export function resolveLabelOverlaps() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const boxes = collectBoxes();
  if (boxes.length < 2) return;

  /** @type {LabelBox[]} */
  const placed = [];

  for (const box of boxes) {
    let dy = 0;
    let dx = 0;
    let ok = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const trial = {
        ...box,
        cx: box.cx + dx,
        cy: box.cy + dy,
      };
      let hit = false;
      for (const p of placed) {
        if (boxesOverlap(trial, p)) {
          hit = true;
          break;
        }
      }
      if (!hit) {
        ok = true;
        box.cx = trial.cx;
        box.cy = trial.cy;
        break;
      }
      // Alternate up / down then slight x
      const sign = attempt % 2 === 0 ? 1 : -1;
      dy = sign * NUDGE_STEP * Math.ceil((attempt + 1) / 2);
      if (Math.abs(dy) > MAX_NUDGE_Y) {
        dx = (attempt % 2 === 0 ? 1 : -1) * 18;
        dy = sign * NUDGE_STEP;
      }
    }

    if (!ok) {
      // Cull low-priority labels rather than leave illegible stacks
      if (box.priority < KIND_PRIORITY.planet) {
        box.el.style.visibility = 'hidden';
        box.el.dataset.labelLayoutHide = '1';
        continue;
      }
      // Keep planets visible even if crowded — final small nudge
      dy = MAX_NUDGE_Y * (placed.length % 2 === 0 ? 1 : -1);
      box.cy += dy;
    }

    if (dy || dx) {
      box.el.style.marginTop = dy ? `${dy}px` : '';
      box.el.style.marginLeft = dx ? `${dx}px` : '';
    }
    placed.push(box);
  }
}

/**
 * Distance-based opacity for moons/spacecraft when camera is far (pre-render).
 * @param {import('three').Camera} camera
 * @param {Map<string, import('three').Object3D>} moonMeshes
 * @param {Map<string, HTMLElement>} moonLabelDivs
 * @param {Map<string, import('three').Object3D>} scMeshes
 * @param {Map<string, HTMLElement>} scLabelDivs
 */
export function updateLabelDistanceFade(camera, moonMeshes, moonLabelDivs, scMeshes, scLabelDivs) {
  if (!camera) return;
  const cam = camera.position;
  // Moons: show only when camera is reasonably close to the moon mesh
  if (moonMeshes && moonLabelDivs) {
    for (const [name, mesh] of moonMeshes) {
      const div = moonLabelDivs.get(name);
      if (!div || !mesh) continue;
      const d = cam.distanceTo(mesh.position);
      // Moon orbits are small in AU display units — fade beyond ~0.35
      const show = d < 0.45;
      div.style.opacity = show ? (d < 0.15 ? '0.9' : '0.55') : '0';
      div.style.visibility = show ? '' : 'hidden';
    }
  }
  if (scMeshes && scLabelDivs) {
    for (const [name, mesh] of scMeshes) {
      const div = scLabelDivs.get(name);
      if (!div || !mesh) continue;
      const d = cam.distanceTo(mesh.position);
      // Deep-space probes: hide labels when zoomed to inner system
      const show = d < 80;
      div.style.opacity = show ? (d < 25 ? '0.85' : '0.5') : '0';
      div.style.visibility = show ? '' : 'hidden';
    }
  }
}
