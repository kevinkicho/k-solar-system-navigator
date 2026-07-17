/**
 * Pure launch readiness helpers — no DOM / Three.js.
 * Used by mission.js and offline tests.
 */

/**
 * Whether the transfer may be launched (animation).
 * Prefer dossier.launch_enabled, fall back to mission_ready.
 * @param {object|null|undefined} td
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canLaunchMission(td) {
  if (!td) {
    return { ok: false, reason: 'No transfer data' };
  }
  if (td.isMultiLeg && td.allLegsOk === false) {
    return { ok: false, reason: 'Some multi-leg Lambert legs failed' };
  }
  if (td.lambertOk === false) {
    return { ok: false, reason: 'Lambert solve failed' };
  }
  const dossier = td.dossier;
  if (dossier) {
    const enabled =
      dossier.launch_enabled !== undefined
        ? !!dossier.launch_enabled
        : !!dossier.mission_ready;
    if (!enabled) {
      return {
        ok: false,
        reason:
          dossier.summary ||
          dossier.status ||
          'Plan dossier not launch-enabled',
      };
    }
  }
  return { ok: true };
}
