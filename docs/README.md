# HELIOS design documents

Living index of product/architecture designs. Each design file keeps its original technical content (for history and rationale). **Status in the header table is authoritative for “is this landed?”**

**Last docs sweep:** 2026-07-29 · branch `main` @ dense SPK + L3-plan bake + Firebase delivery + release-grade classroom pack.

## As-built product snapshot

HELIOS on `main` is a **concept-grade educational** interplanetary trip planner (not flight ops, not live SPICE `.bsp`, not SpaceX-certified). Landed capabilities include:

| Area | State |
|---|---|
| **Physics** | JPL Approximate Positions L1; dual-branch Lambert; multi-leg GA; porkchop; mission parking; Need/Capability/Margin |
| **Fidelity** | Classroom **L1**; product **L2-plan** sample table (promotes **L3-plan** when DE440s/SPICE-baked); optional Horizons L2-compare/inject; **dense SPK** Float32 packs (Hosting / Storage / App Hosting) — not live `.bsp` |
| **Reliability** | Plan Dossier + quality gates; Launch blocked unless `launch_enabled` / `mission_ready` |
| **Vehicles** | Product default unrefueled SH+SS; F9 C₃ table; abstract budgets; Vehicle Lab |
| **Geographic sites** | Planetocentric lat/lon/*h*; 1-bar giants; oblate *R*(φ); ICRF pole + *W(t)* (+ Moon/Mercury libration); share `os`/`ds`; multi-leg terminals |
| **Cloud** | Auth; Firestore plans; RTDB last-route + window campaigns; Storage dense packs; Functions shortlist/catalog; App Hosting SSR shell |
| **Server / agent** | Loopback static + Ollama proxy; FAB chat stream; CLI + C2 claim/lease; optional API token |
| **UI** | Inspect/Plan/Results rail; campaign steps; OPS review; mission package export; map-first mobile chips |
| **Tests** | `npm run precommit` = full CI mirror; `npm run release:check` (+ `--live` smoke); `npm test` alone skips UI |

## Document catalog

| Document | Status | Topic |
|---|---|---|
| [trip-planner-design.md](./trip-planner-design.md) | **Implemented** (evolutionary product redesign) | Catalog, share, vehicles, display modes, foundation |
| [cargo-vehicle-platform-design.md](./cargo-vehicle-platform-design.md) | **Implemented** | Need/Capability/Margin, F9/SS cargo arches |
| [ephemeris-fidelity-platform-design.md](./ephemeris-fidelity-platform-design.md) | **Implemented** (+ L3-plan bake + dense SPK as follow-on) | L1 / L2-compare / L2-plan / L3-plan badges + provider |
| [firebase-dense-spk.md](./firebase-dense-spk.md) | **Implemented** | Dense SPK Storage / RTDB / Functions / App Hosting delivery |
| [dense-spice-storage-budget.md](./dense-spice-storage-budget.md) | **Implemented** | Pack size tiers A/B |
| [trip-plan-reliability-completeness-design.md](./trip-plan-reliability-completeness-design.md) | **Implemented** | Plan Dossier, gates, recovery |
| [concept-grade-and-extras-design.md](./concept-grade-and-extras-design.md) | **Implemented** (X0–X8 extras) | Trust Card, DLA eq, Vehicle Lab, scenario audit, ascent |
| [post-landing-hardening-design.md](./post-landing-hardening-design.md) | **Implemented** | Server security, C2 honesty, workers, dual audit, streaming FAB |
| [geographic-site-coordinates-design.md](./geographic-site-coordinates-design.md) | **Implemented** (full residual stack) | Body-fixed geographic sites, spin, share, multi-leg terminals |
| [trajectory-accuracy-design.md](./trajectory-accuracy-design.md) | **Draft** | Trajectory render/propagation accuracy (Phases 1–4): frames, sampling, multi-rev, n-body overlay |

## Remaining items (honest backlog)

**v1 product residuals:** trajectory ship–line frame consistency and related accuracy work — see [trajectory-accuracy-design.md](./trajectory-accuracy-design.md). Release polish (demo links, mission package, campaign compare, precommit/release-check) landed 2026-07-29.

### Concept-grade incorporation of former non-goals

| Former non-goal | How HELIOS incorporates it (honestly) |
|---|---|
| SPICE / DE as live browser kernels | **Not live `.bsp`.** **L3-plan** = offline DE440s-baked sample JSON; **dense SPK** = pre-baked Float32 tables (CDN/Hosting) |
| Certified OD / covariance | Still out of scope — Trust Card completeness confidence only |
| Full lunar *W(t)* | Leading Archinal-class libration (Moon/Mercury) — not 100+ terms |
| Planetographic default | Optional **input mode** on oblate bodies; math stays planetocentric |
| Intermediate flyby sites | **Done** — GEO toggle per flyby row |
| Global multi-leg optimum | **Thorough local seed** (denser grid) still not global opt; labeled in UI/About |
| Flight-certified vehicles / range safety | Illustrative vehicles + edu DLA site bands — never certified / never range safety |
| TypeScript rewrite | Still non-goal (vanilla ESM) |

### Still true ops out-of-scope

| Item | Why |
|---|---|
| Live ship SPICE `.bsp` / formal covariance OD | Ops-scale; browser loads JSON/Float32 only |
| Range-safety products | Not flight ops |
| Global multi-leg optimal design | Research-grade; not a browser product mode |

## Reading order for newcomers

1. This index  
2. `trip-planner-design.md` (product shape)  
3. `cargo-vehicle-platform-design.md` + `ephemeris-fidelity-platform-design.md`  
4. `trip-plan-reliability-completeness-design.md` + `concept-grade-and-extras-design.md`  
5. `post-landing-hardening-design.md`  
6. `geographic-site-coordinates-design.md`  

## Branch policy

**`main` only** — sequential green commits; secrets never committed (`.env` gitignored).
