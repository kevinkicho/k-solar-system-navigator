# HELIOS on Firebase App Hosting

> **HISTORICAL DESIGN NOTES** may mention classroom offline modes. As-built: no classroom mode;
> use `?firebase=0` for hermetic offline. Authoritative: [`docs/README.md`](./README.md), [`DEPLOY.md`](./DEPLOY.md).

| Field | Value |
|-------|--------|
| **Backend id** | `helios` |
| **Root dir** | `web/` |
| **Framework** | Next.js 15 (App Router) |
| **Plan** | Firebase **Blaze** required for App Hosting |
| **Product class** | Preliminary mission design — not flight-certified |

## Architecture

```text
┌─────────────────────────────────────────────┐
│  Firebase App Hosting (Cloud Run + Next.js) │
│  • SSR shell (metadata, product class)      │
│  • /api/health, /api/planning/*             │
│  • Serves /js /css /assets from public/     │
└──────────────────┬──────────────────────────┘
                   │ client boot
                   ▼
┌─────────────────────────────────────────────┐
│  HELIOS SPA (existing vanilla ESM)          │
│  • Three.js scene                           │
│  • Lambert / sample-DE / Plan Dossier       │
│  • Classroom ?mode=classroom stays offline  │
└─────────────────────────────────────────────┘
```

**Why not pure SSR of the planner?** Planning physics + Three.js are browser-first (Workers, WebGL). App Hosting SSR provides SEO, product shell, and server APIs; the interactive mission design app remains the client SPA.

## Commands

```bash
npm run web:prepare
npm run web:dev
npm run web:build
npx -y firebase-tools@latest deploy --only apphosting --project k-solar-system-navigator
```

Create backend once (if missing):

```bash
npx -y firebase-tools@latest apphosting:backends:create \
  --project k-solar-system-navigator \
  --backend helios \
  --primary-region us-central1 \
  --root-dir web
```

## Classic Hosting fallback

Root `index.html` + `firebase deploy --only hosting` still deploys the static SPA to `*.web.app` if App Hosting is unavailable (e.g. project not on Blaze).

## Honesty

App Hosting does **not** make HELIOS flight-certified. Server routes must not claim range safety, OD, or SpaceX performance warranty.
