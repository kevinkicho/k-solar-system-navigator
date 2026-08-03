/**
 * Campaign DAG runner — branching recovery / architecture paths.
 * Deterministic tools only; AI never invents Δv.
 */

import { state } from '../state.js';
import { runMissionCampaign } from './campaign.js';
import { proposeGateRecovery, applyGateRecovery } from './recovery.js';
import { buildArchitectureMatrix } from '../physics/architecture-matrix.js';
import { clusterWindowFamilies } from '../physics/window-families.js';
import { notify } from '../ui/format.js';

/** @type {{ id: string, nodes: object[], status: string }|null} */
let _dag = null;
const listeners = new Set();

export function getCampaignDag() {
  return _dag;
}

export function onCampaignDagChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(_dag); } catch { /* */ }
  }
  try {
    window.dispatchEvent(new CustomEvent('helios-campaign-dag', { detail: _dag }));
  } catch { /* */ }
}

function pushNode(node) {
  if (!_dag) return;
  _dag.nodes.push({ ...node, at: new Date().toISOString() });
  _dag.updated_at = new Date().toISOString();
  emit();
}

/**
 * Run branching campaign:
 * 1. Base campaign compute
 * 2. If NO-GO → branch vehicle matrix + optional recovery
 * 3. If shortlist present → window families
 * 4. Optional GA / itinerary
 *
 * @param {object} plan same as runMissionCampaign + { branches?: boolean }
 */
export async function runCampaignDag(plan = {}) {
  _dag = {
    id: `dag-${Date.now()}`,
    status: 'running',
    intent: plan.intent || null,
    nodes: [],
    started_at: new Date().toISOString(),
    product_class: 'preliminary-not-flight-certified',
  };
  emit();

  try {
    pushNode({ id: 'base', label: 'Base campaign compute', status: 'running' });
    const base = await runMissionCampaign({
      ...plan,
      compute: plan.compute !== false,
      suggestGa: false,
    });
    const ready = !!base.dossier?.mission_ready;
    pushNode({
      id: 'base',
      label: 'Base campaign compute',
      status: ready ? 'done' : 'warn',
      detail: `mission_ready=${ready} status=${base.dossier?.status}`,
      result: { triad: base.triad, steps: base.steps?.length },
    });

    // Branch A: architecture matrix on current Need
    const need = state.transferData?.dossier?.need
      || (base.triad?.need_m_s != null ? { need_dv_m_s: base.triad.need_m_s, applicable: true } : null);
    if (need) {
      pushNode({ id: 'arch', label: 'Architecture matrix branch', status: 'running' });
      const matrix = buildArchitectureMatrix(need, {
        cargoMass_kg: state.cargoMass_kg,
        originBody: state.routeOrigin,
      });
      const feasible = matrix.rows.filter((r) => r.feasible);
      pushNode({
        id: 'arch',
        label: 'Architecture matrix branch',
        status: 'done',
        detail: `${feasible.length}/${matrix.rows.length} feasible · rec=${matrix.rows.find((r) => r.recommended)?.label || '—'}`,
        result: { n_feasible: feasible.length, recommended: matrix.rows.find((r) => r.recommended)?.id },
      });
      state.architectureMatrix = matrix;
    }

    // Branch B: recovery if NO-GO
    if (!ready && plan.autoRecover !== false) {
      pushNode({ id: 'recover', label: 'NO-GO recovery branch', status: 'running' });
      const pack = proposeGateRecovery();
      if (pack.proposals?.[0]) {
        const r = await applyGateRecovery(pack.proposals[0].id);
        pushNode({
          id: 'recover',
          label: 'NO-GO recovery branch',
          status: 'done',
          detail: `applied ${r.applied}`,
          result: { remaining_fails: r.remaining?.fails?.length },
        });
      } else {
        pushNode({ id: 'recover', label: 'NO-GO recovery branch', status: 'skipped', detail: 'no proposals' });
      }
    } else if (ready) {
      pushNode({ id: 'recover', label: 'NO-GO recovery branch', status: 'skipped', detail: 'already READY' });
    }

    // Branch C: window families from shortlist
    if (state.windowShortlist?.length) {
      pushNode({ id: 'windows', label: 'Window families branch', status: 'running' });
      const fam = clusterWindowFamilies(state.windowShortlist);
      state.windowFamilies = fam;
      pushNode({
        id: 'windows',
        label: 'Window families branch',
        status: 'done',
        detail: `${fam.families.length} family(ies) · rec=${fam.families.find((f) => f.recommended)?.label || '—'}`,
      });
    } else {
      pushNode({
        id: 'windows',
        label: 'Window families branch',
        status: 'skipped',
        detail: 'no shortlist — open porkchop / windows first',
      });
    }

    // Branch D: optional itinerary / GA
    if (plan.suggestItineraries) {
      pushNode({ id: 'itin', label: 'Itinerary seeds branch', status: 'running' });
      try {
        const { runItinerarySuggest } = await import('../ui/itinerary-ui.js');
        const pack = await runItinerarySuggest();
        pushNode({
          id: 'itin',
          label: 'Itinerary seeds branch',
          status: 'done',
          detail: `n=${pack?.suggestions?.length ?? 0}`,
        });
      } catch (e) {
        pushNode({ id: 'itin', label: 'Itinerary seeds branch', status: 'error', detail: e.message });
      }
    }
    if (plan.suggestGa) {
      pushNode({ id: 'ga', label: 'GA seeds branch', status: 'running' });
      try {
        const { runGaSuggestions } = await import('../ui/ga-suggest-ui.js');
        await runGaSuggestions();
        pushNode({
          id: 'ga',
          label: 'GA seeds branch',
          status: 'done',
          detail: `n=${state.gaSuggestions?.suggestions?.length ?? 0}`,
        });
      } catch (e) {
        pushNode({ id: 'ga', label: 'GA seeds branch', status: 'error', detail: e.message });
      }
    }

    pushNode({ id: 'done', label: 'DAG complete', status: 'done' });
    _dag.status = 'completed';
    _dag.finished_at = new Date().toISOString();
    notify('CAMPAIGN DAG COMPLETE · review Studio / Results');
    emit();
    return _dag;
  } catch (e) {
    pushNode({ id: 'error', label: 'DAG failed', status: 'error', detail: e.message || String(e) });
    _dag.status = 'failed';
    emit();
    return _dag;
  }
}
