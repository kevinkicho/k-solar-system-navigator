#!/usr/bin/env python3
"""
Bake HELIOS L2/L3 offline sample table from DE440s SPICE SPK (spiceypy).

Output: assets/ephemeris-samples-v1.json (scene-axis positions, AU)
Frame mapping: SPICE J2000 ecliptic ≈ convert ECLIPJ2000 → HELIOS scene (Y↔Z).

Educational — not flight-certified navigation.
Requires: pip install spiceypy + kernels via download-kernels.py
"""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import spiceypy as spice
except ImportError:
    print("spiceypy not installed: pip install spiceypy", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
KERNEL_DIR = ROOT / "assets" / "kernels"
OUT = ROOT / "assets" / "ephemeris-samples-v1.json"

# J2000 epoch UTC for HELIOS sim seconds (matches js/constants.js)
J2000_UTC = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

# NAIF planetary barycenter / planet IDs for geometric centers in DE SPKs
# Using planet barycenters for major planets is common for heliocentric planning tables.
BODIES = {
    "mercury": 1,   # Mercury Barycenter
    "venus": 2,
    "earth": 3,     # Earth-Moon Barycenter — closer match to many tools for heliocentric
    "mars": 4,
    "jupiter": 5,
    "saturn": 6,
    "uranus": 7,
    "neptune": 8,
}

# Prefer geometric planet centers when available in de440s
BODY_CENTER_OVERRIDE = {
    "earth": 399,  # Earth body
    "mars": 499,
    "mercury": 199,
    "venus": 299,
    "jupiter": 599,
    "saturn": 699,
    "uranus": 799,
    "neptune": 899,
}

AU_KM = 149597870.7


def load_kernels() -> list[str]:
    required = ["naif0012.tls", "pck00011.tpc", "gm_de440.tpc", "de440s.bsp"]
    loaded = []
    for name in required:
        path = KERNEL_DIR / name
        if not path.exists():
            raise FileNotFoundError(f"Missing kernel {path} — run scripts/download-kernels.py")
        spice.furnsh(str(path))
        loaded.append(str(path))
    return loaded


def utc_to_et(dt: datetime) -> float:
    # CSPICE prefers e.g. 2015 JAN 01 12:00:00 UTC
    months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()
    s = f"{dt.year:04d} {months[dt.month - 1]} {dt.day:02d} {dt.hour:02d}:{dt.minute:02d}:{dt.second:02d} UTC"
    return spice.str2et(s)


def et_to_sim_sec(et: float) -> float:
    # HELIOS: seconds since J2000 UTC noon
    # Convert ET → UTC calendar then to HELIOS sim
    # spice.et2utc(et, 'ISOC', 3) → '2000-01-01T12:00:00.000'
    utc = spice.et2utc(et, "ISOC", 3)
    # Parse ISO
    if "T" not in utc:
        utc = utc.replace(" ", "T")
    # spice may return with trailing Z-less form
    dt = datetime.fromisoformat(utc.replace("Z", "")).replace(tzinfo=timezone.utc)
    return (dt - J2000_UTC).total_seconds()


def spk_pos_scene(body_id: int, et: float) -> tuple[float, float, float]:
    """Geometric position relative to SSB in ECLIPJ2000, then to HELIOS scene AU."""
    # state: km, km/s in requested frame
    state, _lt = spice.spkezr(str(body_id), et, "ECLIPJ2000", "NONE", "0")
    x_km, y_km, z_km = state[0], state[1], state[2]
    # ecliptic AU
    x = x_km / AU_KM
    y = y_km / AU_KM
    z = z_km / AU_KM
    # HELIOS scene: {x,y,z} = ecliptic {X, Z, Y}
    return (x, z, y)


def main() -> None:
    # Default 2-day step: denser outer-window sampling within ~2.5 MiB soft budget.
    step_days = 2
    if "--step" in sys.argv:
        i = sys.argv.index("--step")
        step_days = int(sys.argv[i + 1])

    t0 = datetime(2015, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    t1 = datetime(2055, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    if "--t0" in sys.argv:
        i = sys.argv.index("--t0")
        t0 = datetime.fromisoformat(sys.argv[i + 1].replace("Z", "+00:00"))
        if t0.tzinfo is None:
            t0 = t0.replace(tzinfo=timezone.utc)
    if "--t1" in sys.argv:
        i = sys.argv.index("--t1")
        t1 = datetime.fromisoformat(sys.argv[i + 1].replace("Z", "+00:00"))
        if t1.tzinfo is None:
            t1 = t1.replace(tzinfo=timezone.utc)
    step_sec = step_days * 86400.0

    print("Loading SPICE kernels…")
    loaded = load_kernels()
    for p in loaded:
        print(f"  furnsh {p}")

    et0 = utc_to_et(t0)
    et1 = utc_to_et(t1)
    n = int(math.floor((et1 - et0) / (step_days * 86400.0))) + 1
    # Use calendar step via successive et additions of step_days * 86400 is approximate
    # Prefer stepping in UTC days for alignment with HELIOS sample table
    t0_sim = (t0 - J2000_UTC).total_seconds()
    n = int((t1 - t0).total_seconds() // step_sec) + 1

    bodies_out: dict = {}
    for name, default_id in BODIES.items():
        body_id = BODY_CENTER_OVERRIDE.get(name, default_id)
        print(f"  SPICE {name} id={body_id} n={n}…")
        pos_au = []
        for i in range(n):
            sim = t0_sim + i * step_sec
            dt = datetime.fromtimestamp(J2000_UTC.timestamp() + sim, tz=timezone.utc)
            et = utc_to_et(dt)
            try:
                x, y, z = spk_pos_scene(body_id, et)
            except Exception:
                # Fall back to barycenter id
                x, y, z = spk_pos_scene(default_id, et)
            pos_au.append([
                round(x, 9),
                round(y, 9),
                round(z, 9),
            ])
        bodies_out[name] = {"pos_au": pos_au}

    table = {
        "version": 5,
        "source": "naif-de440s-spice-v5",
        "source_note": (
            "Baked with spiceypy from NAIF de440s.bsp + naif0012.tls + pck00011.tpc + gm_de440.tpc. "
            "Geometric states, ECLIPJ2000 → HELIOS scene axes (Y↔Z). "
            f"Default step={step_days}d for denser outer-window sampling. "
            "EDUCATIONAL offline L3-class table — NOT flight-certified OD, NOT range safety, "
            "NOT a substitute for operational SPICE pipelines."
        ),
        "frame": "HELIOS scene axes from SPICE ECLIPJ2000 (NONE aberration)",
        "t0_iso": t0.isoformat().replace("+00:00", "Z"),
        "t1_iso": t1.isoformat().replace("+00:00", "Z"),
        "t0_sim": t0_sim,
        "step_days": step_days,
        "step_sec": step_sec,
        "n": n,
        "kernels": [p.name for p in KERNEL_DIR.iterdir() if p.is_file()],
        "bodies": bodies_out,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "bake_source": "spice-de440s",
        "flight_ops_certified": False,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(table, separators=(",", ":"))
    OUT.write_text(raw, encoding="utf-8")
    mb = len(raw.encode("utf-8")) / (1024 * 1024)
    print(f"Wrote {OUT}  n={n} size={mb:.2f} MiB  source=spice-de440s")
    spice.kclear()
    if mb > 2.5:
        print("WARNING: exceeds 2.5 MiB soft budget", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
