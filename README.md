# HELIOS // Solar System Navigator

A real-time 3D solar system simulator with accurate orbital mechanics, real stellar data, and interplanetary route planning.

## Features

- **Real-time orbital simulation** — All 8 planets with Keplerian orbital mechanics using J2000 epoch elements
- **26 major moons** — Moon, Galilean moons, Titan, Enceladus, Triton, and more with real orbital periods and eccentricities
- **119,000+ real stars** — HYG v4.2 stellar database with accurate sky positions, magnitude-based sizing, and spectral colors (B-V color index)
- **Lambert transfer solver** — Compute real interplanetary transfer orbits between any two planets
- **Hohmann transfer estimates** — Delta-v, transit time, phase angles, and optimal launch windows
- **Mission simulation** — Launch ships on computed trajectories and watch them fly in real-time
- **Drag-and-drop route planning** — Drag planets from the sidebar into origin/destination slots
- **Time controls** — Pause, play, fast-forward/reverse from 1 day/s to 100 years/s
- **Date picker** — Jump to any date with presets (Apollo 11, Voyager 1, J2000, etc.)

## Tech Stack

- **Three.js** (r0.164) — 3D rendering with post-processing bloom
- **CSS2DRenderer** — Planet/moon labels
- **Custom shaders** — Star field with per-star color and size
- **Node.js** — Minimal static file server (zero dependencies)

## Getting Started

```bash
npm start
```

The server picks a free port automatically and prints the URL:

```
HELIOS server running at http://localhost:XXXXX
```

Open that URL in your browser.

## Data Sources

- **Planetary orbits** — JPL J2000 mean orbital elements
- **Star data** — [HYG Database v4.2](https://github.com/astronexus/HYG-Database) (~119,600 stars with positions, magnitudes, spectral types)
- **Moon data** — NASA/JPL planetary satellite ephemerides

## Controls

| Action | Input |
|--------|-------|
| Orbit camera | Left-drag |
| Pan camera | Right-drag |
| Zoom | Scroll wheel |
| Select body | Click planet/moon |
| Center on body | Double-click |
| Follow body | Select + press `F` |
| Set route origin/dest | Right-click planet or drag to route slot |
| Play/pause | Spacebar |
| Speed up/down | `+` / `-` keys |
| Deselect | Escape |

## Project Structure

```
index.html      — Full application (HTML + CSS + JS, single file)
server.js       — Static file server (Node.js, zero dependencies)
hyg_v42.csv     — HYG stellar database (119,600 stars)
package.json    — npm config
```
