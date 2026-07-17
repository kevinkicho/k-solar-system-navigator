/**
 * Vehicle Lab — sample rockets + design-for-Need paper study.
 */
import { state } from '../state.js';
import { vehicleEngineeringHtml } from './vehicle-engineering-ui.js';
import { estimateAscentLossForVehicle, clampAscentBudget } from '../physics/ascent-loss-model.js';
import { notify } from './format.js';
import {
  designFromCurrentPlan,
  vehicleDesignReportHtml,
  bindVehicleDesignActions,
} from './vehicle-design-ui.js';

let _openLab = null;

/** Open Vehicle Lab (optionally scroll to design section). */
export function openVehicleLab(opts = {}) {
  if (typeof _openLab === 'function') _openLab(opts);
}

export function wireVehicleLab() {
  const btn = document.getElementById('btn-vehicle-lab');
  const panel = document.getElementById('vehicle-lab-panel');
  const body = document.getElementById('vehicle-lab-body');
  const close = document.getElementById('vehicle-lab-close');
  const backdrop = document.getElementById('vehicle-lab-backdrop');
  if (!btn || !panel || !body) return;

  function render() {
    const slices = [
      { vehicleId: 'sh-starship', starshipArch: state.starshipArch || 'unrefueled', tankerCount: state.tankerCount, cargoMass_kg: state.cargoMass_kg, falcon9Variant: state.falcon9Variant },
      { vehicleId: 'falcon9', cargoMass_kg: state.cargoMass_kg, falcon9Variant: state.falcon9Variant || 'expendable' },
    ];
    let html = `
      <p style="font-size:10px;color:var(--amber);margin-bottom:8px">
        Concept-grade sample vehicles — not SpaceX-certified. Lab does <strong>not</strong> prove a mission is feasible without a computed plan.
      </p>`;

    // Design-for-Need paper study (uses current transfer Need when available)
    const design = designFromCurrentPlan();
    html += vehicleDesignReportHtml(design);
    html += '<div style="height:14px;border-bottom:1px solid var(--border);margin:12px 0"></div>';

    for (const s of slices) {
      html += vehicleEngineeringHtml(s);
      html += '<div style="height:12px;border-bottom:1px solid var(--border);margin:8px 0"></div>';
    }
    const est = estimateAscentLossForVehicle(state.vehicleId);
    html += `
      <div class="result-subtitle">ASCENT LOSS CLASS (EDU)</div>
      <div class="info-row"><span class="key">Active vehicle class</span><span class="val">${est.label}</span></div>
      <div class="info-row"><span class="key">Estimate total</span><span class="val amber">${est.total_m_s} m/s</span></div>
      <div class="info-row"><span class="key">Breakdown</span><span class="val" style="font-size:9px">g ${est.breakdown.gravity_m_s} · drag ${est.breakdown.drag_m_s} · steer ${est.breakdown.steering_m_s}</span></div>
      <button type="button" class="btn-tiny" id="vehicle-lab-apply-ascent">Apply estimate to ascent budget</button>
      <div class="info-row"><span class="key">Note</span><span class="val" style="font-size:9px;opacity:0.75">${est.disclaimer}</span></div>`;
    body.innerHTML = html;

    bindVehicleDesignActions(body, design);

    const apply = document.getElementById('vehicle-lab-apply-ascent');
    if (apply) {
      apply.onclick = () => {
        state.ascentLossBudget_m_s = clampAscentBudget(est.total_m_s);
        const sel = document.getElementById('ascent-loss-budget');
        if (sel) {
          if (state.ascentLossBudget_m_s === 1500 || state.ascentLossBudget_m_s === 2000) {
            sel.value = String(state.ascentLossBudget_m_s);
          } else {
            let opt = sel.querySelector('option[data-custom]');
            if (!opt) {
              opt = document.createElement('option');
              opt.dataset.custom = '1';
              sel.appendChild(opt);
            }
            opt.value = String(state.ascentLossBudget_m_s);
            opt.textContent = `Custom ${state.ascentLossBudget_m_s} m/s`;
            sel.value = opt.value;
          }
        }
        notify(`ASCENT BUDGET SET TO ${state.ascentLossBudget_m_s} m/s (EDU)`);
      };
    }

    if (optsFocusDesign) {
      const el = body.querySelector('#vehicle-design-report');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  let optsFocusDesign = false;

  const open = (opts = {}) => {
    optsFocusDesign = !!opts.focusDesign;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    if (backdrop) {
      backdrop.classList.add('visible');
      backdrop.setAttribute('aria-hidden', 'false');
    }
    render();
  };
  const hide = () => {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    if (backdrop) {
      backdrop.classList.remove('visible');
      backdrop.setAttribute('aria-hidden', 'true');
    }
  };

  _openLab = open;

  btn.onclick = () => {
    if (panel.hidden) open();
    else hide();
  };
  if (close) close.onclick = hide;
  if (backdrop) backdrop.onclick = hide;
}
