# HELIOS design documents

Living index of product/architecture designs. Each design file keeps its original technical content (for history and rationale). **Status in the header table is authoritative for “is this landed?”**

**Last docs sweep:** 2026-07-17 · branch `main` @ geographic stack + post-landing hardening + UI declutter.

## As-built product snapshot

HELIOS on `main` is a **concept-grade educational** interplanetary trip planner (not flight ops, not SPICE, not SpaceX-certified). Landed capabilities include:

| Area | State |
|---|---|
| **Physics** | JPL Approximate Positions L1; dual-branch Lambert; multi-leg GA; porkchop; mission parking; Need/Capability/Margin |
| **Fidelity** | L1 default; L2-compare Horizons opt-in; L2-plan offline samples; L3 out of scope |
| **Reliability** | Plan Dossier + quality gates; Launch blocked unless `launch_enabled` / `mission_ready` |
| **Vehicles** | Product default unrefueled SH+SS; F9 C₃ table; abstract budgets; Vehicle Lab |
| **Geographic sites** | Planetocentric lat/lon/*h*; 1-bar giants; oblate *R*(φ); ICRF pole + *W(t)* (+ Moon/Mercury libration); share `os`/`ds`; multi-leg terminals |
| **Server / agent** | Loopback static + Ollama proxy; FAB chat stream; CLI + C2 claim/lease; optional API token |
| **UI** | Inspect/Plan/Results rail; Advanced accordion; results hero; body picker + dossier modal; map-first mobile chips |
| **Tests** | `npm test` = physics + server path jail + agent API + snapshot/launch contracts; `npm run test:ui:ci` Playwright |

## Document catalog

| Document | Status | Topic |
|---|---|---|
| [trip-planner-design.md](./trip-planner-design.md) | **Implemented** (evolutionary product redesign) | Catalog, share, vehicles, display modes, foundation |
| [cargo-vehicle-platform-design.md](./cargo-vehicle-platform-design.md) | **Implemented** | Need/Capability/Margin, F9/SS cargo arches |
| [ephemeris-fidelity-platform-design.md](./ephemeris-fidelity-platform-design.md) | **Implemented** | L1 / L2-compare / L2-plan badges + provider |
| [trip-plan-reliability-completeness-design.md](./trip-plan-reliability-completeness-design.md) | **Implemented** | Plan Dossier, gates, recovery |
| [concept-grade-and-extras-design.md](./concept-grade-and-extras-design.md) | **Implemented** (X0–X8 extras) | Trust Card, DLA eq, Vehicle Lab, scenario audit, ascent |
| [post-landing-hardening-design.md](./post-landing-hardening-design.md) | **Implemented** | Server security, C2 honesty, workers, dual audit, streaming FAB |
| [geographic-site-coordinates-design.md](./geographic-site-coordinates-design.md) | **Implemented** (full residual stack) | Body-fixed geographic sites, spin, share, multi-leg terminals |

## Remaining items (honest backlog)

These are **intentionally out of product scope** or large future upgrades—not unfinished v1 work:

| Item | Why deferred |
|---|---|
| Full SPICE / DE kernels / OD covariance | Fidelity L3; ops-scale assets |
| Complete lunar *W(t)* series (100+ terms) | Concept-grade keeps leading Archinal-class terms |
| Oblate planetographic as sole global default | Planetocentric remains math primary |
| Intermediate multi-leg flyby geographic sites | Terminals only by design |
| Global multi-leg optimal search | Coarse local seed only; labeled honest |
| Flight-certified vehicle / range-safety products | Concept-grade vow |
| TypeScript / big rewrite | Evolutionary vanilla ESM by policy |

Small polish (optional, not blocking): About modal may still under-mention geographic sites; trust-card copy can cite CS id; dual screenshots could be refreshed.

## Reading order for newcomers

1. This index  
2. `trip-planner-design.md` (product shape)  
3. `cargo-vehicle-platform-design.md` + `ephemeris-fidelity-platform-design.md`  
4. `trip-plan-reliability-completeness-design.md` + `concept-grade-and-extras-design.md`  
5. `post-landing-hardening-design.md`  
6. `geographic-site-coordinates-design.md`  

## Branch policy

**`main` only** — sequential green commits; secrets never committed (`.env` gitignored).
