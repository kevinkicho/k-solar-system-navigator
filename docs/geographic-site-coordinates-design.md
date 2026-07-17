# HELIOS Geographic Site Coordinates & Body-Fixed Endpoints

| Field | Value |
|---|---|
| **Document title** | Geographic Site Coordinates & Body-Fixed Endpoints |
| **Author** | HELIOS engineering (design owner TBD for product sign-off) |
| **Date** | 2026-07-16 |
| **Status** | **Implemented on `main`** (`176e370` surface points · `7cae589` gas/ice giants · `b7fb899` geographic branding & dossier stamp) |
| **Repo** | `C:\Users\kevin\workspace\k-solar-system-navigator` |
| **Branch policy** | **`main` only** — sequential green commits |
| **Baseline** | Trip planner + dual Lambert visual/physics, Need/Capability/Margin, Plan Dossier, body picker / dossier modal, concept-grade vehicle stack |
| **Audience** | Engineers extending body-fixed sites, parking Δv, or share/export of geographic endpoints |
| **Prior designs** | `docs/trip-planner-design.md`, `docs/trip-plan-reliability-completeness-design.md`, `docs/concept-grade-and-extras-design.md`, `docs/ephemeris-fidelity-platform-design.md` |
| **Related standards** | IAU WGCCRE cartographic coordinates & rotational elements; JPL SSD phys_par (1-bar radii); SPICE body-fixed frames (`IAU_*`); PDS/ODE planetocentric products |

---

## Overview

HELIOS trip planning historically used **body-center** heliocentric states for Lambert endpoints (planet or moon center of mass). That is correct for rough interplanetary Δv but cannot express:

- Launch / landing **sites** on rocky bodies (Cape-class, Jezero, …).
- **Cloud-deck longitude bands** on gas/ice giants (no solid surface).
- **Parking altitude** as height above a reference surface.
- **Surface-inertial velocity** (ω × r) contribution to departure/arrival Δv.

This design specifies a **geographic site coordinate system** for optional origin and destination endpoints:

| User-facing (geographic) | Internal math (planetocentric spherical) |
|---|---|
| Latitude φ (north +) | Planetocentric latitude |
| Longitude λ (east +) | Planetocentric east longitude |
| Altitude *h* above reference surface | Radius from center \(r = R_{\mathrm{ref}} + h\) |

**Canonical system id** (export / dossier):

```text
planetocentric+eastlon+h_above_ref
```

**Product vow:** Sites are **concept-grade educational** — not WGS84 survey, not SPICE body-fixed frames, not range safety, not atmospheric entry guidance. Gas giants use a **1-bar / cloud-deck reference sphere**, never “ground.”

---

## Background & Motivation

### Literature & operational practice

Planetary science already solves “where is this place?” with a small family of systems (not invented for HELIOS):

| System | Definition | Typical use |
|---|---|---|
| **Planetocentric lat/lon/radius** | Origin = COM; lat = angle to equator from center vector; lon east-positive; third coord = *r* or *h* | Dynamics, SPICE-style math, many PDS products |
| **Planetographic lat/lon** | Lat along surface normal of a **reference ellipsoid** | Maps, imaging; preferred visually on oblate giants |
| **IAU WGCCRE** | Pole direction, prime meridian \(W(t)\), sizes/shapes | Community cartographic frames |
| **Gas giant 1-bar** | Effective “surface” = equal-pressure boundary (~1 bar) | Jupiter/Saturn/Uranus/Neptune reference radius |
| **System I / II / III** | Multiple longitude clocks on giants (clouds vs magnetic field) | System **III** ≈ magnetic / IAU \(W\) for stable body-fixed lon |
| **WGS84 / ECEF** | Earth ellipsoid + geodetic height | Earth ops only — not multi-body default |

**SPICE** (NAIF) implements body-fixed frames (`IAU_MARS`, `IAU_JUPITER`, …) from WGCCRE-class data. HELIOS deliberately stays offline and concept-grade: same *language*, simplified constants.

### Pain points closed

| Pain | Before | After |
|---|---|---|
| Only body centers | No Cape / Jezero / GRS band | Optional geographic site per endpoint |
| “Surface” on Jupiter | 100 km parking nonsense | 1-bar sphere + high default *h* (Mm-class) |
| Ambiguous third coordinate | Users confused *r* vs *h* | UI edits *h*; shows \(r = R_{\mathrm{ref}}+h\) |
| Unlabeled coordinate frame | Implicit | Badge + `COORD_SYSTEM_ID` on dossier |
| Spin ignored in Δv | Body-center velocity only | ω × r_site when site active |
| Mission parking flat 100 km | Wrong for giants | Body-kind defaults + site *h* |

