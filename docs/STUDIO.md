# HELIOS Studio — campaign depth program

**Status:** Landed 2026-08 (first full pass)  
**Product class:** Preliminary industrial workstation — **not flight-certified**

Expands scope and depth without becoming GMAT/STK or a global tour optimizer.

## Results → HELIOS STUDIO panel

After compute, Results mounts:

1. AI readiness / next-actions / campaign log  
2. **HELIOS STUDIO** (`js/ui/studio-panel.js`)

| Control | Module |
|---------|--------|
| Window families | `js/physics/window-families.js` |
| Architecture matrix | `js/physics/architecture-matrix.js` |
| Pin / diff / clear pins | `js/physics/plan-pins.js` |
| Fidelity wizard | `js/physics/fidelity-presets.js` |
| Residuals | `js/physics/residual-dashboard.js` |
| DSM seed | `js/physics/dsm-nodes.js` |
| Campaign DAG | `js/agent/campaign-dag.js` |
| Playbooks | `js/agent/playbooks.js` + `playbook-runner.js` |
| Moon-system sketch | `js/physics/moon-system-sketch.js` |
| Stakeholder package v2 | `exportStakeholderPackage` in `mission-package.js` |
| Review link | `js/firebase/shared-plans.js` |

## Pillar coverage

| Pillar | Landed |
|--------|--------|
| **P1 Studio** | Window families, arch matrix, compare pins (3), stakeholder package v2 |
| **P2 Tour** | Expanded itinerary catalog, multi-objective rank weights, DSM sketch nodes, moon-system templates |
| **P3 AI OS** | Campaign DAG, playbooks, multi-role prompts (`roles.js`), tool surface |
| **P4 Trust** | Residual dashboard, fidelity wizard, launch geometry sketch in residual card |
| **P5 Collab** | Local + Firestore `shared_plans` review scaffold |

## Agent tools (C2 allowlist)

`get_window_families`, `get_architecture_matrix`, `pin_plan`, `diff_plan_pins`, `get_residual_dashboard`, `apply_fidelity_preset`, `run_campaign_dag`, `run_playbook`, `list_playbooks`, `get_moon_system_sketch`, `add_dsm_seed`  
(+ prior campaign / itinerary / watchdog tools)

## Honesty (non-negotiable)

- Local seeds ≠ global optima  
- DSM / n-body / plane-change = analysis sketches; Need authority remains Lambert/dossier unless documented opt-in  
- Vehicle matrix = educational models, not OEM warranty  
- Moon-system = not CR3BP  
- Review/package snapshots must be recomputed for authority  

## Tests

`tests/studio_depth.mjs` (in `npm run test:physics`)

## Still deferred (honest backlog)

- Full DAG visual editor / multi-user org ACLs  
- Headless public plan compute API  
- True free-return / multi-rev free-return design  
- DSM re-optimized multi-leg Lambert  
- Mobile-first companion app shell  
