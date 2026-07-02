#!/usr/bin/env python3
"""Generate Chaos Viewer data from a sm64ds-decomp checkout.

Outputs:
  data/chaos-db.json        lean index: stats + every function with enrichments
                            (matched, srcPath, near-miss divergence/category,
                            floor label, best coddog sibling for unmatched)
  public/details/<mod>.json per-module detail chunks, lazy-fetched by the app:
                            callees/calledBy for every function, annotated
                            disassembly for unmatched, near-miss draft source.

Run from the decomp tree (or pass --repo):
  python /path/to/ChaosViewer/scripts/generate-chaos-db.py --repo C:/Users/bmanu/Documents/sm64ds-decomp

Reuses the repo's own tools (modules/sweep/ledger/worklist/coddog), so numbers
always agree with the treemap and the matcher. No ROM bytes are embedded -
only disassembly TEXT for unmatched functions (same as the public notes).
"""
import argparse
import collections
import json
import pathlib
import sys
import time


def main():
    ap = argparse.ArgumentParser()
    here = pathlib.Path(__file__).resolve().parent.parent
    ap.add_argument("--out", default=str(here / "data" / "chaos-db.json"))
    ap.add_argument("--details-dir", default=str(here / "public" / "details"))
    ap.add_argument("--repo", default=None, help="sm64ds-decomp root (default CWD)")
    ap.add_argument("--no-similar", action="store_true",
                    help="skip the coddog similarity pass (fast regen)")
    ap.add_argument("--project-config", default=str(here / "project.config.json"),
                    help="project branding/prompt config embedded into the db "
                         "(see ADAPTING.md; makes the viewer project-agnostic)")
    args = ap.parse_args()

    root = pathlib.Path(args.repo) if args.repo else pathlib.Path.cwd()
    tools = root / "tools"
    if not (tools / "modules.py").exists():
        print(f"ERROR: no tools/modules.py under {root}; pass --repo", file=sys.stderr)
        sys.exit(2)
    sys.path.insert(0, str(tools))

    import modules as MOD
    import sweep
    import swarm as S
    import ledger as L
    import relocs as R
    import worklist as WL

    t0 = time.time()
    matched = L.matched_set()
    gsyms = R.load_all_syms()

    # ---- near-miss + floor enrichment ------------------------------------
    nm = {}
    nm_path = root / "nearmiss" / "db.jsonl"
    if nm_path.exists():
        for l in nm_path.read_text(encoding="utf-8").splitlines():
            if l.strip():
                r = json.loads(l)
                a = r["addr"]
                key = (r["module"], int(a, 0) if isinstance(a, str) else a)
                nm[key] = r
    cats = {}
    cat_path = root / "progress" / "nm_categories.json"
    if cat_path.exists():
        cats = json.loads(cat_path.read_text())
    floor = {}
    nonm = root / "progress" / "nonmatching.jsonl"
    if nonm.exists():
        for l in nonm.read_text(encoding="utf-8").splitlines():
            if l.strip():
                r = json.loads(l)
                a = r["addr"]
                key = (r.get("module", "arm9"), int(a, 0) if isinstance(a, str) else a)
                floor[key] = r.get("reason", "parked")

    # ---- walk every module ------------------------------------------------
    src_dir = root / "src"
    mods = list(MOD.modules())
    universe = []          # (label, name, addr, size, mod)
    addr_index = {}        # (label, addr) -> name  for callee resolution
    for m in mods:
        label = "arm9" if m["name"] == "main" else m["name"]
        for n, a, sz in sweep.funcs(m):
            universe.append((label, n, a, sz, m))
            addr_index[(label, a)] = n
    print(f"universe: {len(universe)} functions ({time.time()-t0:.0f}s)", flush=True)

    # ---- optional similarity pass (unmatched only) ------------------------
    sims = {}
    if not args.no_similar:
        import coddog as CD
        cmatched, cunmatched, _ = CD.build_corpus()
        print(f"coddog corpus: {len(cmatched)} matched, {len(cunmatched)} unmatched "
              f"({time.time()-t0:.0f}s); scoring...", flush=True)
        for i, u in enumerate(cunmatched):
            top = CD.top_siblings(u, cmatched, 1, 0.5, 0.55, 1.8)
            if top:
                sims[(u["module"], u["addr"])] = (round(top[0][0], 3), top[0][1]["name"])
            if (i + 1) % 500 == 0:
                print(f"  similarity {i+1}/{len(cunmatched)} ({time.time()-t0:.0f}s)", flush=True)

    # ---- per-function pass: callees + disasm ------------------------------
    functions = []
    details = collections.defaultdict(dict)   # label -> name -> {...}
    callee_map = {}                            # (label, name) -> [callee names]
    total_bytes = matched_bytes = matched_n = 0
    data_cache = {}
    for label, name, addr, size, m in universe:
        if label not in data_cache:
            data_cache[label] = (m["bin"].read_bytes(), R.load_relocs_file(m["relocs"]))
        data, relocs = data_cache[label]
        code = data[addr - m["base"]:addr - m["base"] + size]
        is_matched = (label, addr) in matched
        total_bytes += size
        if is_matched:
            matched_bytes += size
            matched_n += 1

        # callees: branch-with-link targets resolved through relocs, then the
        # in-module universe index, then global symbols
        callees = []
        for ins in S.md.disasm(code, 0):
            if ins.mnemonic in ("bl", "blx"):
                added = False
                e = relocs.get(addr + ins.address)
                if e is not None:
                    cn = e[1] if isinstance(e, (tuple, list)) and len(e) > 1 else None
                    if isinstance(cn, str) and cn and cn != name:
                        if cn not in callees:
                            callees.append(cn)
                        added = True
                if not added and ins.op_str.startswith("#"):
                    try:
                        tgt = addr + int(ins.op_str[1:], 0)
                    except ValueError:
                        tgt = None
                    if tgt is not None:
                        cn = addr_index.get((label, tgt)) or gsyms.get(tgt)
                        if isinstance(cn, str) and cn and cn != name and cn not in callees:
                            callees.append(cn)
        callee_map[(label, name)] = callees

        srcPath = None
        for ext in ("c", "cpp"):
            if (src_dir / f"{name}.{ext}").exists():
                srcPath = f"src/{name}.{ext}"
                break

        key = (label, addr)
        rec = {"id": f"{label}:0x{addr:08x}", "module": label, "name": name,
               "addr": addr, "size": size, "matched": bool(is_matched)}
        if srcPath:
            rec["srcPath"] = srcPath
        nmr = nm.get(key)
        if nmr and not is_matched:
            rec["div"] = nmr.get("divergences")
            ck = f"{label}:{addr}:{nmr.get('divergences')}"
            if ck in cats:
                rec["cat"] = cats[ck]
        if key in floor and not is_matched:
            rec["floor"] = str(floor[key])[:60]
        if key in sims and not is_matched:
            rec["sim"], rec["sibling"] = sims[key]
        functions.append(rec)

        det = {}
        if callees:
            det["callees"] = callees
        if not is_matched:
            try:
                lines, _, pool = WL.annotate(name, addr, size, code, relocs, gsyms)
                det["disasm"] = lines
                if pool:
                    det["pool"] = pool
            except Exception:
                pass
            if nmr:
                det["draft"] = nmr.get("c_source")
                det["draftDiv"] = nmr.get("divergences")
        details[label][name] = det

    # calledBy: invert the callee map (function names are unique in this corpus)
    called_by = collections.defaultdict(list)
    for (label, caller), cs in callee_map.items():
        for cn in cs:
            called_by[cn].append(caller)
    for label in details:
        for name, det in details[label].items():
            cb = called_by.get(name)
            if cb:
                det["calledBy"] = sorted(set(cb))[:40]

    # ---- write outputs -----------------------------------------------------
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    project = None
    pc = pathlib.Path(args.project_config)
    if pc.exists():
        project = json.loads(pc.read_text(encoding="utf-8"))
    db = {
        "generatedAt": time.strftime("%Y-%m-%d %H:%M"),
        "project": project,
        "stats": {
            "totalFunctions": len(universe),
            "matchedFunctions": matched_n,
            "totalBytes": total_bytes,
            "matchedBytes": matched_bytes,
            "moduleCount": len(mods),
        },
        "functions": functions,
    }
    out.write_text(json.dumps(db), encoding="utf-8")
    ddir = pathlib.Path(args.details_dir)
    ddir.mkdir(parents=True, exist_ok=True)
    for label, d in details.items():
        (ddir / f"{label}.json").write_text(json.dumps(d), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size//1024} KB) + {len(details)} detail chunks "
          f"-> {ddir} ({time.time()-t0:.0f}s)")
    print(f"stats: {matched_n}/{len(universe)} funcs, {matched_bytes}/{total_bytes} bytes")


if __name__ == "__main__":
    main()
