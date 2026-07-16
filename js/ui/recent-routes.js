// localStorage-backed recent routes for quick re-open.

const KEY = 'helios.recentRoutes.v1';
const MAX = 8;

export function loadRecentRoutes() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentRoute(entry) {
  if (!entry?.o || !entry?.d) return;
  const list = loadRecentRoutes().filter(
    (r) => !(r.o === entry.o && r.d === entry.d && r.dep === entry.dep),
  );
  list.unshift({
    o: entry.o,
    d: entry.d,
    dep: entry.dep || null,
    tof: entry.tof ?? null,
    label: entry.label || `${entry.o} → ${entry.d}`,
    at: Date.now(),
  });
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch { /* private mode */ }
  renderRecentRoutes();
}

export function renderRecentRoutes() {
  const el = document.getElementById('recent-routes');
  if (!el) return;
  const list = loadRecentRoutes();
  if (list.length === 0) {
    el.innerHTML = '<div class="recent-empty">No recent routes yet</div>';
    return;
  }
  el.innerHTML = list.map((r, i) => `
    <button type="button" class="recent-item" data-idx="${i}" title="${r.label}">
      ${escapeHtml(r.label)}${r.dep ? ` · ${r.dep}` : ''}
    </button>
  `).join('');

  el.querySelectorAll('.recent-item').forEach((btn) => {
    btn.onclick = async () => {
      const r = list[Number(btn.dataset.idx)];
      if (!r) return;
      const { applyPlanRequest } = await import('./share.js');
      const { parseDateUTC } = await import('./share-codec.js');
      applyPlanRequest({
        originId: r.o,
        destId: r.d,
        depDate: r.dep ? parseDateUTC(r.dep) : new Date(),
        tofDays: r.tof,
        flybys: [],
        vehicleId: 'sh-starship',
        abstractBudget_m_s: 8000,
        costBasis: 'helio',
        view: 'cinematic',
        tofIgnoredMulti: false,
      });
    };
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wireRecentRoutes() {
  renderRecentRoutes();
}
