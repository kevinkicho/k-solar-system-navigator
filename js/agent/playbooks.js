/**
 * Mission playbooks — named recovery / campaign ladders.
 * Stored in localStorage; optional cloud later.
 */

const STORAGE_KEY = 'helios-playbooks-v1';

/** Built-in industrial playbooks (deterministic steps — not LLM). */
export const BUILTIN_PLAYBOOKS = [
  {
    id: 'pb-unrefueled-mars',
    label: 'Unrefueled Mars cargo',
    description: 'Earth→Mars, unrefueled Starship, compute, recover margin if needed',
    steps: [
      { action: 'set_route', args: { origin: 'Earth', destination: 'Mars' } },
      { action: 'set_vehicle', args: { vehicleId: 'sh-starship', starshipArch: 'unrefueled', cargoMass_kg: 2000 } },
      { action: 'set_launch_site', args: { launchSiteId: 'cape' } },
      { action: 'compute_route', args: {} },
      { action: 'propose_gate_recovery', args: {} },
    ],
  },
  {
    id: 'pb-outer-venus',
    label: 'Outer via Venus assist seed',
    description: 'Earth→Jupiter, SUGGEST GA / itinerary seeds, not global opt',
    steps: [
      { action: 'set_route', args: { origin: 'Earth', destination: 'Jupiter' } },
      { action: 'set_vehicle', args: { vehicleId: 'sh-starship', starshipArch: 'tanker-n', cargoMass_kg: 1000 } },
      { action: 'compute_route', args: {} },
      { action: 'suggest_itineraries', args: {} },
      { action: 'suggest_ga', args: {} },
    ],
  },
  {
    id: 'pb-nogo-ladder',
    label: 'NO-GO recovery ladder',
    description: 'Propose recoveries then apply first vehicle/window fix',
    steps: [
      { action: 'get_watchdogs', args: {} },
      { action: 'propose_gate_recovery', args: {} },
      { action: 'apply_gate_recovery', args: { actionId: 'auto_first' } },
    ],
  },
  {
    id: 'pb-fidelity-product',
    label: 'Product fidelity pipeline',
    description: 'sample-DE physical path + residual dashboard',
    steps: [
      { action: 'apply_fidelity_preset', args: { presetId: 'inner-product' } },
      { action: 'get_residual_dashboard', args: {} },
      { action: 'get_watchdogs', args: {} },
    ],
  },
];

export function listPlaybooks() {
  const custom = loadCustom();
  return [...BUILTIN_PLAYBOOKS, ...custom];
}

export function getPlaybook(id) {
  return listPlaybooks().find((p) => p.id === id) || null;
}

export function saveCustomPlaybook(pb) {
  if (!pb?.id || !pb?.steps?.length) throw new Error('playbook needs id and steps');
  const custom = loadCustom().filter((p) => p.id !== pb.id);
  custom.push({
    id: pb.id,
    label: pb.label || pb.id,
    description: pb.description || '',
    steps: pb.steps,
    custom: true,
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch { /* */ }
  return pb;
}

function loadCustom() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Record a successful recovery chain for “last known good”.
 */
export function rememberRecoveryChain(chain) {
  try {
    const key = 'helios-last-recovery-chain';
    localStorage.setItem(key, JSON.stringify({
      at: new Date().toISOString(),
      chain: Array.isArray(chain) ? chain.slice(0, 12) : [],
    }));
  } catch { /* */ }
}

export function lastRecoveryChain() {
  try {
    const raw = localStorage.getItem('helios-last-recovery-chain');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