### Strengths preserved

1. Default route still works with **body centers only** (sites opt-in for rocky; auto-on for fluid giants).
2. Physics modules remain pure (`js/physics/surface-point.js`, `routing.js`, `mission-budget.js`).
3. Offline tests only (`tests/surface_point.mjs`).
4. Concept-grade honesty aligned with fidelity / reliability designs.

---

## Goals & Non-Goals

### Goals

1. **Geographic UX** — lat / lon / altitude as the user mental model; never require “radius from center” as primary input.
2. **Honest math** — planetocentric φ, λ, \(r = R_{\mathrm{ref}} + h\); convert to HELIOS scene axes for Lambert.
3. **Rocky + fluid bodies** — solid mean-radius reference; gas/ice **1-bar** reference; Venus thick-atmosphere class.
4. **Spin model** — concept-grade \(R_x(\varepsilon)\,R_z(W(t))\) body → ecliptic; surface velocity \(\boldsymbol{\omega}\times\mathbf{r}\).
5. **Parking Δv** — mission budget uses site *h* or body-kind default (never 100 km inside giant atmospheres).
6. **Dossier / export** — stamp `coordinate_system` + `geographic_origin` / `geographic_destination`.
7. **Presets** — educational sites (Cape, Jezero, GRS band, Saturn hexagon, …).
8. **Tests** — pure module + Lambert + mission budget + dossier stamp green offline.

### Non-Goals

| Non-goal | Rationale |
|---|---|
| Full IAU WGCCRE \(W(t)\) series / nutation | Concept-grade mean rate + \(W_0\) enough for v1 |
| Oblate planetographic latitude | Sphere first; ellipsoid is a later upgrade |
| True System I/II cloud differential rotation | Label System III–class only |
| WGS84 / EOP / range safety | Earth ops — out of product scope |
| SPICE kernels / body-fixed PCK | Fidelity L3 non-goal (ephemeris design) |
| Atmospheric entry, aero heating, terrain DEM | Aeroassist scalar remains separate |
| Multi-leg intermediate flyby geographic sites | v1 = origin/dest single-leg primary; flybys stay body-center |

### Success metrics

| Metric | Target |
|---|---|
| Rocky site opt-in | Checkbox + presets work; Lambert ok |
| Fluid giant default | Auto-enable geographic site; high *h* |
| `r` readout | Live \(R_{\mathrm{ref}}+h\) in UI |
| Dossier stamp | `inputs.coordinate_system` + geographic packages |
| Tests | `tests/surface_point.mjs` in physics suite |

---

## Coordinate system specification

### C1. Canonical id

```text
COORD_SYSTEM_ID = "planetocentric+eastlon+h_above_ref"
```

| Token | Meaning |
|---|---|
| `planetocentric` | Latitude measured from COM to point vs equator (not planetographic normal) |
| `eastlon` | Longitude increases **east**; UI range typically [−180, 180]; dossier also stores [0, 360) |
| `h_above_ref` | Third user coordinate is height above reference sphere, not geodetic ellipsoid height |

### C2. User coordinates

| Symbol | UI name | Domain | Sign |
|---|---|---|---|
| \(\phi\) | Latitude °N (planetocentric) | [−90, 90] | North + |
| \(\lambda\) | Longitude °E (east +) | [−180, 180] wrapped | East + |
| \(h\) | Altitude (km) | ≥ 0 | Above \(R_{\mathrm{ref}}\) |

**Derived (read-only in UI):**

\[
r = R_{\mathrm{ref}} + h
\]

displayed as “Radius from center.”

### C3. Reference sphere \(R_{\mathrm{ref}}\)

| `bodySurfaceKind` | Bodies | \(R_{\mathrm{ref}}\) | Meaning of *h* |
|---|---|---|---|
| `solid` | Mercury, Earth, Mars, Moon, dwarfs, … | `body.radius` | Height above mean spherical “surface” |
| `gas-giant` | Jupiter, Saturn | `body.radius` | Height above **1-bar / cloud-deck** educational sphere |
| `ice-giant` | Uranus, Neptune | `body.radius` | Same as gas giant (1-bar class) |
| `thick-atmosphere` | Venus | `body.radius` | Height above mean radius / cloud-deck class |

