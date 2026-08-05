import { DAY, J2000 } from '../constants.js';

/** Forward/reverse calendar rates for the bottom-bar speed slider (discrete presets). */
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
 * Max wall-clock dt applied per frame when advancing sim time.
 * Caps tab-background spikes so the calendar rate stays constant
 * (no multi-year jumps after alt-tab).
 */
export const MAX_WALL_DT_S = 0.05;

/**
 * Continuous sim-seconds per wall-second so a transit fits ~targetWall_s.
 * Constant rate — does not change mid-flight. Ship speed still varies
 * with vis-viva (fast near perihelion); that is physics, not clock ramp.
 */
export function missionStudyScale(transferTime, targetWall_s = 60) {
  if (!(transferTime > 0)) return DAY;
  const wall = Math.max(20, Math.min(120, targetWall_s));
  let scale = transferTime / wall;
  // Clamp to reasonable educational band (1 hour/s … 50 year/s)
  const minS = 3600;
  const maxS = 50 * 365.25 * DAY;
  scale = Math.max(minS, Math.min(maxS, scale));
  // Short hops: keep slow enough to study
  if (transferTime < 2 * DAY) scale = Math.min(scale, DAY);
  else if (transferTime < 14 * DAY) scale = Math.min(scale, 7 * DAY);
  return scale;
}

/**
 * Nearest discrete slider index for a continuous scale (UI mirror only).
 */
export function nearestSpeedIndex(scale) {
  if (!(scale > 0) && !(scale < 0)) return 3; // paused
  let best = scale > 0 ? 4 : 2;
  let bestErr = Infinity;
  for (let i = 0; i < TIME_SPEEDS.length; i++) {
    const sc = TIME_SPEEDS[i].scale;
    if (sc === 0) continue;
    if ((scale > 0) !== (sc > 0)) continue;
    const err = Math.abs(Math.log(Math.abs(sc) / Math.abs(scale)));
    if (err < bestErr) {
      bestErr = err;
      best = i;
    }
  }
  return best;
}

/**
 * Pick speed index so the full transit takes ~45–90 wall-seconds at a
 * **constant** sim-time rate. Prefer missionStudyScale + setContinuousScale.
 */
export function pickMissionStudySpeed(transferTime) {
  const scale = missionStudyScale(transferTime);
  return nearestSpeedIndex(scale);
}

/** Realtime multiplier label for current timeScale (e.g. ×86400). */
export function formatTimeCompression(timeScale) {
  if (!(timeScale > 0)) return timeScale === 0 ? 'paused' : 'reverse';
  if (timeScale >= 0.95 && timeScale <= 1.05) return '×1 realtime';
  if (timeScale >= 1e6) return `×${(timeScale / 1e6).toFixed(1)}M`;
  if (timeScale >= 1e3) return `×${(timeScale / 1e3).toFixed(0)}k`;
  return `×${timeScale.toFixed(0)}`;
}

/** Human label for continuous scale (e.g. "3.4 DAY/s"). */
export function formatScaleLabel(timeScale) {
  if (timeScale === 0) return 'PAUSED';
  const sign = timeScale < 0 ? '-' : '';
  const s = Math.abs(timeScale);
  if (s >= 365.25 * DAY * 0.95) {
    const y = s / (365.25 * DAY);
    return `${sign}${y >= 10 ? y.toFixed(0) : y.toFixed(1)} YEAR/s`;
  }
  if (s >= 30 * DAY * 0.9) return `${sign}${(s / (30 * DAY)).toFixed(1)} MONTH/s`;
  if (s >= 7 * DAY * 0.9) return `${sign}${(s / (7 * DAY)).toFixed(1)} WEEK/s`;
  if (s >= DAY * 0.5) return `${sign}${(s / DAY).toFixed(2)} DAY/s`;
  if (s >= 3600) return `${sign}${(s / 3600).toFixed(1)} h/s`;
  return `${sign}${s.toFixed(0)} s/s`;
}

