# Firebase backend for dense SPICE packs

HELIOS can serve dense ephemeris packs through the full Firebase stack while
keeping offline Hosting fallback for classroom / `?firebase=0`.

## Architecture

| Layer | Role |
|-------|------|
| **Storage** `ephemeris/dense-spk/*` | CDN for `.bin` + `.meta.json` + `registry.json` (public read) |
| **RTDB** `public/denseSpk/registry` | Fast public catalog index |
| **Firestore** `helios/denseSpkCatalog` | Same catalog (durable, queryable) |
| **Functions** `denseSpkCatalog` | HTTP health + catalog + Storage listing |
| **Functions** `refineWindowShortlist` | Score window shortlists; optional RTDB campaign save |
| **App Hosting** | Next shell + `/api/planning/window-shortlist` |
| **Classic Hosting** | SPA + local `assets/dense-spk/` fallback |

### Client load order (lazy packs)

1. Registry: RTDB → Firestore → Storage → Hosting `assets/dense-spk/registry.json`
2. Pack binary: Storage download URL → Hosting static path
3. Classroom / offline: Hosting only

## Upload packs (admin)

```bash
# Service account with Storage + RTDB + Firestore write
$env:GOOGLE_APPLICATION_CREDENTIALS="path\to\sa.json"
npm run upload:dense-spk
```

Deploy rules first:

```bash
npx firebase deploy --only storage,database,firestore:rules --project k-solar-system-navigator
npx firebase deploy --only functions --project k-solar-system-navigator
```

## Security model

- Dense packs are **public educational data** (not user secrets).
- Storage: `ephemeris/**` **read: true**, **write: false** (admin SDK only).
- User mission blobs stay **owner-only** under `users/{uid}/**`.
- Catalog write blocked for clients; Admin SDK / CI only.

## What each product is *not*

- Not flight-certified OD
- Not live SPICE `.bsp` in the browser
- Not a substitute for range safety

## Ops check

```
GET https://us-central1-k-solar-system-navigator.cloudfunctions.net/denseSpkCatalog
GET https://us-central1-k-solar-system-navigator.cloudfunctions.net/heliosHealth
GET https://helios--k-solar-system-navigator.us-central1.hosted.app/api/ephemeris/dense-spk
```

## App Hosting

- Catalog: `/api/ephemeris/dense-spk`
- Files: `/api/ephemeris/dense-spk/{packId}.bin` and `.meta.json`
- SPA still loads packs via Storage CDN first, then App Hosting API, then static `assets/dense-spk/`

## OPS UI

Flight-ops panel buttons:

- Prefetch Galilean / Titan / Triton / all Tier B
- Refresh catalog (clears cloud cache and reloads)
