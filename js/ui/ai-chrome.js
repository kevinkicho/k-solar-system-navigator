/**
 * Top-bar AI chip — always-visible model identity + open assistant.
 * Part of AI-at-core product surface.
 */
import {
  getSelectedModel,
  loadModelCatalog,
  FALLBACK_DEFAULT_MODEL,
} from '../agent/models.js';
import { selectModel, probeAiBackend, getMissionAiBundle } from '../agent/ai-core.js';
import { state } from '../state.js';

function ensureChip() {
  let chip = document.getElementById('ai-model-chip');
  if (chip) return chip;
  const right = document.querySelector('#top-bar .right-info')
    || document.querySelector('.right-info')
    || document.getElementById('top-bar');
  if (!right) return null;

  chip = document.createElement('button');
  chip.type = 'button';
  chip.id = 'ai-model-chip';
  chip.className = 'ai-model-chip';
  chip.setAttribute('aria-label', 'AI model — open assistant');
  chip.title = 'AI core · click to open assistant & change model';
  chip.innerHTML = `<span class="ai-chip-label">AI</span><span class="ai-chip-model" id="ai-chip-model-name">…</span>`;

  // Insert before ABOUT if present
  const about = document.getElementById('btn-about');
  if (about && about.parentNode === right) right.insertBefore(chip, about);
  else right.appendChild(chip);

  chip.addEventListener('click', () => {
    const fab = document.getElementById('helios-fab');
    if (fab) fab.click();
    else {
      import('./agent-chat.js').then((m) => m.wireAgentChat?.());
    }
  });
  return chip;
}

export function syncAiModelChip() {
  const chip = ensureChip();
  if (!chip) return;
  const name = getSelectedModel() || state.ai?.model || FALLBACK_DEFAULT_MODEL;
  const el = document.getElementById('ai-chip-model-name');
  if (el) {
    // Short display: last path segment
    const short = name.length > 22 ? `…${name.slice(-20)}` : name;
    el.textContent = short;
  }
  chip.title = `AI core · ${name} · click to open assistant`;
  chip.dataset.model = name;
}

/**
 * Wire top-bar AI chrome + backend probe badge.
 */
export function wireAiChrome() {
  ensureChip();
  syncAiModelChip();

  window.addEventListener('helios-ai-model', () => syncAiModelChip());

  // Soft probe — mark chip dim if AI backend offline
  probeAiBackend().then((p) => {
    const chip = document.getElementById('ai-model-chip');
    if (!chip) return;
    if (p.ollamaConfigured) {
      chip.classList.add('ai-online');
      chip.classList.remove('ai-offline');
    } else if (p.ok) {
      // Hosting without key: still open UI; chat will 503 with guidance
      chip.classList.add('ai-offline');
      chip.title = `${chip.title} · configure OLLAMA_API_KEY (local .env or App Hosting secret)`;
    }
  }).catch(() => {});

  // Prefetch catalog so picker is warm
  loadModelCatalog().then(() => syncAiModelChip()).catch(() => {});
}

/**
 * Inject readiness watchdogs + next-actions strip into a host element (Results).
 * @param {HTMLElement|null} host
 */
