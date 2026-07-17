/**
 * Vehicle design report HTML + apply-to-plan helpers (concept-grade paper study).
 */
import { state } from '../state.js';
import { designVehicleForNeed } from '../physics/vehicle-design.js';
import { formatVelocity, notify } from './format.js';
import { computeNeedNow } from './mission-budget-ui.js';

async function refreshPlanUi() {
  if (!state.transferData) return;
  const { buildPlanDossier } = await import('./plan-dossier.js');
  const { renderRouteUI } = await import('./route-display.js');
  const { syncShareHash } = await import('./share-sync.js');
  buildPlanDossier(state.transferData, {});
  renderRouteUI();
  syncShareHash();
}

function fmtT(kg) {
  if (kg == null || !isFinite(kg)) return '—';
  if (Math.abs(kg) >= 1e6) return `${(kg / 1e6).toFixed(2)} kt`;
  if (Math.abs(kg) >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${kg.toFixed(0)} kg`;
}

function fmtR(x, d = 3) {
  if (x == null || !isFinite(x)) return '—';
  return Number(x).toFixed(d);
}

/**
 * Build design package from current transfer (or null).
 */
export function designFromCurrentPlan(opts = {}) {
  const td = state.transferData;
  const need = td ? computeNeedNow(td) : null;
  const needDv = need?.need_dv_m_s;
  if (needDv == null || !isFinite(needDv) || needDv <= 0) {
    return {
      ok: false,
      reason: need?.reason || 'Compute a transfer first (Need Δv required)',
    };
  }
  return designVehicleForNeed(needDv, {
    cargoMass_kg: opts.cargoMass_kg ?? state.cargoMass_kg ?? 0,
    dryMass_kg: opts.dryMass_kg,
    starshipArch: state.starshipArch,
    tankerCount: state.tankerCount,
  });
}

/**
 * HTML report for vehicle lab / results panel.
 */
export function vehicleDesignReportHtml(design) {
  if (!design?.ok) {
    return `
      <div class="vd-report">
        <div class="result-subtitle">VEHICLE DESIGN FOR NEED</div>
        <p class="vd-disclaimer">${design?.reason || 'No design'}</p>
      </div>`;
  }

  const rec = design.recommendation;
  const cmp = design.comparison;
  const prop = rec?.propulsion;
  const ss = rec?.single_stage;
  const sketch = (rec?.paper_sketch || []).map((l) => `<li>${l}</li>`).join('');

  const ispRows = (design.isp_sweep || []).map((r) => `
    <tr>
      <td>${r.isp} s</td>
      <td>${fmtR(r.mass_ratio, 2)}</td>
      <td>${fmtT(r.propellantMass_kg)}</td>
      <td>${fmtT(r.wetMass_kg)}</td>
      <td>${fmtR(r.structural_eps, 3)}</td>
    </tr>`).join('');

  const dryRows = (design.dry_mass_sweep || []).slice(0, 7).map((r) => `
    <tr>
      <td>${fmtT(r.dryMass_kg)}</td>
      <td>${fmtT(r.propellantMass_kg)}</td>
      <td>${fmtT(r.wetMass_kg)}</td>
      <td>${fmtR(r.structural_eps, 3)}</td>
    </tr>`).join('');

  const sens = design.sensitivity?.at_need;
  const contour = (design.design_space_samples || []).map((c) => `
    <tr>
      <td>${c.isp}</td>
      <td>${fmtT(c.dryMass_kg)}</td>
      <td>${fmtT(c.propellantMass_kg)}</td>
      <td>${fmtR(c.structural_eps, 3)}</td>
    </tr>`).join('');

  const gap = cmp?.gap_vs_unrefueled_m_s;
  const gapCls = gap != null && gap > 0 ? 'red-val' : 'green';
  const vs = rec?.vs_sh_starship;
  const mt = vs?.multiples_text || {};
  const vsLines = (vs?.lines || []).map((l) => `<li>${l}</li>`).join('');

  return `
    <div class="vd-report" id="vehicle-design-report">
      <div class="result-subtitle">VEHICLE DESIGN FOR NEED · PAPER STUDY</div>
      <p class="vd-disclaimer">${design.disclaimer}</p>

      <div class="info-row"><span class="key">Mission Need Δv</span><span class="val amber">${formatVelocity(design.need_dv_m_s)}</span></div>
      <div class="info-row"><span class="key">Cargo assumed</span><span class="val">${fmtT(design.cargoMass_kg)}</span></div>
      <div class="info-row"><span class="key">Rocket equation</span><span class="val" style="font-size:10px">${design.equations.rocket}</span></div>
      <div class="info-row"><span class="key">Mass ratio</span><span class="val" style="font-size:10px">${design.equations.mass_ratio}</span></div>
      <div class="info-row"><span class="key">Propellant solve</span><span class="val" style="font-size:10px">${design.equations.propellant}</span></div>

      <div class="result-subtitle" style="margin-top:10px">GAP VS SAMPLE VEHICLES</div>
      ${cmp ? `
        <div class="info-row"><span class="key">SS unrefueled cap</span><span class="val">${formatVelocity(cmp.starship_unrefueled_dv_m_s)}</span></div>
        <div class="info-row"><span class="key">Gap (Need − SS unref.)</span><span class="val ${gapCls}">${formatVelocity(gap)}</span></div>
        <div class="info-row"><span class="key">SH legacy (demo) cap</span><span class="val">${formatVelocity(cmp.superHeavy_legacy_dv_m_s)}</span></div>
        <div class="info-row"><span class="key">Tankers to close Need</span><span class="val">${cmp.tankers_needed_for_need != null ? cmp.tankers_needed_for_need : 'impossible @ cargo'}</span></div>
      ` : ''}

      <div class="result-subtitle" style="margin-top:10px">VS STARSHIP SHIP / SUPER HEAVY (× MULTIPLES)</div>
      <p class="vd-cap">Fuel · tanks · dry · wet are vs a <strong>Starship ship</strong> (~1200&nbsp;t prop), not the full SH+SS stack (stack includes Super Heavy’s launch prop and used to read ~0.1× too small). Thrust is vs Super Heavy liftoff at the same stack T/W.</p>
      ${vs?.ok ? `
        <div class="vd-multiples">
          <div class="vd-mul"><span class="vd-mul-x">${mt.propellant_mass || '—'}</span><span class="vd-mul-l">fuel vs SS ship</span></div>
          <div class="vd-mul"><span class="vd-mul-x">${mt.tank_volume || '—'}</span><span class="vd-mul-l">tank vol vs SS</span></div>
          <div class="vd-mul"><span class="vd-mul-x">${mt.linear_tank_scale || '—'}</span><span class="vd-mul-l">tank linear size</span></div>
          <div class="vd-mul"><span class="vd-mul-x">${mt.wet_mass || '—'}</span><span class="vd-mul-l">wet vs SS ship</span></div>
          <div class="vd-mul"><span class="vd-mul-x">${mt.linear_wet_mass_scale || '—'}</span><span class="vd-mul-l">overall linear size</span></div>
          <div class="vd-mul"><span class="vd-mul-x">${mt.thrust_same_twr || '—'}</span><span class="vd-mul-l">thrust vs SH liftoff</span></div>
          <div class="vd-mul"><span class="vd-mul-x">${mt.dry_mass || '—'}</span><span class="vd-mul-l">dry vs SS ship</span></div>
        </div>
        ${mt.stack_propellant_mass ? `<p class="vd-cap">Context: fuel ≈ <strong>${mt.stack_propellant_mass}</strong> a full SH+SS stack prop total (includes booster launch prop).</p>` : ''}
        <ul class="vd-sketch vd-vs-lines">${vsLines}</ul>
      ` : '<p class="vd-cap">Multiples unavailable (incomplete mass solve).</p>'}
      ${(() => {
        const chem = rec?.vs_chemical_starship_class;
        if (!chem?.ok || !(rec?.propulsion?.isp > 350)) return '';
        const ct = chem.multiples_text || {};
        const cd = chem.design || {};
        return `
        <div class="result-subtitle" style="margin-top:8px">IF STAYED LOX/CH₄ LIKE STARSHIP</div>
        <p class="vd-cap">Recommended sketch uses higher Isp (${rec.propulsion.isp}&nbsp;s), which shrinks tanks. Same Need at Isp&nbsp;350&nbsp;s · dry&nbsp;120&nbsp;t (SS-class chemical):</p>
        <div class="vd-multiples">
          <div class="vd-mul"><span class="vd-mul-x">${ct.propellant_mass || '—'}</span><span class="vd-mul-l">fuel vs SS ship</span></div>
          <div class="vd-mul"><span class="vd-mul-x">${ct.tank_volume || '—'}</span><span class="vd-mul-l">tank vol vs SS</span></div>
          <div class="vd-mul"><span class="vd-mul-x">${ct.wet_mass || '—'}</span><span class="vd-mul-l">wet vs SS ship</span></div>
          <div class="vd-mul"><span class="vd-mul-x">${ct.thrust_same_twr || '—'}</span><span class="vd-mul-l">thrust vs SH</span></div>
        </div>
        <p class="vd-cap">Chemical prop ≈ ${fmtT(cd.propellantMass_kg)} · wet ≈ ${fmtT(cd.wetMass_kg)} — usually the larger order-of-magnitude for hard Need.</p>`;
      })()}

      <div class="result-subtitle" style="margin-top:10px">RECOMMENDED PAPER SKETCH</div>
      ${prop ? `<div class="info-row"><span class="key">Propulsion</span><span class="val" style="color:${prop.color}">${prop.name} · Isp ${prop.isp} s</span></div>` : ''}
      ${ss ? `
        <div class="info-row"><span class="key">Single-stage dry / prop / wet</span><span class="val">${fmtT(ss.dryMass_kg)} / ${fmtT(ss.propellantMass_kg)} / ${fmtT(ss.wetMass_kg)}</span></div>
        <div class="info-row"><span class="key">MR · ε_struct · prop frac</span><span class="val">${fmtR(ss.mass_ratio, 2)} · ${fmtR(ss.structural_eps, 3)} · ${fmtR(ss.prop_fraction, 3)}</span></div>
      ` : ''}
      ${rec?.two_stage_chemical ? `
        <div class="info-row"><span class="key">2-stage total prop / wet</span><span class="val">${fmtT(rec.two_stage_chemical.total_prop_kg)} / ${fmtT(rec.two_stage_chemical.total_wet_kg)}</span></div>
      ` : ''}
      <div class="info-row"><span class="key">Abstract budget (+10%)</span><span class="val green">${formatVelocity(rec?.abstract_budget_m_s)}</span></div>
      <ul class="vd-sketch">${sketch}</ul>

      <div class="result-subtitle" style="margin-top:10px">ISP SWEEP (dry = ${fmtT(design.reference_dryMass_kg)})</div>
      <div class="vd-table-wrap">
        <table class="vd-table">
          <thead><tr><th>Isp</th><th>MR</th><th>Prop</th><th>Wet</th><th>ε</th></tr></thead>
          <tbody>${ispRows}</tbody>
        </table>
      </div>
      <p class="vd-cap">Higher Isp shrinks prop mass exponentially via R = e^{Δv/(Isp g₀)}.</p>

      <div class="result-subtitle" style="margin-top:10px">DRY-MASS SWEEP (Isp = ${prop?.isp || 350} s)</div>
      <div class="vd-table-wrap">
        <table class="vd-table">
          <thead><tr><th>Dry</th><th>Prop</th><th>Wet</th><th>ε</th></tr></thead>
          <tbody>${dryRows}</tbody>
        </table>
      </div>
      <p class="vd-cap">Heavier dry structure demands more prop to keep the same mass ratio.</p>

      ${sens ? `
        <div class="result-subtitle" style="margin-top:10px">SENSITIVITY AT NEED</div>
        <div class="info-row"><span class="key">∂m_prop / ∂Δv</span><span class="val">${fmtT(sens.d_prop_per_km_s)} per km/s</span></div>
        <div class="info-row"><span class="key">Prop at Need</span><span class="val">${fmtT(sens.propellantMass_kg)}</span></div>
      ` : ''}

      <div class="result-subtitle" style="margin-top:10px">DESIGN SPACE SAMPLES (Isp × dry)</div>
      <div class="vd-table-wrap">
        <table class="vd-table">
          <thead><tr><th>Isp</th><th>Dry</th><th>Prop</th><th>ε</th></tr></thead>
          <tbody>${contour}</tbody>
        </table>
      </div>

      <div class="vd-actions">
        <button type="button" class="route-btn launch" id="vd-apply-abstract">Apply abstract budget (enable Launch)</button>
        ${rec?.starship_tankers_needed != null ? `
          <button type="button" class="route-btn secondary" id="vd-apply-tankers">Apply SS tanker-n (N=${rec.starship_tankers_needed})</button>
        ` : ''}
        <button type="button" class="route-btn secondary" id="vd-apply-high-energy">Use high-energy preset (15 km/s)</button>
      </div>
    </div>`;
}

/**
 * Apply recommended abstract budget so Capability ≥ Need and re-render plan.
 */
export function applyAbstractBudgetFromDesign(design) {
  const budget = design?.recommendation?.abstract_budget_m_s
    ?? (design?.need_dv_m_s != null ? Math.ceil(design.need_dv_m_s * 1.1 / 100) * 100 : null);
  if (budget == null || !isFinite(budget)) {
    notify('NO DESIGN BUDGET TO APPLY');
    return false;
  }
  state.vehicleId = 'abstract';
  state.abstractBudget_m_s = Math.max(500, Math.min(50000, budget));
  const veh = document.getElementById('vehicle-select');
  if (veh) veh.value = 'abstract';
  const abs = document.getElementById('abstract-budget');
  if (abs) {
    abs.disabled = false;
    abs.value = String(state.abstractBudget_m_s);
  }
  // Hide SS arch controls if present
  const arch = document.getElementById('starship-arch');
  if (arch) arch.disabled = true;

  // Persist last design multiples for notify / re-open lab
  state.lastVehicleDesign = design;

  const mt = design?.recommendation?.vs_sh_starship?.multiples_text;
  const feel = mt
    ? ` · ~${mt.propellant_mass} fuel · ~${mt.tank_volume} tanks · ~${mt.thrust_same_twr} SH thrust (paper)`
    : '';

  refreshPlanUi().then(() => {
    notify(`ABSTRACT ${(state.abstractBudget_m_s / 1000).toFixed(1)} KM/S${feel}`);
  });
  return true;
}

/**
 * Apply Starship tanker-n architecture to close Need when possible.
 */
export function applyTankerDesign(design) {
  const n = design?.recommendation?.starship_tankers_needed
    ?? design?.comparison?.tankers_needed_for_need;
  if (n == null) {
    notify('TANKER-N CANNOT CLOSE THIS NEED AT CURRENT CARGO');
    return false;
  }
  state.vehicleId = 'sh-starship';
  state.starshipArch = 'tanker-n';
  state.tankerCount = n;
  const veh = document.getElementById('vehicle-select');
  if (veh) veh.value = 'sh-starship';
  const arch = document.getElementById('starship-arch');
  if (arch) {
    arch.disabled = false;
    arch.value = 'tanker-n';
  }
  const tank = document.getElementById('tanker-count');
  if (tank) {
    tank.disabled = false;
    tank.value = String(n);
  }
  state.lastVehicleDesign = design;
  const tmt = design?.recommendation?.tanker_fleet_vs_sh_starship?.multiples_text;
  const feel = tmt
    ? ` · fleet ~${tmt.propellant_mass} SS-ship fuel · ~${tmt.tank_volume} tanks`
    : '';
  refreshPlanUi().then(() => {
    notify(`STARSHIP TANKER-N · N=${n}${feel}`);
  });
  return true;
}

export function applyHighEnergyPreset() {
  state.vehicleId = 'high-energy';
  const veh = document.getElementById('vehicle-select');
  if (veh) veh.value = 'high-energy';
  refreshPlanUi().then(() => {
    notify('HIGH-ENERGY PRESET (15 KM/S ABSTRACT) APPLIED');
  });
  return true;
}

/**
 * Bind action buttons inside a container that holds a design report.
 */
export function bindVehicleDesignActions(container, design) {
  if (!container || !design?.ok) return;
  const abs = container.querySelector('#vd-apply-abstract');
  if (abs) abs.onclick = () => applyAbstractBudgetFromDesign(design);
  const tk = container.querySelector('#vd-apply-tankers');
  if (tk) tk.onclick = () => applyTankerDesign(design);
  const he = container.querySelector('#vd-apply-high-energy');
  if (he) {
    he.onclick = () => {
      // Only useful if need ≤ 15 km/s
      if (design.need_dv_m_s > 15000) {
        notify('NEED > 15 KM/S — USE ABSTRACT BUDGET FROM DESIGN INSTEAD');
        applyAbstractBudgetFromDesign(design);
        return;
      }
      applyHighEnergyPreset();
    };
  }
}
