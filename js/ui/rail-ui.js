/**
 * Right-rail tabs (Inspect / Plan / Results) + mobile map-first chips.
 */

/** @param {'inspect'|'plan'|'results'} tab */
export function activateRailTab(tab) {
  document.querySelectorAll('.rail-tab').forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.rail-pane').forEach((p) => {
    p.hidden = p.dataset.pane !== tab;
  });
}

export function wireRailUi() {
  document.querySelectorAll('.rail-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activateRailTab(btn.dataset.tab);
      // Desktop: no sheet classes. Mobile chips stay in sync.
      syncMobileChipsFromRail(btn.dataset.tab);
    });
  });

  // Default: Plan (primary workflow). Inspect remains one click away.
  activateRailTab('plan');

  // ?debug=1 shows FPS + cursor AU readout
  try {
    if (typeof location !== 'undefined' && /[?&]debug=1(?:&|$)/.test(location.search || '')) {
      document.body.classList.add('debug-chrome');
    }
  } catch { /* */ }

  wireMobileChips();
}

function syncMobileChipsFromRail(tab) {
  const chips = document.getElementById('mobile-chips');
  if (!chips || chips.hidden) return;
  if (tab === 'plan' || tab === 'results') {
    setMobileSheet(tab);
  }
}

function setMobileSheet(sheet) {
  document.body.classList.remove('mob-sheet-bodies', 'mob-sheet-plan', 'mob-sheet-results');
  document.querySelectorAll('#mobile-chips .mob-chip').forEach((c) => {
    c.setAttribute('aria-pressed', c.dataset.sheet === sheet ? 'true' : 'false');
  });
  if (sheet === 'bodies') {
    document.body.classList.add('mob-sheet-bodies');
  } else if (sheet === 'plan') {
    document.body.classList.add('mob-sheet-plan');
    activateRailTab('plan');
  } else if (sheet === 'results') {
    document.body.classList.add('mob-sheet-results');
    activateRailTab('results');
  }
  // sheet === 'map' → all panels hidden (default)
}

function wireMobileChips() {
  const bar = document.getElementById('mobile-chips');
  if (!bar) return;
  // Show chip bar only on narrow viewports via CSS; keep element in DOM.
  bar.hidden = false;
  bar.querySelectorAll('.mob-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const sheet = chip.dataset.sheet;
      if (chip.getAttribute('aria-pressed') === 'true' && sheet !== 'map') {
        // Second tap collapses back to map
        setMobileSheet('map');
        return;
      }
      setMobileSheet(sheet);
    });
  });
}
