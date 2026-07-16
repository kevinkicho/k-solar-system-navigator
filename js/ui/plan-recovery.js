/**
 * Wire recovery buttons from plan status banner.
 */
import { notify } from './format.js';

/**
 * @param {object} handlers
 * @param {() => void} [handlers.findNearestWindow] re-run compute (finds window)
 * @param {() => void} [handlers.openPorkchop]
 * @param {() => void} [handlers.snapFlybys]
 * @param {() => void} [handlers.adjustVehicle] scroll/focus vehicle controls
 */
export function bindPlanRecoveryButtons(handlers = {}) {
  const root = document.getElementById('plan-status-banner')
    || document.getElementById('transfer-results');
  if (!root) return;
  root.querySelectorAll('.plan-recovery-btn').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-action');
      if (id === 'find_nearest_window' && handlers.findNearestWindow) {
        handlers.findNearestWindow();
        return;
      }
      if (id === 'open_porkchop' && handlers.openPorkchop) {
        handlers.openPorkchop();
        return;
      }
      if (id === 'snap_flybys' && handlers.snapFlybys) {
        handlers.snapFlybys();
        return;
      }
      if (id === 'adjust_vehicle') {
        const el = document.getElementById('vehicle-select');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
        notify('ADJUST VEHICLE, CARGO, OR ARCHITECTURE');
        return;
      }
      notify(`RECOVERY: ${id || '?'}`);
    };
  });
}
