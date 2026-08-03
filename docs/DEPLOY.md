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
# runs web:prepare then deploys only web/public
```

- **Serves prepared SPA only:** `firebase.json` → `hosting.public: "web/public"`.
- Kernels are stripped during prepare (never public).
- Never commit Admin SDK JSON.

### App Hosting (primary URL)

```bash
npm run deploy:apphosting
# runs web:prepare (copy js/css/assets → web/public) + Next build + deploy
```

Primary: `https://helios--k-solar-system-navigator.us-central1.hosted.app`  
Fallback: `https://k-solar-system-navigator.web.app`

### Both surfaces (preferred release)

```bash
npm run deploy:all
# or: npm run deploy:hosting && npm run deploy:apphosting
```

Ensure both URLs show the same commit in build identity / `helios-build.json` after App Hosting prepare.

### After deploy

```bash
npm run smoke:live
npm run smoke:build-sha   # dual-surface git_sha / main hash when available
```

### Hosting ignore hygiene

```bash
npm run web:prepare
npm run check:hosting-ignore
```

Checks App Hosting (primary) then classic Hosting + Functions dense catalog.

## Dual-hosting discipline

| Surface | Source of truth |
|---------|-----------------|
| Classic Hosting | **Prepared SPA only** — `npm run web:prepare` → `web/public` (no monorepo root) |
| App Hosting | Same prepare + Next shell (`web/`) |

If only Hosting is updated, App Hosting can lag. Prefer **both** when SPA/physics change; always App Hosting when `web/` API routes change.

## Secrets

- Service account JSON: local only, never commit.
- Client Firebase web config is public by design; security is rules.
- Local `server.js` C2/Ollama: loopback-only by default.

## Non-goals

- Global multi-leg tour optimizer (browser product stays local seeds).
- Live browser `.bsp` SPICE runtime.
- Flight certification claims.
