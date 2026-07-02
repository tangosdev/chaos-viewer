#!/usr/bin/env python3
"""Generate data/chaos-db.json for Chaos Viewer from a sm64ds-decomp checkout.

Run from inside (or with PYTHONPATH) a sm64ds-decomp tree that has:
  - extracted/ (arm9_dec.bin + overlays)
  - config/arm9/...
  - progress/matched.jsonl (and optionally nonmatching)
  - src/ (for srcPath lookup)

Example (from ChaosViewer repo):
  cd /path/to/sm64ds-decomp
  python /path/to/ChaosViewer/scripts/generate-chaos-db.py --out /path/to/ChaosViewer/data/chaos-db.json

This reuses the exact modules + sweep + ledger logic so numbers always match
the treemap and the real matcher. No ROM bytes are embedded.

Schema matches the TS interface in the viewer.
"""
import argparse
import json
import pathlib
import sys
import time

# Allow running from outside the decomp tree by inserting its tools/
REPO = pathlib.Path(__file__).resolve().parent.parent  # will be overridden if needed
# When invoked with the decomp as CWD, this still works because we add ./tools below

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/chaos-db.json", help="Output JSON path (relative or absolute)")
    ap.add_argument("--repo", default=None, help="Path to sm64ds-decomp root (defaults to CWD)")
    args = ap.parse_args()

    root = pathlib.Path(args.repo) if args.repo else pathlib.Path.cwd()
    tools = root / "tools"
    if not (tools / "modules.py").exists():
        print(f"ERROR: Could not find tools/modules.py under {root}. Pass --repo or cd into the decomp checkout first.", file=sys.stderr)
        sys.exit(2)

    sys.path.insert(0, str(tools))

    import modules as MOD
    import sweep as SW
    import ledger as L

    matched = L.matched_set()

    functions: list[dict] = []
    total_bytes = 0
    matched_bytes = 0
    mod_set = set()

    for mod in MOD.modules():
        label = "arm9" if mod["name"] == "main" else mod["name"]
        mod_set.add(label)
        for name, addr, size in SW.funcs(mod):
            key = (label, addr)
            is_matched = key in matched
            total_bytes += size
            if is_matched:
                matched_bytes += size

            src_path = None
            if is_matched:
                c = root / "src" / f"{name}.c"
                cpp = root / "src" / f"{name}.cpp"
                if c.exists():
                    src_path = f"src/{name}.c"
                elif cpp.exists():
                    src_path = f"src/{name}.cpp"

            functions.append({
                "id": f"{label}:0x{addr:08x}",
                "module": label,
                "name": name,
                "addr": addr,
                "size": size,
                "matched": bool(is_matched),
                "srcPath": src_path,
            })

    db = {
        "generatedAt": time.strftime("%Y-%m-%d"),
        "stats": {
            "totalFunctions": len(functions),
            "matchedFunctions": sum(1 for f in functions if f["matched"]),
            "totalBytes": total_bytes,
            "matchedBytes": matched_bytes,
            "moduleCount": len(mod_set),
        },
        "functions": functions,
    }

    out_path = pathlib.Path(args.out)
    if not out_path.is_absolute():
        # If running from decomp, write relative to the provided --out or default
        out_path = (root / args.out) if args.repo else (pathlib.Path.cwd() / args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(db, indent=2) + "\n", encoding="utf-8")

    print(f"wrote {out_path}")
    print(f"  functions: {db['stats']['matchedFunctions']}/{db['stats']['totalFunctions']} "
          f"({100*db['stats']['matchedFunctions']/max(1,db['stats']['totalFunctions']):.2f}%)")
    print(f"  bytes:     {db['stats']['matchedBytes']}/{db['stats']['totalBytes']} "
          f"({100*db['stats']['matchedBytes']/max(1,db['stats']['totalBytes']):.2f}%)")
    print(f"  modules:   {db['stats']['moduleCount']}")


if __name__ == "__main__":
    main()
