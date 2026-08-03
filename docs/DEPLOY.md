# HELIOS deploy checklist

**Product class:** industrial preliminary mission design — **not flight-certified**, not range safety, not live SPICE OD.

## Before every push

```bash
npm run precommit
# or
npm run release:check
```

`npm test` alone **skips** Playwright UI. Always run `precommit`.

## After green CI on `main`

### Classic Hosting (static SPA fallback)

```bash
npm run deploy:hosting
```

- Serves monorepo root with an ignore list (`firebase.json` → `hosting`).
- Never commit Admin SDK JSON (`*firebase-adminsdk*.json` is gitignored + hosting-ignored).

### App Hosting (primary URL)

```bash
npm run deploy:apphosting
# runs web:prepare (copy js/css/assets → web/public) + Next build + deploy
```

Primary: `https://helios--k-solar-system-navigator.us-central1.hosted.app`  
Fallback: `https://k-solar-system-navigator.web.app`

### After deploy

```bash
npm run smoke:live
```

Checks App Hosting (primary) then classic Hosting + Functions dense catalog.

## Dual-hosting discipline

| Surface | Source of truth |
|---------|-----------------|
| Classic Hosting | Live `js/`, `css/`, `assets/`, `index.html` at repo root |
| App Hosting | Copy via `web/scripts/prepare-spa-assets.mjs` → `web/public` |

If only Hosting is updated, App Hosting can lag. Prefer **both** when SPA/physics change; always App Hosting when `web/` API routes change.

## Secrets

- Service account JSON: local only, never commit.
- Client Firebase web config is public by design; security is rules.
- Local `server.js` C2/Ollama: loopback-only by default.

## Non-goals

- Global multi-leg tour optimizer (browser product stays local seeds).
- Live browser `.bsp` SPICE runtime.
- Flight certification claims.
