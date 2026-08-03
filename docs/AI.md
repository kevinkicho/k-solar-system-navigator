# HELIOS AI core

**Status:** Product center (2026-08)  
**Not flight-certified.** AI co-pilot only — Lambert/Need are authoritative.

## Architecture

```
┌──────────── browser ────────────┐     ┌────── proxy ──────┐     ┌── Ollama Cloud ──┐
│ Top-bar chip · FAB · Results    │────▶│ /api/models       │────▶│ GET /api/tags    │
│ mission-context.js              │     │ /api/chat         │     │ POST /api/chat   │
│ tools → onboard C2 executor     │     │ (Node or Next)    │     │ Bearer API key   │
└─────────────────────────────────┘     └───────────────────┘     └──────────────────┘
```

| Host | Proxy |
|------|--------|
| Local `npm start` | `server.js` |
| App Hosting primary | `web/app/api/{models,chat}/route.ts` |
| Classic Hosting only | No AI unless local server or App Hosting |

## Secrets

- Local: `.env` → `OLLAMA_API_KEY`, optional `OLLAMA_MODEL`
- App Hosting: create secret `OLLAMA_API_KEY`, uncomment in `web/apphosting.yaml`

## Key modules

| File | Role |
|------|------|
| `js/agent/models.js` | Catalog client + localStorage model |
| `js/agent/mission-context.js` | Rich plan context + next actions |
| `js/agent/ai-core.js` | chatComplete / chatStream / brief |
| `js/ui/ai-chrome.js` | Top-bar chip + Results strip |
| `js/ui/agent-chat.js` | FAB assistant |
| `js/agent/tools.js` | Tool defs including `get_mission_brief_context` |

## Honesty contract

1. AI must not override Need/Δv from physics.
2. READY/NO-GO remains dossier-gated.
3. Prompts inject live context and always restate preliminary / not certified.

## Campaign & recovery tools

| Tool | Effect |
|------|--------|
| `run_mission_campaign` | Origin/dest/date/vehicle/site → compute (+ optional GA/windows) |
| `run_campaign_with_log` | Staged campaign + step log + optional approve gates |
| `propose_gate_recovery` | List recovery options from fails |
| `apply_gate_recovery` | Apply one recovery + recompute |
| `find_nearest_window` | Nearest feasible seed + recompute |
| `suggest_ga` | Open SUGGEST GA search |
| `suggest_itineraries` | Intelligent multi-leg tour seeds |
| `apply_itinerary` | Accept seed from last itinerary pack |
| `get_watchdogs` / `apply_watchdog_action` | Readiness / path / fidelity fixes |

NL heuristic: `parseCampaignHint()` pre-parses “Earth Mars 2028 2t Starship Cape”.

## Memory & usage

- Session turns: `js/agent/memory.js` (localStorage + Firestore `users/{uid}/ai_memory/latest`)
- Token/time HUD: `js/agent/usage-session.js` (Ollama usage fields)

## Intelligent itineraries

| UI / tool | Role |
|-----------|------|
| **SUGGEST ITINERARY** (`btn-itinerary-suggest`) | Named multi-leg tour templates + local patched-conic evaluation |
| `suggest_itineraries` / `apply_itinerary` | Agent tools (C2 + FAB Tools) |
| `js/physics/itinerary-suggest.js` | Template library + ranking |
| `js/ui/itinerary-ui.js` | Accept / Keep panel + AI itinerary coach |

Honesty: **local multi-leg seeds only** — not a global tour optimizer, not flight-certified.

## Campaign run log & approve gates

| Module | Role |
|--------|------|
| `js/agent/campaign-runner.js` | Step log + optional human approve bar |
| `run_campaign_with_log` | Tool for staged campaign with approvals |
| Results strip | Renders `#ai-campaign-log` |

## Watchdogs (readiness / path / fidelity)

| Module | Role |
|--------|------|
| `js/agent/watchdogs.js` | Always-on alerts + deterministic Fix actions |
| Results `#ai-readiness-strip` | Visual + Fix buttons |
| Tools `get_watchdogs` / `apply_watchdog_action` | Agent access |

## Studio tools (depth program)

See [STUDIO.md](./STUDIO.md). Highlights:

| Tool | Effect |
|------|--------|
| `get_window_families` | Cluster shortlist into seasons |
| `get_architecture_matrix` | SS/F9 trades vs Need |
| `pin_plan` / `diff_plan_pins` | Compare up to 3 snapshots |
| `get_residual_dashboard` | Path / n-body / launch geometry trust |
| `apply_fidelity_preset` | Product pipeline wizard |
| `run_campaign_dag` | Branching campaign (arch + recover + windows) |
| `run_playbook` / `list_playbooks` | Named ladders |
| `get_moon_system_sketch` | Same-SOI templates (not CR3BP) |
| `add_dsm_seed` | Educational DSM Need sketch |

Multi-role prompts: `js/agent/roles.js` (navigator / vehicle / fidelity / ops / orchestrator).

## Narratives

- Porkchop shortlist → **AI window narrative**
- GA pack → **GA coach** (auto after SUGGEST GA)
- Itinerary pack → **Itinerary coach** (auto after SUGGEST ITINERARY)
- Results → **Dual critics** (physics / vehicle / ops)
- Results → **Red-team** (devil’s advocate)
- FAB → **Personality** industrial | coach (tone only; physics unchanged)
- Results → **HELIOS STUDIO** panel (families, matrix, pins, DAG, playbooks)

## Production AI paths

| Host | Proxy |
|------|--------|
| `npm start` | `server.js` `/api/chat` `/api/models` |
| App Hosting | Next `web/app/api/{chat,models}` + secret `OLLAMA_API_KEY` |
| Classic Hosting | Cloud Functions `heliosAiChat` / `heliosAiModels` (set `OLLAMA_API_KEY` on functions) |

```bash
# Functions secret (example)
firebase functions:secrets:set OLLAMA_API_KEY
# or env on deploy machine
```
