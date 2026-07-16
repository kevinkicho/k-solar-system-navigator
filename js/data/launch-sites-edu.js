/**
 * Educational launch-site latitude / DLA capability bands (not range safety).
 */

export const LAUNCH_SITES_EDU = [
  {
    id: 'any',
    name: 'No site constraint',
    lat_deg: null,
    dla_max_deg: 90,
    disclaimer: 'No launch-site DLA filter applied.',
  },
  {
    id: 'cape',
    name: 'Cape-class (≈28.5°N)',
    lat_deg: 28.5,
    dla_max_deg: 28.5,
    disclaimer: 'Educational band: |DLA| ≲ site latitude class — not range safety.',
  },
  {
    id: 'vandenberg',
    name: 'Vandenberg-class (≈34.7°N)',
    lat_deg: 34.7,
    dla_max_deg: 34.7,
    disclaimer: 'Educational band — not range safety.',
  },
  {
    id: 'kourou',
    name: 'Kourou-class (≈5.2°N)',
    lat_deg: 5.2,
    dla_max_deg: 5.2,
    disclaimer: 'Near-equatorial educational band — not range safety.',
  },
];

export function getLaunchSite(id) {
  return LAUNCH_SITES_EDU.find((s) => s.id === id) || LAUNCH_SITES_EDU[0];
}