export function renderNextActionsStrip(host) {
  if (!host) return;

  // Campaign run log (if any) — subscribe once per host
  import('../agent/campaign-runner.js').then((m) => {
    m.renderCampaignLog(host);
    if (!host.dataset.aiCampaignBound) {
      host.dataset.aiCampaignBound = '1';
      m.onCampaignRunChange(() => m.renderCampaignLog(host));
    }
  }).catch(() => {});

  renderReadinessStrip(host);

  let strip = document.getElementById('ai-next-actions');
  if (!strip) {
    strip = document.createElement('div');
    strip.id = 'ai-next-actions';
    strip.className = 'ai-next-actions';
    host.appendChild(strip);
  }
  const { next } = getMissionAiBundle();
  if (!next.length) {
    strip.innerHTML = '';
    strip.hidden = true;
    // still keep readiness + campaign
    return;
  }
  strip.hidden = false;
  strip.innerHTML = `
    <div class="ai-next-title">AI NEXT · recommended actions</div>
    <ul class="ai-next-list">
      ${next.slice(0, 5).map((a) => `
        <li data-action="${a.id}" title="${escapeAttr(a.reason)}">
          <strong>${escapeHtml(a.label)}</strong>
          <span class="ai-next-why">${escapeHtml(a.reason)}</span>
        </li>`).join('')}
    </ul>
    <div class="ai-next-actions-bar">
      <button type="button" class="btn-tiny" id="ai-btn-brief">Mission brief</button>
      <button type="button" class="btn-tiny" id="ai-btn-ask">Ask AI about plan</button>
      <button type="button" class="btn-tiny" id="ai-btn-critics">Dual critics</button>
      <button type="button" class="btn-tiny" id="ai-btn-redteam">Red-team</button>
      <button type="button" class="btn-tiny" id="ai-btn-recover">Auto-recover</button>
      <button type="button" class="btn-tiny" id="ai-btn-itin">Suggest itinerary</button>
      <button type="button" class="btn-tiny" id="ai-btn-ga-coach">GA coach</button>
      <button type="button" class="btn-tiny" id="ai-btn-itin-coach">Itinerary coach</button>
    </div>
    <div id="ai-brief-out" class="ai-brief-out" hidden></div>
  `;

  const out = () => strip.querySelector('#ai-brief-out');

  strip.querySelector('#ai-btn-brief')?.addEventListener('click', async () => {
    const el = out();
    if (!el) return;
    el.hidden = false;
    el.textContent = 'Generating brief…';
    try {
      const { generateMissionBrief } = await import('../agent/ai-core.js');
      const r = await generateMissionBrief();
      el.textContent = r.brief;
    } catch (e) {
      el.textContent = e.message || 'Brief failed — configure OLLAMA_API_KEY (local or App Hosting / Functions)';
    }
  });

  strip.querySelector('#ai-btn-ask')?.addEventListener('click', () => {
    const fab = document.getElementById('helios-fab');
    if (fab) fab.click();
    const input = document.getElementById('helios-chat-input');
    if (input) {
      input.value = 'Review this plan: top risks, margin, and what I should do next.';
      input.focus();
    }
  });

  strip.querySelector('#ai-btn-critics')?.addEventListener('click', async () => {
    const el = out();
    if (!el) return;
    el.hidden = false;
    el.textContent = 'Running physics / vehicle / ops critics…';
    try {
      const { dualCriticReview } = await import('../agent/narratives.js');
      const r = await dualCriticReview();
      el.textContent = r.review;
    } catch (e) {
      el.textContent = e.message || 'Critics failed';
    }
  });

  strip.querySelector('#ai-btn-redteam')?.addEventListener('click', async () => {
    const el = out();
    if (!el) return;
    el.hidden = false;
    el.textContent = 'Red-teaming plan…';
    try {
      const { redTeamReview } = await import('../agent/narratives.js');
      const r = await redTeamReview();
      el.textContent = r.review;
    } catch (e) {
      el.textContent = e.message || 'Red-team failed';
    }
  });

  strip.querySelector('#ai-btn-recover')?.addEventListener('click', async () => {
    const el = out();
    if (!el) return;
    el.hidden = false;
    try {
      const { proposeGateRecovery, applyGateRecovery } = await import('../agent/recovery.js');
      const pack = proposeGateRecovery();
      if (!pack.proposals?.length) {
        el.textContent = 'No automatic recovery proposals (plan may already be READY).';
        return;
      }
      el.textContent = `Proposals:\n${pack.proposals.map((p) => `· ${p.id}: ${p.label}`).join('\n')}\n\nApplying first: ${pack.proposals[0].id}…`;
      const r = await applyGateRecovery(pack.proposals[0].id);
      el.textContent += `\n\nApplied ${r.applied}. Remaining fails: ${r.remaining?.fails?.length ?? '?'}`;
      renderNextActionsStrip(host);
    } catch (e) {
      el.textContent = e.message || 'Recovery failed';
    }
  });

  strip.querySelector('#ai-btn-itin')?.addEventListener('click', async () => {
    const el = out();
    if (!el) return;
    el.hidden = false;
    el.textContent = 'Building intelligent itineraries…';
    try {
      const { runItinerarySuggest } = await import('./itinerary-ui.js');
      const pack = await runItinerarySuggest();
      const n = pack?.suggestions?.length ?? 0;
      const rec = pack?.suggestions?.find((s) => s.recommended);
      el.textContent = rec
        ? `Itineraries: ${n}. Recommended: ${rec.itineraryLabel || rec.label}. Accept in the itinerary panel.`
        : `Itineraries: ${n}. Open SUGGEST ITINERARY panel to accept.`;
    } catch (e) {
      el.textContent = e.message || 'Itinerary suggest failed';
    }
  });

  strip.querySelector('#ai-btn-ga-coach')?.addEventListener('click', async () => {
    const el = out();
    if (!el) return;
    el.hidden = false;
    el.textContent = 'GA coach…';
    try {
      const { gaTourCoach } = await import('../agent/narratives.js');
      const r = await gaTourCoach();
      el.textContent = r.narrative;
    } catch (e) {
      el.textContent = e.message || 'GA coach failed — run SUGGEST GA first';
    }
  });

  strip.querySelector('#ai-btn-itin-coach')?.addEventListener('click', async () => {
    const el = out();
    if (!el) return;
    el.hidden = false;
    el.textContent = 'Itinerary coach…';
    try {
      const { itineraryCoach } = await import('../agent/narratives.js');
      const r = await itineraryCoach();
      el.textContent = r.narrative;
    } catch (e) {
      el.textContent = e.message || 'Itinerary coach failed — run SUGGEST ITINERARY first';
    }
  });
}

