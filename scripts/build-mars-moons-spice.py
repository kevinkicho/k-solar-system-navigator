#!/usr/bin/env python3
"""
Bake dense Mars-system moon table (Phobos, Deimos) from mar099s.bsp.

Output:
  assets/ephemeris-mars-moons-dense.meta.json
  assets/ephemeris-mars-moons-dense.bin  (Float32 LE: for each body, n * [x,y,z] AU scene)

Step default 10 minutes → ≥48 samples per Phobos orbit (period ~7.65 h).
Educational L3-class relative ephemeris — NOT flight-certified OD.

Requires: spiceypy + assets/kernels/{naif0012.tls,pck00011.tpc,de440s.bsp,mar099s.bsp}
"""
from __future__ import annotations

import json
import math
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import spiceypy as spice
except ImportError:
    print("spiceypy not installed", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
KERNEL_DIR = ROOT / "assets" / "kernels"
OUT_META = ROOT / "assets" / "ephemeris-mars-moons-dense.meta.json"
OUT_BIN = ROOT / "assets" / "ephemeris-mars-moons-dense.bin"
J2000_UTC = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
AU_KM = 149597870.7

# NAIF IDs
BODIES = {
    "phobos": 401,
    "deimos": 402,
}
MARS_ID = 499


def load_kernels() -> None:
    for name in ["naif0012.tls", "pck00011.tpc", "gm_de440.tpc", "de440s.bsp", "mar099s.bsp"]:
        path = KERNEL_DIR / name
        if not path.exists():
            raise FileNotFoundError(f"Missing {path}")
        spice.furnsh(str(path))
        print(f"  furnsh {path.name}")


def utc_to_et(dt: datetime) -> float:
    months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()
    s = f"{dt.year:04d} {months[dt.month - 1]} {dt.day:02d} {dt.hour:02d}:{dt.minute:02d}:{dt.second:02d} UTC"
    return spice.str2et(s)


def pos_mars_relative_scene_au(body_id: int, et: float) -> tuple[float, float, float]:
    """Geometric position of moon relative to Mars center, ECLIPJ2000 → HELIOS scene AU."""
    # state relative to Mars (499), geometric NONE
    state, _lt = spice.spkezr(str(body_id), et, "ECLIPJ2000", "NONE", str(MARS_ID))
    x_km, y_km, z_km = state[0], state[1], state[2]
    x = x_km / AU_KM
    y = y_km / AU_KM
    z = z_km / AU_KM
    # HELIOS scene: {x,y,z} = ecliptic {X, Z, Y}
    return (x, z, y)


def main() -> None:
    step_min = 10
    if "--step-min" in sys.argv:
        step_min = int(sys.argv[sys.argv.index("--step-min") + 1])
    t0 = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    t1 = datetime(2031, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    if "--t0" in sys.argv:
        t0 = datetime.fromisoformat(sys.argv[sys.argv.index("--t0") + 1].replace("Z", "+00:00"))
        if t0.tzinfo is None:
            t0 = t0.replace(tzinfo=timezone.utc)
    if "--t1" in sys.argv:
        t1 = datetime.fromisoformat(sys.argv[sys.argv.index("--t1") + 1].replace("Z", "+00:00"))
        if t1.tzinfo is None:
            t1 = t1.replace(tzinfo=timezone.utc)

    step_sec = step_min * 60.0
    t0_sim = (t0 - J2000_UTC).total_seconds()
    span = (t1 - t0).total_seconds()
    n = int(span // step_sec) + 1
    print(f"Bake Mars moons SPICE: step={step_min}min n={n} {t0.isoformat()} → {t1.isoformat()}")

    load_kernels()

    # Body order fixed for binary layout
    order = ["phobos", "deimos"]
    blobs: list[bytes] = []
    for name in order:
        bid = BODIES[name]
        print(f"  {name} id={bid}…")
        floats: list[float] = []
        for i in range(n):
            sim = t0_sim + i * step_sec
            dt = datetime.fromtimestamp(J2000_UTC.timestamp() + sim, tz=timezone.utc)
            et = utc_to_et(dt)
            x, y, z = pos_mars_relative_scene_au(bid, et)
            floats.extend((x, y, z))
        blobs.append(struct.pack(f"<{len(floats)}f", *floats))
        # Sanity: |r| Phobos ~ 9376 km ≈ 6.27e-5 AU
        r0 = math.sqrt(floats[0] ** 2 + floats[1] ** 2 + floats[2] ** 2) * AU_KM
        print(f"    |r|_0 ≈ {r0:.1f} km")

    raw = b"".join(blobs)
    OUT_BIN.write_bytes(raw)
    meta = {
        "version": 1,
        "source": "naif-mar099s-spice-v1",
        "bake_source": "spice-mar099s",
        "source_note": (
            "Phobos/Deimos Mars-relative geometric states from mar099s.bsp + de440s Mars center. "
            "ECLIPJ2000 → HELIOS scene (Y↔Z). Dense 10-min class table for km/minute Mars-system planning. "
            "EDUCATIONAL — NOT flight-certified OD."
        ),
        "frame": "Mars-centered parent-relative AU, HELIOS scene axes",
        "t0_iso": t0.isoformat().replace("+00:00", "Z"),
        "t1_iso": t1.isoformat().replace("+00:00", "Z"),
        "t0_sim": t0_sim,
        "step_sec": step_sec,
        "step_min": step_min,
        "n": n,
        "dtype": "float32_le",
        "layout": "bodies sequential: each n * (x,y,z) float32",
        "bodies": order,
        "body_offsets": {name: i * n * 3 * 4 for i, name in enumerate(order)},
        "bin": "ephemeris-mars-moons-dense.bin",
        "kernels": ["mar099s.bsp", "de440s.bsp", "naif0012.tls", "pck00011.tpc"],
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "flight_ops_certified": False,
        "target_class": {"time_s": 60, "dist_km": 1},
    }
    OUT_META.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    mb = len(raw) / (1024 * 1024)
    print(f"Wrote {OUT_BIN} ({mb:.2f} MiB) + {OUT_META}")
    spice.kclear()
    if mb > 12:
        print("WARNING: dense table large", file=sys.stderr)


if __name__ == "__main__":
    main()