`body.radius` values come from HELIOS body tables (JPL SSD phys_par–aligned for major planets). **No solid surface** is claimed for fluid giants.

### C4. Longitude system labels

| Kind | `longitudeSystem.id` | UI label |
|---|---|---|
| Fluid giant | `system-III` | System III (magnetic / IAU-class · educational) |
| Earth | `geographic` | Geographic east lon (Greenwich-class) |
| Other | `geographic` | Planetocentric east lon (cartographic prime meridian) |

**Honesty:** HELIOS does **not** implement differential System I/II cloud winds. System III is a **label** for “stable body-fixed clock class,” paired with the concept-grade spin model below—not a full IAU \(W\) polynomial.

### C5. Body-fixed Cartesian (meters)

Planetocentric spherical → body-fixed right-handed frame:

\[
\begin{aligned}
r &= R_{\mathrm{ref}} + h \\
x_{\mathrm{bf}} &= r \cos\phi \cos\lambda \\
y_{\mathrm{bf}} &= r \cos\phi \sin\lambda \\
z_{\mathrm{bf}} &= r \sin\phi
\end{aligned}
\]

- \(+z_{\mathrm{bf}}\): north pole  
- \(+x_{\mathrm{bf}}\): \((\phi,\lambda)=(0,0)\)  
- \(+y_{\mathrm{bf}}\): 90°E on equator  

### C6. Body-fixed → ecliptic (concept-grade orientation)

\[
\mathbf{r}_{\mathrm{ecl}} = R_x(\varepsilon)\, R_z(W(t))\, \mathbf{r}_{\mathrm{bf}}
\]

| Quantity | Source (concept-grade) |
|---|---|
| Sidereal period \(P\) | JPL SSD phys_par extras when present; else fallback |
| \(W(t)\) | \(W = W_0 + (360^\circ/P)\, t_{\mathrm{days}}\) from J2000; \(P<0\) ⇒ retrograde |
| Obliquity \(\varepsilon\) | Mean ecliptic obliquity table (Earth 23.439°, Mars 25.19°, Jupiter 3.13°, …) |

**Not modeled:** full IAU pole RA/Dec series, precession, libration, EOP.

### C7. HELIOS scene axes

Kepler / scene convention (from `kepler.js`):

| Standard ecliptic | HELIOS scene |
|---|---|
| \(X\) | `x` |
| \(Y\) | `z` |
| \(Z\) (out of plane) | `y` |

Surface offset is converted to **scene AU** before adding to body-center position.

### C8. Heliocentric endpoint state

At epoch \(t\) (sim seconds from J2000):

\[
\begin{aligned}
\mathbf{r}_{\mathrm{point}}(t) &= \mathbf{r}_{\mathrm{body}}(t) + \mathbf{r}_{\mathrm{offset}}(t) \\
\mathbf{v}_{\mathrm{point}}(t) &= \mathbf{v}_{\mathrm{body}}(t) + \boldsymbol{\omega}(t) \times \mathbf{r}_{\mathrm{offset}}(t)
\end{aligned}
\]

- \(\mathbf{r}_{\mathrm{body}}, \mathbf{v}_{\mathrm{body}}\): planning ephemeris (`approx` / `sample-de` via provider).  
- \(\boldsymbol{\omega}\): spin about body pole after same orientation matrix.  
- Lambert Δv uses \(|\mathbf{v}_{\mathrm{Lambert}} - \mathbf{v}_{\mathrm{point}}|\) when site active.

### C9. Pipeline diagram

```text
User geographic site
  φ, λ, h
       │
       ▼
  r = R_ref + h
  body-fixed (x,y,z)_bf
       │
       ▼
  R_x(ε) R_z(W(t))  →  ecliptic meters
       │
       ▼
  scene AU offset  (x,y,z) HELIOS axes
       │
       ▼
  + body-center planning state @ t
       │
       ▼
  Lambert r1,r2  and  v_point for Δv
       │
       ▼
  Mission parking uses h (or body default)
  Plan dossier stamps geographic_* packages
```

---

## Architecture

### Module map

