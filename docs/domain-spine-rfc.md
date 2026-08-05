# RFC: Domain Spine — PlanSeed · one apply · one result · one bus

**Status:** Phase 1 landed (2026-08-05) · further phases proposed  
**Product class:** Preliminary industrial workstation — not flight-certified  
**Goal:** Replace parallel apply/orchestrator paths and god-state sprawl with a thin domain core, without becoming GMAT/STK.

---

## 1. Problem statement

HELIOS grew by passes: share apply, reapply, agent DOM automation, campaign-object / DAG / runner, dual path geometry, dual hosting. Physics honesty is strong; **product architecture is not**.

| Symptom | Root |
|---------|------|
| Undo / share / AI restore plans differently | 3+ apply paths, 2 plan schemas |
| “Campaign” means 3 things | Parallel runtimes + naming façade |
| Two arcs on screen | Dual path geometry (visual vs physical) as permanent special case |
| AI tools click buttons | No command bus |
| Dual deployables | SPA + Next copy of SPA |

---

## 2. Non-goals

- Rewrite physics solvers or Three.js scene from scratch  
- Full React/Vue migration as a prerequisite  
- Flight certification, CR3BP, live `.bsp` OD, org ACLs  
- Killing cinematic presentation mode  

---

## 3. Target mental model

```
┌────────────── UI / Agent / Share / Undo ──────────────┐
│  intent only (buttons, NL tools, hash, timeline)       │
└─────────────────────┬────────────────────────────────┘
                      │ PlanCommand
                      ▼
┌──────────────── Domain spine ────────────────────────┐
│  PlanSession                                         │
│    seed: PlanSeed          (authority for recompute) │
│    result: PlanResult|null (solve + assessment)      │
│    history: HistoryEntry[] (undo/redo)               │
│    workflow: optional run log / DAG nodes            │
│  applyPlanSeed(seed) → mutates session, optional     │
│  computePlan()       → PlanResult                    │
└───────────┬─────────────────────┬────────────────────┘
            │                     │
            ▼                     ▼
     physics/* (pure)      projectors
     ephemeris adapters    ui/* · scene/* · path-truth
```

**Authority rules (unchanged product law):**

1. **Need / dossier / Lambert** own numbers.  
2. Stored Δv in history/package is **digest only** — recompute from `PlanSeed`.  
3. AI never invents Δv.  
4. Scene may use a **display projection**; it must never redefine Need.

---

## 4. Core types (normative)

Single internal shape. Codecs adapt at edges (URL hash, Firestore, clipboard).

### 4.1 `PlanSeed` (v3)

```ts
/** Internal only — not the share hash bitfield. */
interface PlanSeed {
  schema: 3;
  originId: string;          // catalog id
  destId: string;
  depIso: string;            // YYYY-MM-DD UTC
  tofDays?: number | null;   // ignored when flybys.length > 0
  flybys: Array<{ bodyId: string; dateIso: string }>;
  vehicle: {
    id: string;              // sh-starship | falcon9 | abstract | …
    arch?: 'unrefueled' | 'tanker-n' | 'legacy-demo' | null;
    tankers?: number;
    cargoKg?: number;
    falcon9Variant?: 'expendable' | 'asds';
    abstractBudget_m_s?: number;
  };
  ephemeris: 'sample-de' | 'approx';
  launchSiteId?: string;
  originSite?: SurfacePoint | null;
  destSite?: SurfacePoint | null;
  costBasis?: 'helio' | 'mission';
  // display preference is NOT on the seed — lives on DisplayPrefs
}
```

**Migration:**

| Today | v3 field |
|-------|----------|
| `o` / `originId` | `originId` |
| `d` / `destId` | `destId` |
| `dep` / `depDate` | `depIso` |
| `fb[]` / `flybys[]` | `flybys[]` with `dateIso` |
| `veh` / `vehicleId` | `vehicle.id` |
| `arch` / `starshipArch` | `vehicle.arch` |
| share `v=1` hash | codec only — still writes compact URL form |

### 4.2 `PlanResult`

```ts
interface PlanResult {
  schema: 1;
  seedDigest: string;        // hash of PlanSeed used
  computedAt: string;        // ISO
  solve: {
    ok: boolean;
    isMultiLeg: boolean;
    departureSimTime: number;
    arrivalSimTime: number;
    transferTime_s: number;
    legs?: unknown[];        // existing multi-leg structure initially
    // raw orbits kept private to physics adapters early on
  };
  assessment: {
    need_dv_m_s: number | null;
    margin_dv_m_s: number | null;
    feasible: boolean | null;
    dossier: { status; mission_ready; gates; … };
  };
  displayHints: {
    pathTruth?: PathTruth;
    visualFallback?: string | null;
  };
  product_class: 'preliminary-not-flight-certified';
}
```

