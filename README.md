# Chaos Viewer

Frutiger Aero themed decomp viewer for https://github.com/bmanus2-dotcom/sm64ds-decomp.

Inspired directly by the Decomp Atlas UI from https://github.com/macabeus/mizuchi.

- Interactive squarified treemap (exact same layout math as the project's README progress SVG)
- Module sidebar + live search/filter that syncs across views
- Prioritize tab with three modes: Nearly done (near-miss drafts by divergence), Best
  scaffolded (closest matched opcode twin via coddog), Biggest bytes (floors excluded)
- Mizuchi-style function details: status badges, clickable caller/callee pills, the
  closest matched twin, annotated disassembly, and the stored near-miss draft
- Prompt Builder emits a COMPLETE ready-to-paste task: repo setup, compiler flags, the
  verify command, pointers to the codegen levers, the sibling scaffold, the annotated
  disassembly, and the near-miss draft when one exists (start 1-6 instructions from done)
- Data pipeline: scripts/generate-chaos-db.py reads the decomp's own tools
  (modules/sweep/ledger/coddog/nearmiss) -> lean 1.8MB index + 73 per-module lazy detail
  chunks under public/details/ (no ROM bytes, disassembly text only)
- Glassmorphism + aero palette (cyan #00AEEF + lime #7FC400 + gloss) derived from the maintainer's GitHub avatar + classic Frutiger Aero references

## Quick start (for contributors / viewers)

```bash
npm install
npm run dev
```

Open http://localhost:5173

To update the data after new matches land in sm64ds-decomp:

```bash
# from a fresh sm64ds-decomp checkout that has extracted/ + progress/ + src/
python /path/to/this/ChaosViewer/scripts/generate-chaos-db.py --repo /path/to/sm64ds-decomp
# (~40s; add --no-similar for a fast regen without the coddog twin pass)
# then hard-refresh the viewer (or restart dev)
```

The generator re-uses the exact `tools/modules.py`, `sweep.py`, and `ledger.py` so byte counts and function lists always match the canonical treemap and the matcher.

## Build + deploy

- `npm run build` — standard dist/
- `npm run build:single` — single-file build (handy for quick drops or Pages)

Static output works great on GitHub Pages. No server required.

## Theme notes

- Dark glassmorphism panels (`backdrop-blur`, subtle borders, soft shadows)
- Primary: aero cyan, accent: fresh lime/green
- Matched functions use a vibrant but tasteful green
- Background orbs for that signature Frutiger Aero "fresh air + future" feeling
- All colors chosen after inspecting the owner's GitHub avatar + classic 2006-2008 palettes (see plan.md for extraction step)

No emojis in source, UI strings, commits, or docs.

## Tech

Vite + React 19 + TS + Tailwind v3 + d3 (for future hierarchy interactions) + the squarify algorithm ported 1:1 from the decomp's own `tools/treemap.py`.

See `plan.md` in the session dir (or repo root if checked in) for the full design, reused files from both source projects, verification steps, and tradeoffs.

## License

MIT (to match both the decomp and Mizuchi).

