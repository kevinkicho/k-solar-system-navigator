/**
 * Wire recovery buttons from plan status banner.
 */
import { notify } from './format.js';
import {
  designFromCurrentPlan,
  applyAbstractBudgetFromDesign,
} from './vehicle-design-ui.js';

/**
 * @param {object} handlers
 * @param {() => void} [handlers.findNearestWindow] re-run compute (finds window)
 * @param {() => void} [handlers.openPorkchop]
 * @param {() => void} [handlers.snapFlybys]
 * @param {() => void} [handlers.adjustVehicle] scroll/focus vehicle controls
 * @param {() => void} [handlers.designVehicle] open vehicle design paper study
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
      if (id === 'design_vehicle') {
        if (handlers.designVehicle) {
          handlers.designVehicle();
          return;
        }
        import('./vehicle-lab.js').then(({ openVehicleLab }) => {
          openVehicleLab({ focusDesign: true });
          notify('VEHICLE DESIGN · PAPER STUDY FOR MISSION NEED');
        });
        return;
      }
      if (id === 'apply_abstract_budget') {
        const design = designFromCurrentPlan();
        if (design.ok) applyAbstractBudgetFromDesign(design);
        else notify(design.reason || 'NO NEED TO SIZE BUDGET');
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
      if (id === 'adjust_site') {
        const el = document.getElementById('launch-site');
        if (el) {
          el.value = 'any';
          el.dispatchEvent(new Event('change'));
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        notify('LAUNCH SITE SET TO ANY (NO DLA CONSTRAINT)');
        return;
      }
      notify(`RECOVERY: ${id || '?'}`);
    };
  });
}