| Module | Responsibility |
|---|---|
| `js/physics/surface-point.js` | Kind, defaults, CS badge, spin, offset, velocity, meta, parking resolve |
| `js/physics/routing.js` | Attach sites to `transferData`; `solveTransferOrbit` applies endpoints |
| `js/physics/mission-budget.js` | Parking alt from site / body kind; 1-bar wording for giants |
| `js/ui/surface-point-ui.js` | Plan-rail geographic panels, badge, *r* readout, presets |
| `js/ui/route-planner.js` | State lifecycle; stamp points before solve |
| `js/ui/route-display.js` | Results hero site lines + CS label |
| `js/ui/plan-dossier.js` | `coordinate_system` + `geographic_origin` / `_destination` |
| `js/state.js` | `routeOriginPoint`, `routeDestPoint` |
| `index.html` + `css/app.css` | Geographic panel markup & styles |
| `tests/surface_point.mjs` | Offline suite (sphere, spin, giants, dossier) |

### State shape

```js
// state.routeOriginPoint / state.routeDestPoint
{
  enabled: boolean,
  lat_deg: number,   // planetocentric, N+
  lon_deg: number,   // east+, typically [-180, 180]
  alt_m: number,     // height above R_ref (meters)
}
```

**Defaults:**

| Body kind | `enabled` on body select | Default `alt_m` (order of magnitude) |
|---|---|---|
| Solid / moon | `false` (opt-in) | 100 km (moon 50 km) |
| Venus class | `false` | 300 km |
| Jupiter | **`true`** | 4000 km |
| Saturn | **`true`** | 3000 km |
| Ice giants | **`true`** | 1500 km |

Changing body **resets** the point to `defaultSurfacePointForBody(body)`.

### Transfer data attachments

On compute (`route-planner.js`):

```js
td.surfaceOriginPoint = cloneSurfacePoint(state.routeOriginPoint)
td.surfaceDestPoint   = cloneSurfacePoint(state.routeDestPoint)
// after solveTransferOrbit:
td.surfaceOriginMeta  = surfacePointMeta(...)
td.surfaceDestMeta    = surfacePointMeta(...)
td.surfaceOriginOffset_m / surfaceDestOffset_m
```

### Dossier / export package

```js
// inputs.coordinate_system === "planetocentric+eastlon+h_above_ref"
// inputs.geographic_origin | geometry.geographic_origin:
{
  active: true | false,
  body, bodyId,
  lat_deg, lon_deg, lon_east_0_360,
  alt_m,
  radius_from_center_m, radius_from_center_km,
  reference_radius_m,
  label, surfaceKind,
  referenceSphere: "1-bar" | "mean-radius",
  coordinateSystem: COORD_SYSTEM_ID,
  coordinateSystemLabel, // short badge
  longitudeSystem: "system-III" | "geographic",
  longitudeSystemLabel,
  latitudeConvention: "planetocentric",
  longitudeConvention: "east-positive",
  model: "<honesty string>",
}
// inactive:
{ active: false, coordinateSystem, body, note: "Body-center endpoint (no geographic site)" }
```

---

## UI / UX

### Plan rail panels

Under Origin / Dest slots:

1. **`<details>`** titled “Origin/Destination **geographic site** · lat / lon / alt”
2. **CS badge** — short string; full string in `title`
3. **Enable** checkbox
4. **Preset** select (sites / cloud-deck bands)
5. **Lat / lon** inputs
6. **Altitude** input (label switches for 1-bar vs mean radius)
7. **Radius-from-center readout** (live on alt input)
8. **Longitude system line** (System III on giants)
9. **Hint** — full CS description

Fluid giants: panel **auto-opens** when body selected.

### Slot labels

When site active, origin/dest name shows short geographic tag, e.g.:

```text
Earth · 28.50°N 80.60°W · h200 km
Jupiter · 0.00°N 0.00°E · 1-bar+4000 km
```

### Results hero

When metas present:

- Origin / Dest labels, optional \(r\) km, optional “Sys.III”
- Subline: coordinate system short badge

### Body picker / scene

Unchanged: pick body by name; geographic site is a **refinement** on Plan tab after body is set. Drag / right-click still set body only (reset site defaults per kind).

---

## Physics integration details

### Lambert (`solveTransferOrbit`)

1. Planning positions/velocities at dep/arr (provider).  
2. `applySurfaceEndpoint` for origin/dest points.  
3. Lambert on offset \(r_1, r_2\); Δv vs surface-inertial \(v\).  
4. Visual path: same offset on exaggerated geometry; cosine fallback unchanged.  
5. Metas + offset magnitudes stored on `td`.

### Mission parking (`computeMissionBudget`)

```text
parkingAlt = resolveParkingAlt_m(body, surfacePoint)
// = point.alt_m if active, else defaultParkingAlt_m(body)
```

