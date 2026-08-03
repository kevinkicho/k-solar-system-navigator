/**
 * Pure NL → campaign args (no DOM).
 */

/**
 * Lightweight NL heuristic → structured campaign args (no LLM required).
 * @param {string} text
 */
export function parseCampaignHint(text) {
  const t = String(text || '');
  const args = { compute: true };
  const bodies = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Moon', 'Ceres'];
  const found = [];
  for (const b of bodies) {
    if (new RegExp(`\\b${b}\\b`, 'i').test(t)) found.push(b);
  }
  if (found.length >= 2) {
    args.origin = found[0];
    args.destination = found[1];
  } else if (found.length === 1 && /from\s+/i.test(t)) {
    args.origin = found[0];
  } else if (found.length === 1) {
    args.destination = found[0];
    args.origin = 'Earth';
  }
  const year = t.match(/\b(20\d{2})\b/);
  if (year) args.departure = year[1];
  const cargo = t.match(/(\d+(?:\.\d+)?)\s*(?:t|tonnes?|tons?)\b/i)
    || t.match(/(\d+)\s*kg\b/i);
  if (cargo) {
    const n = parseFloat(cargo[1]);
    args.cargoMass_kg = /kg/i.test(cargo[0]) ? n : n * 1000;
  }
  if (/falcon\s*9|f9/i.test(t)) args.vehicleId = 'falcon9';
  if (/starship|super\s*heavy/i.test(t)) {
    args.vehicleId = 'sh-starship';
    if (/tanker/i.test(t)) args.starshipArch = 'tanker-n';
    else args.starshipArch = 'unrefueled';
  }
  if (/cape/i.test(t)) args.launchSiteId = 'cape';
  if (/vandenberg/i.test(t)) args.launchSiteId = 'vandenberg';
  if (/kourou/i.test(t)) args.launchSiteId = 'kourou';
  if (/gravity\s*assist|flyby|suggest\s*ga/i.test(t)) args.suggestGa = true;
  if (/window|porkchop/i.test(t)) args.openWindows = true;
  return args;
}
