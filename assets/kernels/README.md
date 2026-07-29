# SPICE / DE kernels (local L3 bake)

These binary kernels are **not committed** (size). Download with:

```bash
python scripts/download-kernels.py
```

Required for DE440s bake:

| File | Role |
|------|------|
| `naif0012.tls` | Leap seconds (LSK) |
| `pck00011.tpc` | Planetary constants |
| `gm_de440.tpc` | GM values |
| `de440s.bsp` | Short planetary SPK (~32 MiB) |

Bake offline sample table (overwrites `assets/ephemeris-samples-v1.json`):

```bash
pip install spiceypy
python scripts/download-kernels.py
python scripts/build-ephemeris-from-spice.py
```

Fallback order for `npm run build:ephemeris`:

1. SPICE DE440s (if kernels + spiceypy present)  
2. Live Horizons series  
3. Approx bootstrap  

**Disclaimer:** Educational research use of public NAIF kernels. **Not flight-certified.** Not a substitute for operational SPICE pipelines, OD, or range safety.
