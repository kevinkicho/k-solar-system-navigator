# SPICE / DE kernels (local L3 bake)

These binary kernels are **not committed** (size). Download with:

```bash
python scripts/download-kernels.py
```

Required for DE440s bake + Mars moons dense bake:

| File | Role |
|------|------|
| `naif0012.tls` | Leap seconds (LSK) |
| `pck00011.tpc` | Planetary constants |
| `gm_de440.tpc` | GM values |
| `de440s.bsp` | Short planetary SPK (~32 MiB) |
| `mar099s.bsp` | Mars satellites short SPK (~64 MiB) — Phobos/Deimos |
| `jup365.bsp` | Galilean moons (~1.1 GiB) — Io–Callisto Tier B bake |
| `sat441.bsp` | Saturn major moons (~631 MiB) — Titan Tier B bake |
| `nep097.bsp` | Triton (~100 MiB) — Tier B bake |

Bake offline sample tables:

```bash
pip install spiceypy
python scripts/download-kernels.py              # core + mar099s
python scripts/download-kernels.py --tier-b     # + jup365, sat441, nep097 (large)
python scripts/build-ephemeris-from-spice.py    # planets JSON
python scripts/build-dense-spk-pack.py --all-tier-a   # mars-moons, earth-moon, planets-dense
python scripts/build-dense-spk-pack.py --all-tier-b   # galilean, titan, triton (lazy packs)
node scripts/build-moon-samples.mjs             # slow moons Kepler table (not Phobos/Deimos)
```

**Mars-system accuracy targets (concept-grade):**

- Time: minutes (continuous TOF + dense 10-min knots with cubic interp)
- Distance: km class parent-relative (SPICE mar099s dense; continuous Kepler recovery for planning)

Committed products (not kernels):

- `assets/ephemeris-samples-v1.json` — DE440s planets
- `assets/ephemeris-mars-moons-dense.bin` + `.meta.json` — Phobos/Deimos dense
- `assets/ephemeris-moons-v1.json` — slower moons (cadence-gated)

**Disclaimer:** Educational research use of public NAIF kernels. **Not flight-certified.** Not a substitute for operational SPICE pipelines, OD, or range safety.
