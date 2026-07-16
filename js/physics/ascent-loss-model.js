/**
 * Educational ascent gravity/drag/steering loss class estimates.
 * Not integrated 6DOF atmosphere — order-of-magnitude only.
 */

export const ASCENT_LOSS_DISCLAIMER =
  'Educational ascent loss class estimate — not integrated 6DOF ascent, not flight design.';

/** Frozen class totals (m/s). */
export const ASCENT_LOSS_CLASSES = {
  falcon9: {
    id: 'falcon9',
    label: 'Falcon 9–class',
    t_burn_s: 160,
    gravity_m_s: 1200,
    drag_m_s: 400,
    steering_m_s: 200,
  },
  sh_starship: {
    id: 'sh_starship',
    label: 'Super Heavy + Starship–class',
    t_burn_s: 180,
    gravity_m_s: 1400,
    drag_m_s: 500,
    steering_m_s: 250,
  },
  abstract: {
    id: 'abstract',
    label: 'Abstract (user)',
    t_burn_s: 0,
    gravity_m_s: 0,
    drag_m_s: 0,
    steering_m_s: 0,
  },
};

export function totalAscentLoss_m_s(cls) {
  if (!cls) return 0;
  return (cls.gravity_m_s || 0) + (cls.drag_m_s || 0) + (cls.steering_m_s || 0);
}

/**
 * @param {string} vehicleId
 * @returns {{ classId: string, total_m_s: number, breakdown: object, disclaimer: string }}
 */
export function estimateAscentLossForVehicle(vehicleId) {
  let key = 'abstract';
  if (vehicleId === 'falcon9') key = 'falcon9';
  else if (vehicleId === 'sh-starship') key = 'sh_starship';
  const cls = ASCENT_LOSS_CLASSES[key];
  const total = totalAscentLoss_m_s(cls);
  return {
    classId: key,
    label: cls.label,
    total_m_s: total,
    breakdown: {
      gravity_m_s: cls.gravity_m_s,
      drag_m_s: cls.drag_m_s,
      steering_m_s: cls.steering_m_s,
      t_burn_s: cls.t_burn_s,
    },
    disclaimer: ASCENT_LOSS_DISCLAIMER,
  };
}

/** Clamp educational budget (m/s). */
export function clampAscentBudget(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.min(5000, Math.round(n));
}
