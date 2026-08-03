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
 * Inject next-actions strip into a host element (Results).
 * @param {HTMLElement|null} host
 */
export function renderNextActionsStrip(host) {
  if (!host) return;
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
    </div>
    <div id="ai-brief-out" class="ai-brief-out" hidden></div>
  `;

  strip.querySelector('#ai-btn-brief')?.addEventListener('click', async () => {
    const out = strip.querySelector('#ai-brief-out');
    if (!out) return;
    out.hidden = false;
    out.textContent = 'Generating brief…';
    try {
      const { generateMissionBrief } = await import('../agent/ai-core.js');
      const r = await generateMissionBrief();
      out.textContent = r.brief;
    } catch (e) {
      out.textContent = e.message || 'Brief failed — start npm start or configure App Hosting OLLAMA_API_KEY';
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
