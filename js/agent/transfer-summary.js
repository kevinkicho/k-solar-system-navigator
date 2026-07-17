/**
 * Pure transfer / mission snapshot mappers for agent C2 and tests.
 * No DOM, no route-planner imports.
 */

/**
 * Summarize transferData for agent/CLI honesty (uses td.dossier, not planDossier).
 * @param {object|null|undefined} td
 */
export function summarizeTransfer(td) {
  if (!td) return null;
  const dossier = td.dossier || null;
  const deltaV_m_s =
    td.dvTotal_lambert ??
    td.dvTotalMultiLeg ??
    td.dvTotal ??
    td.deltaV ??
    td.totalDeltaV ??
    null;
  return {
    isMultiLeg: !!td.isMultiLeg,
    tofDays: td.tofDays ?? td.tof_days ?? null,
    deltaV_m_s: deltaV_m_s != null && Number.isFinite(Number(deltaV_m_s))
      ? Number(deltaV_m_s)
      : null,
    vInfDep_m_s: td.vInfDep ?? td.v_inf_dep ?? null,
    missionReady: dossier?.mission_ready ?? td.mission_ready ?? null,
    launchEnabled:
      dossier?.launch_enabled ??
      dossier?.mission_ready ??
      td.mission_ready ??
      null,
    quality: dossier?.status ?? null,
    status: dossier?.status ?? null,
    lambertOk: td.lambertOk !== false && td.allLegsOk !== false,
  };
}

/**
 * Build planner snapshot from plain state-like object + optional date string.
 * @param {object} state — subset of HELIOS state
 * @param {{ departure?: string, simDate?: string }} [extra]
 */
export function buildMissionSnapshot(state, extra = {}) {
  const transfer = summarizeTransfer(state?.transferData);
  return {
    origin: state?.routeOrigin?.name || null,
    destination: state?.routeDestination?.name || null,
    flybys: (state?.flybys || []).map(
      (f) => f.bodyName || f.bodyId || f.body?.name || null,
    ),
    vehicleId: state?.vehicleId ?? null,
    cargoMass_kg: state?.cargoMass_kg ?? null,
    starshipArch: state?.starshipArch ?? null,
    fidelityLevel: state?.fidelityLevel ?? null,
    classroomMode: !!state?.classroomMode,
    departure: extra.departure ?? extra.simDate ?? null,
    missionActive: !!state?.mission?.active,
    transfer,
  };
}
