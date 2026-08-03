# Firebase migration (as-built)

> **HISTORICAL DESIGN** � As-built product: industrial preliminary (not classroom). See [docs/README.md](./README.md).

HELIOS uses **client-side Firebase** with Security Rules. No secrets in the browser; Admin SDK JSON stays local/gitignored.

## Products

| Product | Path / use |
|--------|------------|
| **Auth** | Google popup (redirect fallback); `browserLocalPersistence` |
| **Firestore** | `users/{uid}` profile · `users/{uid}/plans/{id}` summaries · `users/{uid}/prefs/settings` |
| **RTDB** | `users/{uid}/lastRoute` one-click bookmark |
| **Storage** | `users/{uid}/plans/{id}.json` full mission export |
| **Hosting** | SPA root `public: "."` → https://k-solar-system-navigator.web.app |

## Offline / classroom

- `?mode=classroom` or `?firebase=0` → no Firebase init
- Firestore multi-tab IndexedDB cache when available

## Local admin

```bash
npm run firebase:smoke          # list Auth + plans
npm run firebase:seed           # seed demo Earth→Mars plan for first user
```

Service account: `k-solar-system-navigator-firebase-adminsdk-*.json` (gitignored).

## Deploy

```bash
firebase deploy --only firestore:rules,storage,database,hosting
```

Cloud Functions are **not** required for the SPA; `functions/` scaffold may remain untracked.

## Client modules

- `js/firebase/app.js` — init
- `js/firebase/auth.js` — Google auth
- `js/firebase/plans.js` — save/list/delete (+ strip `undefined`)
- `js/firebase/prefs.js` — prefs + profile
- `js/firebase/rtdb.js` — last route
- `js/firebase/storage-plans.js` — mission blobs
- `js/ui/firebase-ui.js` — chip, menu, Plan-tab list
