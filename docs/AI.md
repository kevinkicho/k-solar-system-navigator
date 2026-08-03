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
| `propose_gate_recovery` | List recovery options from fails |
| `apply_gate_recovery` | Apply one recovery + recompute |
| `find_nearest_window` | Nearest feasible seed + recompute |
| `suggest_ga` | Open SUGGEST GA search |

NL heuristic: `parseCampaignHint()` pre-parses “Earth Mars 2028 2t Starship Cape”.

## Memory & usage

- Session turns: `js/agent/memory.js` (localStorage + Firestore `users/{uid}/ai_memory/latest`)
- Token/time HUD: `js/agent/usage-session.js` (Ollama usage fields)

## Narratives

- Porkchop shortlist → **AI window narrative**
- GA pack → **GA coach** (auto after SUGGEST GA)
- Results → **Dual critics** (physics / vehicle / ops)

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
