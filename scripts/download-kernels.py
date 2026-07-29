#!/usr/bin/env python3
"""Download NAIF generic kernels needed for HELIOS L3 DE/SPICE bake.

Does NOT ship flight-certified ops. Educational / research use of public kernels.
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KERNEL_DIR = ROOT / "assets" / "kernels"
BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"

FILES = [
    ("lsk/naif0012.tls", "naif0012.tls"),
    ("pck/pck00011.tpc", "pck00011.tpc"),
    ("pck/gm_de440.tpc", "gm_de440.tpc"),
    ("spk/planets/de440s.bsp", "de440s.bsp"),  # ~32 MiB short DE440 planetary SPK
]


def main() -> None:
    KERNEL_DIR.mkdir(parents=True, exist_ok=True)
    for rel, name in FILES:
        dest = KERNEL_DIR / name
        if dest.exists() and dest.stat().st_size > 1000:
            print(f"exists {dest} ({dest.stat().st_size} bytes)")
            continue
        url = f"{BASE}/{rel}"
        print(f"downloading {url} → {dest}")
        urllib.request.urlretrieve(url, dest)
        print(f"  wrote {dest.stat().st_size} bytes")
    print("done")


if __name__ == "__main__":
    main()
