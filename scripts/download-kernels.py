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

# Core always; optional satellite SPKs for Tier B dense packs
FILES_CORE = [
    ("lsk/naif0012.tls", "naif0012.tls"),
    ("pck/pck00011.tpc", "pck00011.tpc"),
    ("pck/gm_de440.tpc", "gm_de440.tpc"),
    ("spk/planets/de440s.bsp", "de440s.bsp"),  # ~32 MiB short DE440 planetary SPK
    ("spk/satellites/mar099s.bsp", "mar099s.bsp"),  # ~64 MiB Mars moons
]

FILES_TIER_B = [
    # Galilean moons 501–504 (large but required for SPICE-dense Tier B)
    ("spk/satellites/jup365.bsp", "jup365.bsp"),  # ~1.1 GiB
    # Titan 606
    ("spk/satellites/sat441.bsp", "sat441.bsp"),  # ~631 MiB
    # Triton 801
    ("spk/satellites/nep097.bsp", "nep097.bsp"),  # ~100 MiB
]


def download_list(files: list[tuple[str, str]]) -> None:
    KERNEL_DIR.mkdir(parents=True, exist_ok=True)
    for rel, name in files:
        dest = KERNEL_DIR / name
        if dest.exists() and dest.stat().st_size > 1000:
            print(f"exists {dest} ({dest.stat().st_size} bytes)")
            continue
        url = f"{BASE}/{rel}"
        print(f"downloading {url} → {dest}")
        urllib.request.urlretrieve(url, dest)
        print(f"  wrote {dest.stat().st_size} bytes")


def main() -> None:
    import sys
    files = list(FILES_CORE)
    if "--tier-b" in sys.argv or "--all" in sys.argv:
        files.extend(FILES_TIER_B)
    download_list(files)
    print("done")


if __name__ == "__main__":
    main()
