/**
 * Natural-language / structured mission campaign orchestrator.
 * Uses domain command bus — no button .click() automation.
 * AI never invents Δv.
 */

import { state } from '../state.js';
import { notify, dateToInputValue } from '../ui/format.js';
import { timeState } from '../ui/time-system.js';
import { getMissionAiBundle } from './ai-core.js';
import { buildMissionSnapshot } from './transfer-summary.js';
import { dispatchPlanCommand } from '../domain/plan-commands.js';
import { resolveBody } from '../domain/plan-actions.js';
import { bodyId } from '../data/catalog.js';
export { parseCampaignHint } from './campaign-parse.js';

/**
 * Run a structured campaign plan via domain commands.
 * @param {object} args
 */
export async function runMissionCampaign(args = {}) {
  const steps = [];
  const log = (step, detail) => {
    steps.push({ step, ...detail });
  };

  if (args.clearFirst) {
    const r = await dispatchPlanCommand({ type: 'CLEAR_ROUTE', source: 'campaign' });
    log('clear_route', { ok: r.ok });
  }

  // Build compact seed when we have enough route fields
  const seed = {};
  if (args.origin) {
    const b = resolveBody(args.origin);
    if (!b) throw new Error(`Unknown origin: ${args.origin}`);
    seed.o = bodyId(b) || b.name;
  }
  if (args.destination) {
    const b = resolveBody(args.destination);
    if (!b) throw new Error(`Unknown destination: ${args.destination}`);
    seed.d = bodyId(b) || b.name;
  }
  if (args.departure) {
    let d;
    const raw = args.departure;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) d = raw;
    else if (/^\d{4}$/.test(raw)) d = `${raw}-06-01`;
    else d = String(raw).slice(0, 10);
    seed.dep = d;
  }
  if (args.vehicleId) seed.veh = args.vehicleId;
  if (args.cargoMass_kg != null) seed.cargo = args.cargoMass_kg;
  if (args.starshipArch) seed.arch = args.starshipArch;
  if (args.launchSiteId) seed.site = args.launchSiteId;

  const hasSeed = !!(seed.o || seed.d || seed.dep || seed.veh);
  if (hasSeed) {
    // Partial apply: always apply seed fields; compute only if both ends set after
    const r = await dispatchPlanCommand({
      type: 'APPLY_SEED',
      seed,
      compute: false,
      notifyUser: false,
      recordHistory: false,
      source: 'campaign',
    });
    if (args.origin || args.destination) {
      log('set_route', {
        origin: state.routeOrigin?.name,
        destination: state.routeDestination?.name,
        ok: r.ok,
      });
    }
    if (args.departure) log('set_departure', { departure: seed.dep });
    if (args.vehicleId || args.cargoMass_kg != null || args.starshipArch) {
      log('set_vehicle', {
        vehicleId: state.vehicleId,
        cargoMass_kg: state.cargoMass_kg,
        starshipArch: state.starshipArch,
      });
    }
    if (args.launchSiteId) log('set_launch_site', { launchSiteId: state.launchSiteId });
  }

  if (args.openWindows) {
    const w = await dispatchPlanCommand({ type: 'OPEN_WINDOWS', source: 'campaign' });
    log('open_windows', { ok: w.ok });
  }

  let snapshot = null;
  if (args.compute !== false) {
    if (!state.routeOrigin || !state.routeDestination) {
      throw new Error('Campaign needs origin and destination before compute');
    }
    const c = await dispatchPlanCommand({
      type: 'COMPUTE',
      wait: true,
      recordHistory: true,
      label: 'Campaign compute',
      source: 'campaign',
    });
    snapshot = buildMissionSnapshot(state, {
      departure: dateToInputValue(timeState.getDate()),
    });
    log('compute_route', {
      ok: c.ok,
      missionReady: snapshot?.transfer?.missionReady,
      quality: snapshot?.transfer?.quality,
    });
  }

  if (args.suggestGa) {
    try {
      const g = await dispatchPlanCommand({
        type: 'SUGGEST_GA',
        thorough: args.thorough,
        source: 'campaign',
      });
      log('suggest_ga', { ok: g.ok, n: g.n });
    } catch (e) {
      log('suggest_ga', { ok: false, error: e.message });
    }
  }

  const bundle = getMissionAiBundle();
  notify('CAMPAIGN STEPS APPLIED · review Results / AI next actions');
  return {
    ok: true,
    product_class: 'preliminary-not-flight-certified',
    steps,
    snapshot: snapshot || buildMissionSnapshot(state),
    next_actions: bundle.next,
    dossier: bundle.ctx?.dossier || null,
    triad: bundle.ctx?.triad || null,
    plan_result: (await import('../domain/plan-result.js')).buildPlanResult(),
  };
}
