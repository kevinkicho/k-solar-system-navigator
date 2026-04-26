# HELIOS // Solar System Navigator

A real-time 3D solar system simulator with accurate orbital mechanics, real stellar data, and interplanetary mission planning — including gravity-assist trajectories and a porkchop-plot launch-window finder.

## Features

### Scene
- **All 8 planets** — Keplerian orbital mechanics from J2000 mean elements
- **Planet surface textures** — equirectangular NASA-derived maps for each planet (served from jsDelivr), with axial rotation driven by real sidereal periods (Venus and Uranus rotate retrograde)
- **Earth clouds** — translucent cloud shell using the cloud map as its own alpha channel
- **Saturn's rings** — ring texture with UV remapped radially so banding reads correctly from inner to outer edge
- **~30 major moons** — Moon, Galilean moons, Titan, Enceladus, Triton, and more, with real orbital periods
- **119,000+ real stars** — HYG v4.2 catalogue with accurate positions, magnitude-scaled sizing, and B-V spectral colour
- **Animated Sun** — procedural canvas texture with granulation and sunspots; rotation + pulsing corona

### Real spacecraft
Five deep-space probes rendered as labelled tetrahedron markers with velocity-direction trails, anchored at J2000 state vectors and linearly propagated (validated against NASA tracking to within a few percent through 2026):
- Voyager 1 · Voyager 2 · Pioneer 10 · Pioneer 11 · New Horizons

### Mission planner
- **Robust Lambert solver** — bracketed bisection on the universal-variable equation. Convergence-safe across the full single-revolution regime; rejects degenerate 180° geometries and validates every solution by propagating back to the target (≤1000 km miss required).
- **Physics / visuals decoupling** — inclinations are visually exaggerated for dramatic 3D tilt, but all Δv and orbit-parameter computations use real inclinations, so displayed numbers are physically accurate.
- **Porkchop-plot launch-window finder** — sweep a grid of (departure date × transit duration) and heat-map the total Δv. Click a cell or use the auto-selected global minimum to drive the planner's dates in one click.
- **Gravity-assist / multi-leg routing** — add any number of flyby waypoints between origin and destination. Each leg is solved with its own Lambert; at each flyby the spacecraft's V∞ turning angle is checked against the maximum achievable at the planet's minimum-safe periapsis — infeasible swingbys are flagged **TOO SHARP** with the required vs. minimum periapsis shown.
- **Mission feasibility** against the configured vehicle stack (Starship + Super Heavy): all of Starship's propellant is reserved for final-mile ops; transfer Δv budget is Super Heavy only, lifting the fully-loaded Starship as payload.

### Simulation
- **Date picker** — jump to any instant with presets (Apollo 11, Voyager 1 launch, J2000, etc.)
- **Time controls** — pause / play / fast-forward / reverse from 1 day/s to 100 years/s
- **Ship flight simulation** — launch a computed transfer, watch the ship trace its trajectory, jump straight to the departure date, abort a mission mid-flight
- **Drag-and-drop or right-click route planning** — assign origin/destination from the sidebar

## Tech stack

- **Three.js r0.164** — 3D rendering with UnrealBloom post-processing
- **CSS2DRenderer** — planet/moon/spacecraft labels
- **Node.js** — zero-dependency static file server

## Physics summary

| Component | Method |
|---|---|
| Planet positions | Keplerian elements from J2000, Newton–Raphson solver for eccentric anomaly |
| Transfer orbit | Lambert's problem via universal-variable formulation, bracketed-bisection solver |
| Trajectory propagation | Kepler in perifocal frame (p̂, q̂, ŵ) |
| Δv | Vector difference `|v_transfer − v_planet|` (both from physical-inclination state) |
| Gravity assist | Patched-conic: `e = 1 + r_p·V∞² / μ`, turning angle `δ = 2·asin(1/e)` |
| Launch windows | Lambert sweep over departure time × transit time, min Δv at each cell |

## Tests

Offline numeric validation (no browser required):

```bash
node tests/trip_planning_test.mjs     # Lambert / Hohmann / planet positions vs references
node tests/verify_fix.mjs             # Lambert solver convergence sweep
node tests/porkchop_sim.mjs           # porkchop minimum vs real Mars windows
node tests/gravity_assist_sim.mjs     # multi-leg VEEGA-style routes
node tests/spacecraft_check.mjs       # Voyager/Pioneer distances vs NASA tracking
node tests/visual_alignment.mjs       # trajectory-line-vs-marker accuracy
node tests/module_integration.mjs     # imports js/* modules: load, accuracy, perf budgets
```

End-to-end UI test (requires Puppeteer):

```bash
npm install puppeteer
node tests/ui_smoke.mjs     # drives the app in headless Chromium, screenshots in tests/screenshots/
```

## Getting started

```bash
npm start
```

The server picks a free port automatically and prints the URL:

```
HELIOS server running at http://localhost:XXXXX
```

Open that URL in your browser.

## Data sources

- **Planetary orbits** — JPL J2000 mean orbital elements
- **Star data** — [HYG Database v4.2](https://github.com/astronexus/HYG-Database) (~119,600 stars)
- **Moon data** — NASA/JPL planetary satellite ephemerides
- **Planet surface textures** — [threex.planets](https://github.com/jeromeetienne/threex.planets) (NASA public-domain maps)
- **Spacecraft state vectors** — JPL Horizons / NASA tracking pages (epoch J2000)

## Controls

| Action | Input |
|---|---|
| Orbit camera | Left-drag |
| Pan camera | Right-drag |
| Zoom | Scroll wheel |
| Select body | Click planet/moon |
| Centre on body | Double-click |
| Follow body | Select + press `F` |
| Set route origin/dest | Right-click planet or drag to route slot |
| Add gravity-assist flyby | **+ FLYBY** button in route panel |
| Find launch windows | **Find Launch Windows** button in route panel |
| Jump to date | Click the date in the bottom bar |
| Play/pause | Spacebar |
| Speed up/down | `+` / `-` |
| Deselect | Escape |

## Project structure

```
index.html                — HTML/CSS shell + DOM (~650 lines)
js/                       — application code, split into ES modules
  constants.js              — G, AU, exaggerations, etc.
  state.js                  — shared mutable app state
  data/                     — bodies, moons, spacecraft data tables
  physics/                  — vec3, kepler, lambert, helio, gravity-assist, routing
  scene/                    — Three.js scene construction (one module per object)
  ui/                       — controls, route-planner, porkchop, info-panel, etc.
  mission.js                — launch / abort / per-frame mission updates
  animation.js              — render loop
  main.js                   — entry point: wires modules and starts animate()
trajectory-calculator.js  — vehicle stack Δv model (Super Heavy + Starship)
server.js                 — static file server (Node.js, zero dependencies)
hyg_v42.csv               — HYG stellar database (119,600 stars, ~32 MB)
tests/                    — offline physics + module-integration + Playwright UI tests
```