/**
 * Always-on readiness / fidelity / path-honesty strip.
 */
export function renderReadinessStrip(host) {
  if (!host) return;
  let strip = document.getElementById('ai-readiness-strip');
  if (!strip) {
    strip = document.createElement('div');
    strip.id = 'ai-readiness-strip';
    strip.className = 'ai-readiness-strip';
    // Prefer before next-actions
    const next = document.getElementById('ai-next-actions');
    if (next && next.parentNode === host) host.insertBefore(strip, next);
    else host.appendChild(strip);
  }

  import('../agent/watchdogs.js').then(({ runWatchdogs, applyWatchdogAction }) => {
    const wd = runWatchdogs();
    const alerts = wd.alerts || [];
    if (!alerts.length) {
      strip.hidden = true;
      strip.innerHTML = '';
      return;
    }
    strip.hidden = false;
    strip.innerHTML = `
      <div class="ai-next-title">AI READINESS · ${escapeHtml(wd.readiness)} · ${escapeHtml(wd.personality || 'industrial')}</div>
      <ul class="ai-wd-list">
        ${alerts.map((a) => `
          <li class="ai-wd-alert level-${escapeAttr(a.level || 'info')}" data-id="${escapeAttr(a.id)}">
            <strong>${escapeHtml(a.title)}</strong>
            <span class="ai-next-why">${escapeHtml(a.detail)}</span>
            ${a.action ? `<button type="button" class="btn-tiny ai-wd-act" data-type="${escapeAttr(a.action.type)}" data-value="${escapeAttr(String(a.action.value ?? ''))}">Fix</button>` : ''}
          </li>`).join('')}
      </ul>
    `;
    strip.querySelectorAll('.ai-wd-act').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const type = btn.getAttribute('data-type');
        let value = btn.getAttribute('data-value');
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (value === '') value = undefined;
        btn.disabled = true;
        try {
          await applyWatchdogAction({ type, value });
          renderNextActionsStrip(host);
        } catch (e) {
          btn.textContent = 'Failed';
        }
      });
    });
  }).catch(() => {
    strip.hidden = true;
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

// re-export for model changes from chat panel
export { selectModel };