export const timeState = {
  simTime: (Date.now() - J2000) / 1000,
  /** Sim seconds advanced per wall-clock second (constant while playing). */
  timeScale: 0,
  speedIndex: 3,
  speeds: TIME_SPEEDS,
  /** Last non-zero scale for pause/resume (play restores this, not always 1 day/s). */
  lastPlayScale: DAY,
  /** When true, timeScale may differ from speeds[speedIndex] (mission study). */
  continuousScale: false,

  /**
   * Snap to discrete slider preset (bottom bar / keyboard).
   * @param {number} index
   */
  setSpeed(index) {
    this.speedIndex = Math.max(0, Math.min(this.speeds.length - 1, index));
    this.timeScale = this.speeds[this.speedIndex].scale;
    this.continuousScale = false;
    if (this.timeScale !== 0) this.lastPlayScale = this.timeScale;
    const slider = typeof document !== 'undefined'
      ? document.getElementById('speed-slider')
      : null;
    if (slider) slider.value = this.speedIndex;
    this.updateDisplay();
  },

  /**
   * Hold a fixed calendar compression rate (mission fly-study).
   * Does not ramp mid-flight; only ship Kepler speed varies along the arc.
   * @param {number} scale sim-seconds per wall-second
   */
  setContinuousScale(scale) {
    const s = Number(scale);
    if (!Number.isFinite(s)) return;
    this.timeScale = s;
    this.continuousScale = s !== 0;
    this.speedIndex = nearestSpeedIndex(s);
    if (s !== 0) this.lastPlayScale = s;
    const slider = typeof document !== 'undefined'
      ? document.getElementById('speed-slider')
      : null;
    if (slider) slider.value = this.speedIndex;
    this.updateDisplay();
  },

  /** Resume last play rate (or 1 day/s). */
  play() {
    const s = this.lastPlayScale || DAY;
    if (this.continuousScale || Math.abs(s - (this.speeds[nearestSpeedIndex(s)]?.scale || 0)) > 1) {
      this.setContinuousScale(Math.abs(s) || DAY);
    } else {
      this.setSpeed(nearestSpeedIndex(Math.abs(s) || DAY));
    }
  },

  pause() {
    if (this.timeScale !== 0) this.lastPlayScale = this.timeScale;
    this.timeScale = 0;
    this.speedIndex = 3;
    this.continuousScale = false;
    const slider = typeof document !== 'undefined'
      ? document.getElementById('speed-slider')
      : null;
    if (slider) slider.value = 3;
    this.updateDisplay();
  },

  /**
   * Advance sim clock by wall dt with cap (constant rate).
   * @param {number} wallDt wall seconds since last frame
   * @returns {number} sim seconds advanced
   */
  advance(wallDt) {
    if (this.timeScale === 0 || !(wallDt > 0)) return 0;
    const dt = Math.min(wallDt, MAX_WALL_DT_S);
    const dSim = this.timeScale * dt;
    this.simTime += dSim;
    return dSim;
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
      // Continuous mission scale: show exact rate, not nearest preset only
      timeSpeed.textContent = this.continuousScale || (
        this.timeScale !== 0
        && Math.abs(this.timeScale - (this.speeds[this.speedIndex]?.scale || 0)) > 1
      )
        ? formatScaleLabel(this.timeScale)
        : this.speeds[this.speedIndex].label;
      timeSpeed.title = this.timeScale === 0
        ? 'Paused'
        : `Constant calendar rate: ${formatTimeCompression(this.timeScale)} realtime · ship speed still varies with distance (vis-viva)`;
      timeSpeed.style.color =
        this.timeScale < 0 ? '#ff2d55' : this.timeScale === 0 ? '#5a7a90' : '#ff9800';
    }
    if (simMjd) simMjd.textContent = ((this.simTime / DAY) + 51544.5).toFixed(1);
    document.getElementById('btn-pause')?.classList.toggle('active', this.timeScale === 0);
    document.getElementById('btn-play')?.classList.toggle('active', this.timeScale > 0 && Math.abs(this.timeScale) <= DAY * 1.5);
    document.getElementById('btn-fwd-fast')?.classList.toggle('active', this.timeScale > DAY * 1.5);
    document.getElementById('btn-rev')?.classList.toggle('active', this.timeScale < 0 && this.timeScale >= -DAY * 1.5);
    document.getElementById('btn-rev-fast')?.classList.toggle('active', this.timeScale < -DAY * 1.5);
  },
};