Escape/capture Δv from circular orbit at \(R_{\mathrm{ref}} + h\). Labels for fluid giants:

```text
… from N km above 1-bar (cloud-deck ref, no solid surface) …
```

Injection helpers (`injectionDepartureDvFromC3` / `FromVinf`) accept optional parking alt; default uses body-kind resolve.

### Multi-leg

**v1 scope:** Geographic sites apply to **single-leg** origin/dest. Multi-leg waypoints remain body-center. Future: optional site on first/last waypoint only.

---

## Presets (educational, not certified)

| Body | Examples |
|---|---|
| Earth | Cape, Vandenberg, Kourou, Baikonur classes |
| Mars | Jezero, Olympus Mons region, Valles Marineris |
| Moon | Apollo 11, Shackleton |
| Jupiter | Equator high parking, GRS latitude band, N temperate |
| Saturn | Equator, N polar hexagon band |
| Uranus / Neptune | Equator; Neptune Dark Spot latitude class |
| `*` (all) | Equator, N/S pole (alt = body default) |

Coordinates are **illustrative class** values for classrooms—not survey monuments.

---

## Honesty & concept-grade boundary

| Claim | HELIOS status |
|---|---|
| Planetocentric lat/lon | **Yes** (documented) |
| East-positive lon | **Yes** |
| Height above spherical ref | **Yes** |
| 1-bar giants | **Educational** (radius = HELIOS `body.radius`) |
| System III | **Label only** (not full IAU series) |
| Spin / obliquity | **Mean table + period** |
| Oblate planetographic | **Out of scope v1** |
| SPICE / WGS84 ops | **Never claimed** |

Trust Card / About should continue to list body-fixed sites as concept-grade when that surface is extended.

---

## Alternatives considered

| Alternative | Pros | Cons | Decision |
|---|---|---|---|
| **UI as pure \(r,\phi,\lambda\)** | Pure spherical | Poor UX for pads / probes | Reject as primary; keep as derived *r* |
| **Planetographic + ellipsoid** | Map-accurate on oblate giants | Needs \(R_e, R_p\), more code | Defer |
| **WGS84 for Earth only** | Survey-compatible | Two systems; ops creep | Reject for v1 |
| **Body centers only** | Simple | No sites / dishonest giant parking | Superseded |
| **Full SPICE body-fixed** | Gold standard | Kernels, size, L3 | Non-goal (fidelity design) |
| **Pressure-level as only coord** | Physically pure for giants | Needs atmosphere model | Reject |

---

## Testing

| Suite | Coverage |
|---|---|
| `tests/surface_point.mjs` | Body-fixed axes; spin; Earth/Mars Lambert + sites; Jupiter 1-bar defaults; parking resolve; `COORD_SYSTEM_ID`; badges; System III; \(r=R+h\); meta fields; inactive package; dossier stamp |
| Physics runner | Includes `surface_point.mjs` in `tests/run_physics.mjs` |
| CI UI | Origin/dest compute path still body-level; geographic panels optional |

---

## Key Decisions

| # | Decision | Rationale |
|---|---|---|
| K1 | **Geographic UX, planetocentric math** | Matches user language + SPICE-class internals |
| K2 | **Altitude primary; *r* derived** | Practical for pads/parking; *r* still honest |
| K3 | **Spherical \(R_{\mathrm{ref}}\) not ellipsoid** | Simple; sufficient for concept Δv |
| K4 | **Gas giants = 1-bar + auto site** | No solid surface; high default *h* |
| K5 | **System III label only** | Educational honesty without false precision |
| K6 | **ω × r in Δv when site on** | Captures spin assist class effect |
| K7 | **Stamp CS id on dossier** | Export / share / agent reproducibility |
| K8 | **Main-only already landed** | Design is as-built + future upgrades |

---

## Open Questions (future)

| # | Question | Options | Default if unresolved |
|---|---|---|---|
| Q1 | Oblate planetographic for giants/Earth? | Sphere only / optional ellipsoid | Sphere only until demanded |
| Q2 | Geographic sites on multi-leg terminals? | No / first+last only | No (body-center flybys) |
| Q3 | Full IAU \(W(t)\) table offline? | Toy spin / JSON IAU rates | Toy until table asset exists |
| Q4 | Share-hash encode sites? | No / compact base64 site tokens | No in v1 (dossier/export only) |

---

## Implementation status (as-built on `main`)