### 4.3 `DisplayPrefs` (not seed)

Named **product modes** replace combinatorial knobs for 90% of users:

| Mode | Scene path | Frames | Dual overlay | Use |
|------|------------|--------|--------------|-----|
| **Present** (default) | visual* | cinematic | no | demos / fly study |
| **Analyze** | physical | schematic | no | Need-aligned work |
| **Compare** | physical primary | schematic | yes (amber twin) | honesty map |
| **Ops** | physical | schematic | optional | flight-ops analysis |

\*Present may later become “physical + same tilt transform” (one orbit); until then, document Present as *display orbit*.

Raw `pathGeometry` / `physicsAccurate` / `mapMode` become **Advanced overrides** that set a mode.

### 4.4 `PlanCommand`

```ts
type PlanCommand =
  | { type: 'SET_SEED'; seed: Partial<PlanSeed> }
  | { type: 'APPLY_SEED'; seed: PlanSeed; compute?: boolean }
  | { type: 'COMPUTE' }
  | { type: 'UNDO' | 'REDO' | 'JUMP'; index?: number }
  | { type: 'RUN_WORKFLOW'; id: 'dag' | 'linear'; opts?: object }
  | { type: 'SET_MODE'; mode: 'present' | 'analyze' | 'compare' | 'ops' };
```

---

## 5. Target file tree

```
js/
  domain/                      # NEW — pure-ish, no DOM
    plan-seed.js               # normalize, validate, digest, fromState
    plan-session.js            # seed, result, history, cursor
    plan-apply.js              # apply seed → session (no compute)
    plan-compute.js            # session → physics → PlanResult
    plan-commands.js           # dispatch(PlanCommand)
    plan-codecs/
      share-v1.js              # hash ↔ PlanSeed (wrap share-codec)
      campaign-v2.js           # legacy campaign object ↔ PlanSeed
    display-modes.js           # Present/Analyze/Compare/Ops presets
    types.js                   # JSDoc typedefs (TS later)

  physics/                     # keep — solvers stay here
  scene/                       # projectors only
  ui/                          # intent → dispatch; render from session
  agent/                       # tools → dispatch only
```

**Delete / collapse (after migration):**

| Today | Fate |
|-------|------|
| `ui/plan-reapply.js` | → `domain/plan-apply.js` + thin UI binder |
| `ui/review-recompute.js` | → codec + `APPLY_SEED` + `COMPUTE` |
| `ui/share.js` `applyPlanRequest` | → codec + command |
| `agent/campaign-object.js` | → `plan-session` history |
| `agent/campaign-dag.js` + `campaign-runner.js` + `plan-flow.js` | → one `domain/workflow-runner.js` with two strategies |
| `agent/campaign.js` DOM clicks | → commands only |
| Parallel `o`/`originId` seeds | internal only `PlanSeed` v3 |

Keep UI files as **views**; move authority out.

---

## 6. Migration phases

### Phase 0 — Document dual path (this RFC) · **done when published**

Explain why two arcs appear (see §8). No behavior change required.

### Phase 1 — Spine without rewrite · **LANDED 2026-08-05**

1. ✅ `js/domain/plan-seed.js` — normalize + build + digest  
2. ✅ `js/domain/plan-session.js` — façade over campaign-object  
3. ✅ `js/domain/plan-commands.js` — APPLY_SEED / COMPUTE / UNDO / REDO / JUMP / RUN_WORKFLOW  
4. ✅ `js/domain/plan-apply.js` — single reapply implementation  
5. ✅ Timeline + review-recompute use `dispatchPlanCommand`  
6. ✅ `ui/plan-reapply.js` re-exports domain (compat)  
7. ⏳ Share `applyPlanRequest` still legacy path (Phase 1.5: wrap)  
8. ⏳ Agent DOM clicks (Phase 2)  

**Exit (partial):** timeline/review use command bus; share apply still dual until Phase 1.5.

### Phase 2 — Kill DOM agent (1 week)

1. Replace `campaign.js` / `onboard.js` `getElementById` / `.click()` with commands.  
2. Tool goldens run against a **mock dispatcher** (record commands), not string allowlists only.  
3. `waitForPlan` listens to session events, not only CustomEvent soup (keep events as adapter).

### Phase 3 — Display modes (1 week)

1. Implement `display-modes.js`; wire MAP / ACCURATE / default to modes.  
2. Dual overlay **only** in Compare (and Advanced both).  
3. Path-truth HUD becomes secondary; mode badge is primary.  
4. Optional follow-up: Present = physical samples × cinematic inclination transform (single orbit).

### Phase 4 — PlanResult boundary (ongoing)

1. Adapters produce `assessment` from dossier without UI grepping six field paths.  
2. Packages/export store `seed` + `result.assessment` digest; recompute always.

