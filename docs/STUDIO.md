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

## Pass 2 (2026-08-03) — remaining recommendations

| Feature | Module / surface |
|---------|------------------|
| Need waterfall | `js/physics/need-waterfall.js` · Studio button · `get_need_waterfall` |
| Vehicle DoE | `js/physics/vehicle-doe.js` · cargo/tanker sweeps · `get_vehicle_doe` |
| Launch Geometry Card | `js/physics/launch-geometry-card.js` · `get_launch_geometry` |
| Sample-return sketch | `js/physics/free-return-sketch.js` · outbound+return Lamberts (not free-return OD) |
| Itinerary catalog UI | Studio · `get_itinerary_catalog` |
| AI eval harness | `js/agent/eval-harness.js` · golden NL parse + tool contracts |
| Multi-role FAB | Role picker + `roles.js` in system prompt |
| Companion mode | `?companion=1` · top-bar COMPANION · `set_companion_mode` |
| Headless rank API | `POST /api/planning/rank-candidates` (App Hosting + `server.js`) |
| Window calendar CSV | Studio export |
| Scenario library | studio-mars / studio-jupiter / studio-europa-io + companion demos |
| Horizons residual row | residual dashboard |
| Local reviews list | Studio · `listLocalReviews` |

## Pass 3 (2026-08) — R1 Trust · R2 Board · R3 Contracts

| Feature | Module |
|---------|--------|
| Path truth HUD | `js/physics/path-truth.js` · `js/ui/path-truth-hud.js` · Results strip |
| ARR/DEP epoch ghost labels | `route-orbit-visual` — path end, not live planet |
| Campaign board columns | Studio Windows / Arch / Pins / Gates |
| Apply window family | `js/ui/campaign-apply.js` · `apply_window_family` tool |
| Apply architecture row | `apply_architecture_row` tool |
| Contract suite | `tests/contracts_path_campaign.mjs` |
| Stakeholder path-truth chapter | mission-package stakeholder export |

### Scene path matrix (product)

| View | Scene path (fly study) | Need / Δv |
|------|------------------------|-----------|
| Cinematic | **visual** (exaggerated endpoints) | physical |
| Schematic | honors `pathGeometry` (default physical) | physical |
| ACCURATE / MAP | **physical** | physical |

## Still deferred (honest backlog)

- Full DAG visual editor / multi-user org ACLs with share tokens  
- Full Lambert compute on server (rank API is candidates-only)  
- True free-return corridor / multi-rev free-return OD  
- DSM re-optimized multi-leg Lambert  
- Native mobile app (companion mode is browser shell only)  
- Playwright Studio smoke (matrix apply · package)  