| Capability | Status | Primary commits |
|---|---|---|
| Surface point physics + Lambert offset | Done | `176e370` |
| Gas/ice 1-bar defaults + parking | Done | `7cae589` |
| Geographic branding, badge, *r* readout | Done | `b7fb899` |
| System III labels | Done | `b7fb899` |
| Dossier `coordinate_system` + packages | Done | `b7fb899` |
| Share hash site tokens | Not done | — |
| Oblate / full IAU W | Not done | — |
| Multi-leg terminal sites | Not done | — |

---

## PR Plan (historical + residual)

Work landed as sequential main commits (no open PRs required for v1). Residual upgrades:

### PR-G1 — Share / import geographic sites *(optional residual)*

- **Files:** `js/ui/share.js`, mission import/export, tests  
- **Depends on:** none (sites already on `td`)  
- **Desc:** Encode enabled origin/dest sites in share hash + JSON v3; round-trip CI  

### PR-G2 — Oblate reference + planetographic display *(optional residual)*

- **Files:** `surface-point.js`, body phys extras (Re/Rp), UI dual lat display  
- **Depends on:** none  
- **Desc:** Optional ellipsoid; show planetocentric vs planetographic when \(R_e \neq R_p\)  

### PR-G3 — IAU mean \(W(t)\) table asset *(optional residual)*

- **Files:** `assets/iau-rotation-v1.json` (or embed), `getSpinModel`  
- **Depends on:** none  
- **Desc:** Replace toy \(W_0\) with published mean rates; still offline  

### PR-G4 — Multi-leg first/last geographic sites *(optional residual)*

- **Files:** `route-planner.js`, `routing.js` multi-leg path  
- **Depends on:** PR-G1 if share needed  
- **Desc:** Apply `surfaceOriginPoint` / `surfaceDestPoint` only on terminal legs  

---

## File reference (quick)

```text
js/physics/surface-point.js     # CS, geometry, spin, meta, parking
js/physics/routing.js           # endpoint application in Lambert
js/physics/mission-budget.js    # parking alt + giant wording
js/ui/surface-point-ui.js       # Plan rail geographic panels
js/ui/route-planner.js          # state + stamp before solve
js/ui/route-display.js          # hero geographic lines
js/ui/plan-dossier.js           # export packages
js/state.js                     # routeOriginPoint / routeDestPoint
index.html                      # panel markup
css/app.css                     # badge, radius readout styles
tests/surface_point.mjs         # offline tests
docs/geographic-site-coordinates-design.md  # this document
```

---

## References (external)

1. IAU WGCCRE — *Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements* (series; e.g. Archinal et al. 2015/2018).  
2. JPL SSD — [Planetary Physical Parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html) (radii, rotation, density).  
3. NAIF SPICE — body-fixed frames & planetodetic tutorials.  
4. USGS / IAU — Gazetteer of Planetary Nomenclature; planetocentric vs planetographic notes.  
5. Planetary coordinate system overview — planetocentric latitude, gas giant 1-bar effective surface, System III longitudes.  
6. HELIOS prior designs — trip planner, reliability, concept-grade extras, ephemeris fidelity.

---

## Appendix A — Worked numeric sketch (Earth)

Example: Cape-class site, \(h = 200\,\mathrm{km}\).

| Quantity | Value |
|---|---|
| \(R_{\mathrm{ref}}\) | \(\approx 6371\,\mathrm{km}\) (HELIOS Earth mean radius) |
| \(\phi, \lambda\) | \(28.5^\circ\mathrm{N}\), \(80.6^\circ\mathrm{W}\) |
| \(h\) | \(200\,\mathrm{km}\) |
| \(r\) | \(\approx 6571\,\mathrm{km}\) from center |
| Spin speed class | \(\mathcal{O}(0.4)\,\mathrm{km/s}\) mid-latitude surface-inertial |

Offset \(\sim R+h\) is \(\sim 10^{-5}\,\mathrm{AU}\)—small vs Earth–Mars geometry, large enough to document site and adjust parking / spin Δv.

---

## Appendix B — Worked numeric sketch (Jupiter)

Example: equator, auto site.

| Quantity | Value |
|---|---|
| Reference | 1-bar educational sphere (`body.radius`) |
| Default \(h\) | \(4000\,\mathrm{km}\) above 1-bar |
| Lon system label | System III–class |
| Parking Δv | From circular orbit at \(R_{\mathrm{1\,bar}}+h\), **not** 100 km “surface” |

Claim language in UI/mission budget: **cloud-deck ref, no solid surface**.

---

*End of design document.*
