import { AU, DAY, J2000 } from '../constants.js';

export function simTimeToDate(simTime) { return new Date(J2000 + simTime * 1000); }
export function dateToSimTime(date) { return (date.getTime() - J2000) / 1000; }

export function dateToInputValue(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

export function inputValueToDate(val) {
  if (!val) return null;
  return new Date(val + ':00Z');
}

export function formatDateShort(date) {
  return date.toISOString().slice(0, 10) + ' ' + date.toISOString().slice(11, 16) + ' UTC';
}

export function formatDist(meters) {
  if (meters >= AU * 0.1) return (meters / AU).toFixed(3) + ' AU';
  if (meters >= 1e9) return (meters / 1e9).toFixed(2) + ' Gm';
  if (meters >= 1e6) return (meters / 1e6).toFixed(1) + ' Mm';
  if (meters >= 1e3) return (meters / 1e3).toFixed(1) + ' km';
  return meters.toFixed(0) + ' m';
}

export function formatTime(seconds) {
  if (seconds === Infinity || isNaN(seconds)) return '--';
  const days = seconds / DAY;
  if (days >= 365.25) return (days / 365.25).toFixed(2) + ' years';
  if (days >= 30) return (days / 30).toFixed(1) + ' months';
  if (days >= 1) return days.toFixed(1) + ' days';
  return (seconds / 3600).toFixed(1) + ' hours';
}

export function formatTimePrecise(seconds) {
  if (seconds === Infinity || isNaN(seconds)) return '--';
  const days = Math.floor(seconds / DAY);
  const hrs = Math.floor((seconds % DAY) / 3600);
  const years = Math.floor(days / 365.25);
  const remDays = days - Math.floor(years * 365.25);
  if (years > 0) return `${years}y ${remDays}d ${hrs}h`;
  if (days > 0) return `${days}d ${hrs}h`;
  return `${hrs}h`;
}

export function formatVelocity(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + ' km/s';
  return ms.toFixed(1) + ' m/s';
}

export function formatMass(kg) {
  if (kg >= 1e27) return (kg / 1e27).toFixed(3) + ' ×10²⁷ kg';
  if (kg >= 1e24) return (kg / 1e24).toFixed(3) + ' ×10²⁴ kg';
  if (kg >= 1e23) return (kg / 1e23).toFixed(3) + ' ×10²³ kg';
  return kg.toExponential(3) + ' kg';
}

export function notify(msg) {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
