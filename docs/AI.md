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
