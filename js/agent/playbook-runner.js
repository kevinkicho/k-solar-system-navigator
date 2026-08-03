/**
 * Execute a named playbook via onboard executeCommand (browser) or dry-run.
 */

import { getPlaybook, rememberRecoveryChain } from './playbooks.js';

/**
 * @param {string} playbookId
 * @param {{ executeFn?: (name, args) => Promise<any> }} [opts]
 */
export async function runPlaybook(playbookId, opts = {}) {
  const pb = getPlaybook(playbookId);
  if (!pb) return { ok: false, error: `unknown playbook ${playbookId}` };

  let executeFn = opts.executeFn;
  if (!executeFn) {
    try {
      const { executeCommand } = await import('./onboard.js');
      executeFn = (name, args) => executeCommand({ action: name, args });
    } catch {
      return { ok: false, error: 'executeCommand unavailable (headless?)' };
    }
  }

  const log = [];
  for (const step of pb.steps) {
    const action = step.action;
    let args = { ...(step.args || {}) };
    // Special: auto_first recovery
    if (action === 'apply_gate_recovery' && args.actionId === 'auto_first') {
      try {
        const pack = await executeFn('propose_gate_recovery', {});
        const first = pack?.proposals?.[0];
        if (!first) {
          log.push({ action, status: 'skipped', detail: 'no proposals' });
          continue;
        }
        args = { actionId: first.id };
      } catch (e) {
        log.push({ action, status: 'error', detail: e.message });
        continue;
      }
    }
    try {
      const result = await executeFn(action, args);
      log.push({ action, status: 'done', args, result: slim(result) });
    } catch (e) {
      log.push({ action, status: 'error', detail: e.message || String(e) });
    }
  }

  const chain = log.filter((x) => x.status === 'done').map((x) => x.action);
  rememberRecoveryChain(chain);

  return {
    ok: true,
    playbookId: pb.id,
    label: pb.label,
    status: log.some((x) => x.status === 'error') ? 'partial' : 'completed',
    log,
    product_class: 'preliminary-not-flight-certified',
  };
}

function slim(r) {
  if (r == null) return r;
  if (typeof r !== 'object') return r;
  try {
    return JSON.parse(JSON.stringify(r, (k, v) => {
      if (typeof v === 'string' && v.length > 200) return v.slice(0, 200) + '…';
      return v;
    }));
  } catch {
    return { ok: true };
  }
}
