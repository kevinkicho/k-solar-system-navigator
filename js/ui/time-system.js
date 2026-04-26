import { DAY, J2000 } from '../constants.js';

export const timeState = {
  simTime: (Date.now() - J2000) / 1000,
  timeScale: 0,
  speedIndex: 3,
  speeds: [
    { scale: -365.25*DAY, label: '-1 YEAR/s' },
    { scale: -30*DAY, label: '-1 MONTH/s' },
    { scale: -DAY, label: '-1 DAY/s' },
    { scale: 0, label: 'PAUSED' },
    { scale: DAY, label: '1 DAY/s' },
    { scale: 7*DAY, label: '1 WEEK/s' },
    { scale: 30*DAY, label: '1 MONTH/s' },
    { scale: 90*DAY, label: '3 MONTHS/s' },
    { scale: 365.25*DAY, label: '1 YEAR/s' },
    { scale: 10*365.25*DAY, label: '10 YEARS/s' },
    { scale: 100*365.25*DAY, label: '100 YEARS/s' },
  ],
  setSpeed(index) {
    this.speedIndex = Math.max(0, Math.min(this.speeds.length - 1, index));
    this.timeScale = this.speeds[this.speedIndex].scale;
    document.getElementById('speed-slider').value = this.speedIndex;
    this.updateDisplay();
  },
  getDate() { return new Date(J2000 + this.simTime * 1000); },
  updateDisplay() {
    const d = this.getDate();
    const dateStr = d.toISOString().slice(0, 10);
    const timeStr = d.toISOString().slice(11, 16);
    document.getElementById('sim-date').textContent = dateStr;
    document.getElementById('time-display').textContent = `${dateStr} ${timeStr} UTC`;
    document.getElementById('time-speed').textContent = this.speeds[this.speedIndex].label;
    document.getElementById('time-speed').style.color =
      this.timeScale < 0 ? '#ff2d55' : this.timeScale === 0 ? '#5a7a90' : '#ff9800';
    document.getElementById('sim-mjd').textContent = ((this.simTime / DAY) + 51544.5).toFixed(1);
    document.getElementById('btn-pause').classList.toggle('active', this.timeScale === 0);
    document.getElementById('btn-play').classList.toggle('active', this.timeScale > 0 && this.timeScale <= DAY);
    document.getElementById('btn-fwd-fast').classList.toggle('active', this.timeScale > DAY);
    document.getElementById('btn-rev').classList.toggle('active', this.timeScale < 0 && this.timeScale >= -DAY);
    document.getElementById('btn-rev-fast').classList.toggle('active', this.timeScale < -DAY);
  },
};
