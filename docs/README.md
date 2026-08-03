# HELIOS design documents

Living index of product/architecture designs. Each design file keeps historical technical content. **Header status + this index are authoritative for “is this landed?”**

**Last docs sweep:** 2026-08-02 · live planning pipeline · mock/concept UI hidden · ACCURATE path restore · pathSampleGeometry.

## As-built product snapshot

HELIOS on `main` is an **industrial preliminary mission-design workstation** (not flight-certified, not live SPICE `.bsp`, not SpaceX performance warranty).

| Area | State |
|---|---|
| **Physics** | Dual-branch Lambert; multi-leg patched-conic GA; porkchop; Need/Capability/Margin; asymptote/DLA/dogleg |
| **Fidelity** | Live pipeline: **L2-plan** sample-DE → **L3-plan** DE440s bake; **live Horizons** inject opt-in; dense SPK packs |
| **UI honesty** | Mock abstract vehicles / legacy-demo / L1 approx / visual-only path **hidden** from product UI |
| **Path honesty** | Shared `transfer-path`; default `pathGeometry: physical`; adaptive densify ON; ghosts `match_path_end` |
| **GA** | Manual +FLYBY; **SUGGEST GA** Accept/Keep; coarse/thorough local seeds; named dual templates |
| **Reliability** | Plan Dossier gates; Launch / Fly study blocked without `mission_ready` |
| **Cloud** | Auth; Firestore plans; RTDB campaigns; Storage dense packs; App Hosting + Functions |
| **Tests** | `npm run precommit` = physics + server + agent + Playwright; `release:check` optional live smoke |
| **Classroom mode** | **Removed** (2026-07-30). `?firebase=0` remains for hermetic offline/CI only |

## Document catalog

| Document | Status | Topic |
|---|---|---|
| [DEPLOY.md](./DEPLOY.md) | **Current** | Precommit + dual-hosting deploy checklist |
| [trip-planner-design.md](./trip-planner-design.md) | **Implemented** (historical PR narrative) | Catalog, share, vehicles, foundation |
| [cargo-vehicle-platform-design.md](./cargo-vehicle-platform-design.md) | **Implemented** | Need/Capability/Margin, F9/SS |
| [ephemeris-fidelity-platform-design.md](./ephemeris-fidelity-platform-design.md) | **Implemented** (+ L3-plan + dense SPK) | Fidelity badges + provider |
| [firebase-dense-spk.md](./firebase-dense-spk.md) | **Implemented** | Dense SPK delivery |
| [dense-spice-storage-budget.md](./dense-spice-storage-budget.md) | **Implemented** | Pack size tiers |
| [trip-plan-reliability-completeness-design.md](./trip-plan-reliability-completeness-design.md) | **Implemented** | Plan Dossier gates |
| [concept-grade-and-extras-design.md](./concept-grade-and-extras-design.md) | **Implemented** | Trust Card, asymptote, Vehicle Lab |
| [post-landing-hardening-design.md](./post-landing-hardening-design.md) | **Implemented** | Server security, C2, workers |
| [geographic-site-coordinates-design.md](./geographic-site-coordinates-design.md) | **Implemented** | Body-fixed sites |
| [trajectory-accuracy-design.md](./trajectory-accuracy-design.md) | **Implemented** (PR1–PR11 + residuals) | Ship–path pipeline |
| [firebase-app-hosting.md](./firebase-app-hosting.md) | **Implemented** | Next.js shell |
| [firebase.md](./firebase.md) | **Implemented** | Auth/plans offline flags |

Historical sections may still mention classroom mode or “educational product.” Treat those as **design history**. Runtime product is industrial preliminary.

## Remaining backlog (honest)

| Item | Note |
|---|---|
| Global multi-leg tour optimizer | **Non-goal** for browser SPA |
| Live `.bsp` in browser | **Non-goal** |
| Multi-rev goldens / soak | Flag ON; deeper goldens optional |
| Hosting serve `web/public` only | **Landed** — `hosting.public: web/public` + prepare |
| Expanded Playwright multi-leg | **Landed** — `test:ui:multileg` in precommit |
| Dual-URL build-sha smoke | `npm run smoke:build-sha` after deploy |

## Branch policy

**`main` only** — sequential green commits; secrets never committed.
