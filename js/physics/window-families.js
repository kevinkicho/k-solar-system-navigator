/**
 * Window families — cluster shortlist cells into launch seasons.
 * Not a global mission optimizer; ranks local porkchop shortlist groups.
 */

import { DAY } from '../constants.js';

/**
 * Cluster shortlist rows by approximate opposition / season (~26-month Mars class
 * uses year buckets; generic uses dep year + TOF band).
 * @param {Array<object>} shortlist from buildWindowShortlist / state.windowShortlist
 * @param {{ yearBucket?: number }} [opts]
 * @returns {{ families: object[], product_class: string, note: string }}
 */
export function clusterWindowFamilies(shortlist, opts = {}) {
  const rows = Array.isArray(shortlist) ? shortlist : [];
  if (!rows.length) {
    return {
      families: [],
      product_class: 'preliminary-not-flight-certified',
      note: 'No shortlist — run porkchop / open windows first.',
    };
  }

  const yearBucket = opts.yearBucket ?? 1; // 1-year season buckets
  const map = new Map();

  for (const r of rows) {
    const depIso = r.dep_iso || r.dep || '';
    const year = depIso ? Number(String(depIso).slice(0, 4)) : null;
    const yKey = year != null && isFinite(year)
      ? Math.floor(year / yearBucket) * yearBucket
      : 'unknown';
    const tofDays = r.tof_days ?? (r.tof_s != null ? r.tof_s / DAY : null);
    const tofBand = tofDays == null ? 'tof?'
      : tofDays < 180 ? 'short'
        : tofDays < 400 ? 'mid'
          : 'long';
    const key = `${yKey}-${tofBand}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        season_year: yKey,
        tof_band: tofBand,
        members: [],
      });
    }
    map.get(key).members.push(r);
  }

  const families = [...map.values()].map((f) => {
    const sorted = f.members.slice().sort((a, b) => (a.dv_m_s ?? 1e15) - (b.dv_m_s ?? 1e15));
    const best = sorted[0];
    const dvs = sorted.map((m) => m.dv_m_s).filter((v) => Number.isFinite(v));
    const mean = dvs.length ? dvs.reduce((s, v) => s + v, 0) / dvs.length : null;
    return {
      id: f.id,
      label: `Season ${f.season_year} · ${f.tof_band} TOF`,
      season_year: f.season_year,
      tof_band: f.tof_band,
      n: sorted.length,
      best,
      best_dv_m_s: best?.dv_m_s ?? null,
      mean_dv_m_s: mean,
      members: sorted,
      recommended: false,
    };
  });

  families.sort((a, b) => (a.best_dv_m_s ?? 1e15) - (b.best_dv_m_s ?? 1e15));
  if (families[0]) families[0].recommended = true;

  return {
    families,
    product_class: 'preliminary-not-flight-certified',
    note: 'Window families cluster a local shortlist — not a global optimum campaign calendar.',
    generated_at: new Date().toISOString(),
  };
}

/**
 * Campaign calendar lines for UI / package.
 */
export function formatFamilyCalendar(pack) {
  return (pack?.families || []).map((f, i) => {
    const d = f.best?.dep_iso ? String(f.best.dep_iso).slice(0, 10) : '—';
    const dv = f.best_dv_m_s != null ? `${(f.best_dv_m_s / 1000).toFixed(2)} km/s` : '—';
    const rec = f.recommended ? ' ★' : '';
    return `${i + 1}. ${f.label}${rec} · best dep ${d} · Need-class ${dv} · n=${f.n}`;
  });
}
