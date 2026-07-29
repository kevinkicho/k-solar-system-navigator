#!/usr/bin/env python3
"""
Bake modular dense SPICE position packs for HELIOS (Float32 LE xyz).

Packs (examples):
  mars-moons   Phobos/Deimos relative to Mars (mar099s.bsp)
  earth-moon   Luna relative to Earth (de440s.bsp)
  planets      Major planets heliocentric SSB (de440s.bsp)

Output:
  assets/dense-spk/<pack-id>.meta.json
  assets/dense-spk/<pack-id>.bin

Educational — NOT flight-certified OD. Browser loads packs, never raw .bsp.

Usage:
  python scripts/build-dense-spk-pack.py --pack mars-moons
  python scripts/build-dense-spk-pack.py --pack earth-moon --step-min 30
  python scripts/build-dense-spk-pack.py --pack planets --step-min 360 --t0 2015-01-01T12:00:00Z --t1 2055-01-01T12:00:00Z
  python scripts/build-dense-spk-pack.py --all-tier-a
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
    print("spiceypy not installed: pip install spiceypy", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
KERNEL_DIR = ROOT / "assets" / "kernels"
OUT_DIR = ROOT / "assets" / "dense-spk"
J2000_UTC = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
AU_KM = 149597870.7

# Pack definitions: bodies map name -> (naif_id, center_id)
# center 0 = SSB (heliocentric), 399 = Earth, 499 = Mars, etc.
PACKS: dict[str, dict] = {
    "mars-moons": {
        "title": "Phobos/Deimos Mars-relative (mar099s)",
        "kernels": ["naif0012.tls", "pck00011.tpc", "gm_de440.tpc", "de440s.bsp", "mar099s.bsp"],
        "bodies": {
            "phobos": (401, 499),
            "deimos": (402, 499),
        },
        "default_step_min": 10,
        "default_t0": "2025-01-01T12:00:00Z",
        "default_t1": "2035-01-01T12:00:00Z",
        "frame_note": "parent-relative AU, HELIOS scene (ECLIPJ2000 Y↔Z)",
        "mode": "relative",
        "tier": "A",
    },
    "earth-moon": {
        "title": "Luna Earth-relative (de440s)",
        "kernels": ["naif0012.tls", "pck00011.tpc", "gm_de440.tpc", "de440s.bsp"],
        "bodies": {
            "moon": (301, 399),
        },
        "default_step_min": 30,
        "default_t0": "2020-01-01T12:00:00Z",
        "default_t1": "2035-01-01T12:00:00Z",
        "frame_note": "Earth-centered parent-relative AU, HELIOS scene",
        "mode": "relative",
        "tier": "A",
    },
    "planets-dense": {
        "title": "8 planets heliocentric dense (de440s)",
        "kernels": ["naif0012.tls", "pck00011.tpc", "gm_de440.tpc", "de440s.bsp"],
        # Prefer planet centers; de440s may lack some → fallback barycenters 1–8
        "bodies": {
            "mercury": (199, 0),
            "venus": (299, 0),
            "earth": (399, 0),
            "mars": (499, 0),
            "jupiter": (599, 0),
            "saturn": (699, 0),
            "uranus": (799, 0),
            "neptune": (899, 0),
        },
        "bary_fallback": {
            "mercury": 1,
            "venus": 2,
            "earth": 3,
            "mars": 4,
            "jupiter": 5,
            "saturn": 6,
            "uranus": 7,
            "neptune": 8,
        },
        "default_step_min": 360,  # 6 h — denser than 2 d product JSON
        "default_t0": "2020-01-01T12:00:00Z",
        "default_t1": "2035-01-01T12:00:00Z",
        "frame_note": "heliocentric AU (SSB geometric), HELIOS scene",
        "mode": "heliocentric",
        "tier": "A",
    },
    "galilean": {
        "title": "Io/Europa/Ganymede/Callisto Jupiter-relative (jup365)",
        "kernels": ["naif0012.tls", "pck00011.tpc", "gm_de440.tpc", "de440s.bsp", "jup365.bsp"],
        "bodies": {
            "io": (501, 599),
            "europa": (502, 599),
            "ganymede": (503, 599),
            "callisto": (504, 599),
        },
        "default_step_min": 30,
        "default_t0": "2025-01-01T12:00:00Z",
        "default_t1": "2035-01-01T12:00:00Z",
        "frame_note": "Jupiter-centered parent-relative AU, HELIOS scene",
        "mode": "relative",
        "tier": "B",
    },
    "titan": {
        "title": "Titan Saturn-relative (sat441)",
        "kernels": ["naif0012.tls", "pck00011.tpc", "gm_de440.tpc", "de440s.bsp", "sat441.bsp"],
        "bodies": {
            "titan": (606, 699),
        },
        "default_step_min": 60,
        "default_t0": "2025-01-01T12:00:00Z",
        "default_t1": "2035-01-01T12:00:00Z",
        "frame_note": "Saturn-centered parent-relative AU, HELIOS scene",
        "mode": "relative",
        "tier": "B",
    },
    "triton": {
        "title": "Triton Neptune-relative (nep097)",
        "kernels": ["naif0012.tls", "pck00011.tpc", "gm_de440.tpc", "de440s.bsp", "nep097.bsp"],
        "bodies": {
            "triton": (801, 899),
        },
        "default_step_min": 60,
        "default_t0": "2025-01-01T12:00:00Z",
        "default_t1": "2035-01-01T12:00:00Z",
        "frame_note": "Neptune-centered parent-relative AU, HELIOS scene",
        "mode": "relative",
        "tier": "B",
    },
}


def parse_iso(s: str) -> datetime:
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def utc_to_et(dt: datetime) -> float:
    months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split()
    s = f"{dt.year:04d} {months[dt.month - 1]} {dt.day:02d} {dt.hour:02d}:{dt.minute:02d}:{dt.second:02d} UTC"
    return spice.str2et(s)


def load_kernels(names: list[str]) -> None:
    for name in names:
        path = KERNEL_DIR / name
        if not path.exists():
            raise FileNotFoundError(f"Missing kernel {path} — run scripts/download-kernels.py")
        spice.furnsh(str(path))
        print(f"  furnsh {path.name}")


def pos_scene_au(body_id: int, center_id: int, et: float) -> tuple[float, float, float]:
    state, _lt = spice.spkezr(str(body_id), et, "ECLIPJ2000", "NONE", str(center_id))
    x = state[0] / AU_KM
    y = state[1] / AU_KM
    z = state[2] / AU_KM
    # HELIOS scene: {x,y,z} = ecliptic {X, Z, Y}
    return (x, z, y)


def bake_pack(pack_id: str, step_min: int | None = None, t0: str | None = None, t1: str | None = None) -> Path:
    if pack_id not in PACKS:
        raise SystemExit(f"Unknown pack {pack_id}. Choose: {', '.join(PACKS)}")
    cfg = PACKS[pack_id]
    step_min = step_min if step_min is not None else cfg["default_step_min"]
    t0_dt = parse_iso(t0 or cfg["default_t0"])
    t1_dt = parse_iso(t1 or cfg["default_t1"])
    step_sec = step_min * 60.0
    t0_sim = (t0_dt - J2000_UTC).total_seconds()
    n = int((t1_dt - t0_dt).total_seconds() // step_sec) + 1
    order = list(cfg["bodies"].keys())

    print(f"\n=== Pack {pack_id}: {cfg['title']} ===")
    print(f"  step={step_min} min  n={n}  {t0_dt.isoformat()} → {t1_dt.isoformat()}")
    print(f"  bodies={order}")
    load_kernels(cfg["kernels"])

    blobs: list[bytes] = []
    bary_fb = cfg.get("bary_fallback") or {}
    for name in order:
        body_id, center_id = cfg["bodies"][name]
        print(f"  SPICE {name} id={body_id} center={center_id}…")
        floats: list[float] = []
        used_id = body_id
        for i in range(n):
            sim = t0_sim + i * step_sec
            dt = datetime.fromtimestamp(J2000_UTC.timestamp() + sim, tz=timezone.utc)
            et = utc_to_et(dt)
            try:
                x, y, z = pos_scene_au(body_id, center_id, et)
            except Exception:
                fb = bary_fb.get(name)
                if fb is None:
                    raise
                used_id = fb
                x, y, z = pos_scene_au(fb, center_id, et)
            floats.extend((x, y, z))
        blobs.append(struct.pack(f"<{len(floats)}f", *floats))
        r0 = math.sqrt(floats[0] ** 2 + floats[1] ** 2 + floats[2] ** 2)
        if used_id != body_id:
            print(f"    (used barycenter id={used_id} for some/all epochs)")
        if cfg["mode"] == "relative":
            print(f"    |r|_0 ≈ {r0 * AU_KM:.1f} km")
        else:
            print(f"    |r|_0 ≈ {r0:.6f} AU")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bin_name = f"{pack_id}.bin"
    meta_name = f"{pack_id}.meta.json"
    raw = b"".join(blobs)
    (OUT_DIR / bin_name).write_bytes(raw)

    meta = {
        "pack_id": pack_id,
        "version": 1,
        "title": cfg["title"],
        "source": f"spice-dense-{pack_id}",
        "bake_source": "spice-dense-pack",
        "mode": cfg["mode"],
        "frame": cfg["frame_note"],
        "t0_iso": t0_dt.isoformat().replace("+00:00", "Z"),
        "t1_iso": t1_dt.isoformat().replace("+00:00", "Z"),
        "t0_sim": t0_sim,
        "step_sec": step_sec,
        "step_min": step_min,
        "n": n,
        "dtype": "float32_le",
        "layout": "bodies sequential: each n*(x,y,z) float32",
        "bodies": order,
        "body_naif": {k: list(v) for k, v in cfg["bodies"].items()},
        "body_offsets": {name: i * n * 3 * 4 for i, name in enumerate(order)},
        "bin": bin_name,
        "kernels": cfg["kernels"],
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "flight_ops_certified": False,
        "tier": cfg.get("tier", "A"),
        "lazy": cfg.get("tier", "A") != "A",
        "size_bytes": len(raw),
        "size_miB": round(len(raw) / (1024 * 1024), 3),
        "source_note": (
            "Educational dense SPICE-baked sample pack — NOT flight-certified OD, "
            "NOT range safety. Geometric NONE states, ECLIPJ2000 → HELIOS scene."
        ),
    }
    (OUT_DIR / meta_name).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"  Wrote {OUT_DIR / bin_name} ({meta['size_miB']} MiB) + {meta_name}")
    spice.kclear()
    return OUT_DIR / meta_name


def write_registry() -> None:
    """Index of packs on disk for lazy client loading (meta only, no binaries)."""
    packs = []
    for meta_path in sorted(OUT_DIR.glob("*.meta.json")):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        packs.append({
            "pack_id": meta.get("pack_id") or meta_path.stem.replace(".meta", ""),
            "title": meta.get("title"),
            "bodies": meta.get("bodies") or [],
            "mode": meta.get("mode"),
            "tier": meta.get("tier", "A"),
            "lazy": meta.get("lazy", False),
            "step_min": meta.get("step_min"),
            "t0_iso": meta.get("t0_iso"),
            "t1_iso": meta.get("t1_iso"),
            "size_miB": meta.get("size_miB"),
            "bin": meta.get("bin"),
            "meta": meta_path.name,
        })
    body_index: dict[str, str] = {}
    for p in packs:
        for b in p["bodies"]:
            body_index[b] = p["pack_id"]
    reg = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "packs": packs,
        "body_to_pack": body_index,
        "note": "Tier A packs auto-load; Tier B packs lazy-load when route needs them.",
    }
    out = OUT_DIR / "registry.json"
    out.write_text(json.dumps(reg, indent=2), encoding="utf-8")
    print(f"Wrote registry {out}  packs={len(packs)}")


def main() -> None:
    args = sys.argv[1:]
    if "--all-tier-a" in args:
        bake_pack("mars-moons", step_min=10)
        bake_pack("earth-moon", step_min=30)
        bake_pack("planets-dense", step_min=360)
        write_registry()
        return
    if "--all-tier-b" in args:
        bake_pack("galilean", step_min=30)
        # Titan/Triton need large kernels (sat441 ~631 MiB, nep097 ~100 MiB) when present
        try:
            bake_pack("titan", step_min=60)
        except FileNotFoundError as e:
            print(f"  skip titan: {e}")
        try:
            bake_pack("triton", step_min=60)
        except FileNotFoundError as e:
            print(f"  skip triton: {e}")
        write_registry()
        return
    if "--registry-only" in args:
        write_registry()
        return

    pack = None
    step_min = None
    t0 = t1 = None
    if "--pack" in args:
        pack = args[args.index("--pack") + 1]
    if "--step-min" in args:
        step_min = int(args[args.index("--step-min") + 1])
    if "--t0" in args:
        t0 = args[args.index("--t0") + 1]
    if "--t1" in args:
        t1 = args[args.index("--t1") + 1]
    if not pack:
        print(__doc__)
        print("Packs:", ", ".join(PACKS))
        sys.exit(1)
    bake_pack(pack, step_min=step_min, t0=t0, t1=t1)
    write_registry()


if __name__ == "__main__":
    main()
