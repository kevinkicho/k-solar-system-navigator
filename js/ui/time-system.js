import { DAY, J2000 } from '../constants.js';

/** Forward/reverse calendar rates for the bottom-bar speed slider. */
export const TIME_SPEEDS = [
  { scale: -365.25 * DAY, label: '-1 YEAR/s' },
  { scale: -30 * DAY, label: '-1 MONTH/s' },
  { scale: -DAY, label: '-1 DAY/s' },
  { scale: 0, label: 'PAUSED' },
  { scale: DAY, label: '1 DAY/s' },
  { scale: 7 * DAY, label: '1 WEEK/s' },
  { scale: 30 * DAY, label: '1 MONTH/s' },
  { scale: 90 * DAY, label: '3 MONTHS/s' },
  { scale: 365.25 * DAY, label: '1 YEAR/s' },
  { scale: 10 * 365.25 * DAY, label: '10 YEARS/s' },
  { scale: 100 * 365.25 * DAY, label: '100 YEARS/s' },
];

/**
 * Pick speed index so the full transit takes ~45–90 wall-seconds at a
 * **constant** sim-time rate. Constant calendar compression keeps Kepler
 * velocity ratios honest (fast near perihelion, slow outer) — only the
 * wall-clock scale is educational.
 */
export function pickMissionStudySpeed(transferTime) {
  if (!(transferTime > 0)) return 4;
  const targetWall_s = 60;
  const desiredScale = transferTime / targetWall_s;
  let best = 4;
  let bestErr = Infinity;
  for (let i = 0; i < TIME_SPEEDS.length; i++) {
    const sc = TIME_SPEEDS[i].scale;
    if (!(sc > 0)) continue;
    const err = Math.abs(Math.log(sc / desiredScale));
    if (err < bestErr) {
      bestErr = err;
      best = i;
    }
  }
  // Short moon hops: keep slow enough to study geometry
  if (transferTime < 2 * DAY) return Math.min(best, 4);
  if (transferTime < 14 * DAY) return Math.min(best, 5);
  return best;
}

/** Realtime multiplier label for current timeScale (e.g. ×86400). */
export function formatTimeCompression(timeScale) {
  if (!(timeScale > 0)) return timeScale === 0 ? 'paused' : 'reverse';
  if (timeScale >= 0.95 && timeScale <= 1.05) return '×1 realtime';
  if (timeScale >= 1e6) return `×${(timeScale / 1e6).toFixed(1)}M`;
  if (timeScale >= 1e3) return `×${(timeScale / 1e3).toFixed(0)}k`;
  return `×${timeScale.toFixed(0)}`;
}

export const timeState = {
  simTime: (Date.now() - J2000) / 1000,
  timeScale: 0,
  speedIndex: 3,
  speeds: TIME_SPEEDS,
  setSpeed(index) {
    this.speedIndex = Math.max(0, Math.min(this.speeds.length - 1, index));
    this.timeScale = this.speeds[this.speedIndex].scale;
    const slider = typeof document !== 'undefined'
      ? document.getElementById('speed-slider')
      : null;
    if (slider) slider.value = this.speedIndex;
    this.updateDisplay();
  },
  getDate() { return new Date(J2000 + this.simTime * 1000); },
  updateDisplay() {
    if (typeof document === 'undefined') return;
    const d = this.getDate();
    const dateStr = d.toISOString().slice(0, 10);
    const timeStr = d.toISOString().slice(11, 16);
    const simDate = document.getElementById('sim-date');
    const timeDisp = document.getElementById('time-display');
    const timeSpeed = document.getElementById('time-speed');
    const simMjd = document.getElementById('sim-mjd');
    if (simDate) simDate.textContent = dateStr;
    if (timeDisp) timeDisp.textContent = `${dateStr} ${timeStr} UTC`;
    if (timeSpeed) {
      timeSpeed.textContent = this.speeds[this.speedIndex].label;
      timeSpeed.style.color =
        this.timeScale < 0 ? '#ff2d55' : this.timeScale === 0 ? '#5a7a90' : '#ff9800';
    }
    if (simMjd) simMjd.textContent = ((this.simTime / DAY) + 51544.5).toFixed(1);
    document.getElementById('btn-pause')?.classList.toggle('active', this.timeScale === 0);
    document.getElementById('btn-play')?.classList.toggle('active', this.timeScale > 0 && this.timeScale <= DAY);
    document.getElementById('btn-fwd-fast')?.classList.toggle('active', this.timeScale > DAY);
    document.getElementById('btn-rev')?.classList.toggle('active', this.timeScale < 0 && this.timeScale >= -DAY);
    document.getElementById('btn-rev-fast')?.classList.toggle('active', this.timeScale < -DAY);
  },
};