### Phase 5 — Deployable (separate track)

1. Declare **one** primary host; other is mirror or kill.  
2. Stop hand-copy as architecture; CI asserts hash equality if mirror kept.

---

## 7. What to delete first (order matters)

1. **Public dual apply** — make `reapplyPlanRequest` / `applyPlanRequest` wrappers of one command.  
2. **Agent button clicks** — highest bug surface.  
3. **plan-flow façade-only file** once workflow-runner exists (façade can stay as 5-line re-export).  
4. **Raw pathGeometry in product chrome** — demote to Advanced after modes.  
5. **Do not delete** physics dual geometry builder until Present uses one projection.

---

## 8. Why two trajectories appear (product + code)

### 8.1 Intentional dual-geometry overlay

HELIOS can draw **two different polylines** for one trip:

| Arc | Geometry | Color (approx) | Meaning |
|-----|----------|----------------|---------|
| **Primary** | `scenePathGeometry()` | cyan | What the fly-study ship follows |
| **Overlay twin** | the other of visual/physical | dim amber/orange | Honesty: Need vs scene |

Code: `js/ui/route-orbit-visual.js` — `wantDual` when:

- **MAP mode** on, or  
- **ACCURATE / physicsAccurate** on, or  
- Advanced **Path geometry = Both**

```text
wantDual = physicsAccurate || mapMode || pathGeometry === 'both'
```

Then:

- Primary from `scenePathGeometry()` (cinematic → often **visual**; schematic/ACCURATE → **physical**)
- Twin via `setPhysicalTransferLine` with the opposite geometry

**Need / Δv always use physical** (Lambert + ephemeris). The second arc is **not** a second mission.

### 8.2 Why “visual” ≠ “physical”

- **Physical:** true inclinations / Need-honest Lambert path (near ecliptic for many Earth–Mars class trips).  
- **Visual:** exaggerated endpoints so the arc matches **cinematic planet tilts** (×8-class display).  

Without visual primary in cinematic mode, the blue path looks “stuck on Earth’s orbital plane” while planets sit on exaggerated tilts. That was a real product bug; dual geometry is the current fix.

### 8.3 When you should see only one arc

| Mode | Expected arcs |
|------|----------------|
| Default cinematic (Present) | **One** cyan path (visual scene path) |
| Schematic Analyze | **One** physical path |
| MAP / ACCURATE / Both | **Two** (cyan + amber) |
| Multi-leg flybys | **One arc per leg** (not dual geometry — sequential legs) |

If you see two arcs in default cinematic:

1. MAP or ACCURATE still on (top bar / view badge).  
2. Advanced **Path geometry** left on **Both**.  
3. Confusing **ribbon tube + dashed line** (same geometry, two meshes) — looks like a double stroke, not two solutions.  
4. Multi-leg: Venus flyby → Earth→Venus + Venus→Mars = two legs.

### 8.4 Domain-spine fix for dual arcs

| Short term | Label modes: Present = 1 arc; Compare = 2 arcs. Badge always visible. |
| Long term | One orbit sample + **display transform** for Present so visual/physical are projections of one solve, not two Lambert constructions. |

---

## 9. Testing contract

| Test | Asserts |
|------|---------|
| `domain_plan_seed` | normalize share parse ↔ seed; flybys round-trip |
| `domain_plan_commands` | APPLY_SEED + COMPUTE produce assessment fields |
| `tool_goldens` mock dispatch | ladders emit expected command sequences |
| `ci_ui` | Present → ≤1 transfer line; Compare/MAP → dual line present |
| contracts | Need sample geometry physical even when scene visual |

---

## 10. Success metrics

- [ ] One public apply entry for share, undo, review URL, AI  
- [ ] Zero agent `.click()` on planning controls  
- [ ] Operators can answer “why two arcs?” from a mode badge without reading docs  
- [ ] Campaign timeline = session history only (no third runtime name in UI)  
- [ ] New feature adds a command or projector — not a new apply path  

---

## 11. Open questions

1. **Present long-term:** keep dual Lambert, or single orbit × tilt transform? (Prefer transform.)  
2. **TypeScript:** domain-only first vs whole `js/`? (Recommend domain + tools first.)  
3. **Firestore:** store only `PlanSeed` v3 + assessment digest? (Yes.)  
4. **Workflow DAG visual editor:** out of scope until spine lands.

---

## 12. Related docs

- [STUDIO.md](./STUDIO.md) — landed Studio surfaces  
- [AI.md](./AI.md) — AI honesty contract  
- [trajectory-accuracy-design.md](./trajectory-accuracy-design.md) — path geometry phases  
- Architecture review discussion (2026-08) — god state, dual apply, dual host  

---

*RFC author: HELIOS domain spine proposal. Implementation starts at Phase 1 when scheduled.*
