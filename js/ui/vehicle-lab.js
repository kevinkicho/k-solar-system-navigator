/**
 * Vehicle Lab — browse SH / Starship / F9 engineering without a route.
 */
import { state } from '../state.js';
import { vehicleEngineeringHtml } from './vehicle-engineering-ui.js';
import { estimateAscentLossForVehicle, clampAscentBudget } from '../physics/ascent-loss-model.js';
import { notify } from './format.js';

export function wireVehicleLab() {
  const btn = document.getElementById('btn-vehicle-lab');
  const panel = document.getElementById('vehicle-lab-panel');
  const body = document.getElementById('vehicle-lab-body');
  const close = document.getElementById('vehicle-lab-close');
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

    const apply = document.getElementById('vehicle-lab-apply-ascent');
    if (apply) {
      apply.onclick = () => {
        state.ascentLossBudget_m_s = clampAscentBudget(est.total_m_s);
        const sel = document.getElementById('ascent-loss-budget');
        if (sel) {
          // Use custom path: set nearest preset or leave and store state
          if (state.ascentLossBudget_m_s === 1500 || state.ascentLossBudget_m_s === 2000) {
            sel.value = String(state.ascentLossBudget_m_s);
          } else {
            // keep off option but state holds custom; add option if needed
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
  }

  const open = () => {
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    render();
  };
  const hide = () => {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
  };

  btn.onclick = () => {
    if (panel.hidden) open();
    else hide();
  };
  if (close) close.onclick = hide;
}
