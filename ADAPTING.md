# Adapting Chaos Viewer to your decomp project

The viewer is project-agnostic: everything it knows about a specific decomp comes
from two things you provide.

1. **`project.config.json`** - branding + prompt text (embedded into the data by the
   generator, read by the app at build time)
2. **The data files** - `data/chaos-db.json` and optional `public/details/<module>.json`
   chunks, produced by ANY script that emits the schema below

The included `scripts/generate-chaos-db.py` is the reference generator for
[sm64ds-decomp](https://github.com/bmanus2-dotcom/sm64ds-decomp); write your own for
your project and everything else works unchanged.

## 1. project.config.json

```jsonc
{
  "name": "your-decomp",                  // shown under the title, used in prompts
  "title": "Chaos Viewer",                // header title
  "tagline": "your subtitle",
  "github": "https://github.com/you/your-decomp",
  "compiler": "your compiler + exact flags line",       // omit to hide
  "cppNote": "any language-mode note for contributors", // omit to hide
  "setup": "clone {github} and follow CONTRIBUTING.md ...",
  "verifyCommand": "python tools/verify.py --func {name} --addr 0x{addrHex} --size 0x{sizeHex}",
  "readFirst": "docs your contributors should read before writing code",
  "rules": "legal/purity rules line",
  "claimsApi": "/api/claims",             // omit BOTH to hide the lock UI entirely
  "claimsProxyTarget": "https://your-claims-service"
}
```

`verifyCommand` placeholders: `{name} {module} {addr} {addrHex} {size} {sizeHex} {github}`.

If you use a claims/locking service, point the vite dev proxy at it in
`vite.config.ts` (the `/api/claims` entry) and have it answer
`GET /api/claims -> {"ok": true, "claims": [{module, start, end, handle}]}`
(`start`/`end` as numbers or "0x..." strings). No service? Delete `claimsApi`
from the config and the UI disappears.

## 2. Data schema

### data/chaos-db.json (required)

```jsonc
{
  "generatedAt": "2026-07-02 12:00",
  "project": { ...contents of project.config.json... },
  "stats": {
    "totalFunctions": 11323, "matchedFunctions": 7743,
    "totalBytes": 2210852, "matchedBytes": 828680, "moduleCount": 73
  },
  "functions": [
    {
      "id": "moduleLabel:0x02012345",   // any unique string; module:addr recommended
      "module": "moduleLabel",
      "name": "func_02012345",
      "addr": 33628997,                  // number
      "size": 164,                       // bytes, number
      "matched": false,
      // everything below is OPTIONAL - features light up when present:
      "srcPath": "src/func.c",          // "View matched source" link (github/blob/main/<srcPath>)
      "div": 2,                          // near-miss divergence -> NEAR-MISS badge + "Nearly done" tab
      "cat": "register allocation",      // divergence category label
      "floor": "why this is parked",     // FLOOR badge + excluded from Prioritize
      "sim": 0.87,                       // best similarity score -> "Best scaffolded" tab
      "sibling": "func_02012000"         // that most-similar matched function
    }
  ]
}
```

### public/details/<module>.json (optional, lazy-fetched per module)

```jsonc
{
  "func_02012345": {
    "callees": ["func_a", "func_b"],     // clickable pills
    "calledBy": ["func_c"],              // clickable pills
    "disasm": ["  push {r4, lr}", ...],  // annotated text lines -> details + prompt
    "pool":   ["+0x9c: &some_global"],   // literal pool notes appended to the prompt
    "draft": "int f(void) { ... }",      // stored near-miss source -> shown + embedded in prompt
    "draftDiv": 2
  }
}
```

Skip the chunks entirely and the viewer still works (badges, treemap, prioritize,
prompts without disassembly).

## 3. Where your numbers come from - three recipes

- **You have your own progress database** (like sm64ds-decomp): write a script that
  walks it, mirroring `scripts/generate-chaos-db.py`.
- **objdiff / dtk-template projects** (GC/Wii): `objdiff-cli report generate` emits
  units with per-function `fuzzy_match_percent` - map complete matches to
  `matched: true`, partial to a near-miss-style entry, unit name to `module`.
- **frogress / decomp.dev projects** (pret-style): the progress API gives per-category
  counts; you will need your symbol map (name/addr/size per overlay) for the function
  list and your repo's src/ layout for `matched`.

## 4. Ship it

```bash
npm run build          # static dist/ (index + data chunks) - host anywhere (GitHub Pages)
npm run build:single   # one self-contained HTML file - email it, attach it to a release
```

For GitHub Pages set `base` in `vite.config.ts` to your repo path and publish `dist/`.
Regenerate the data whenever matches land; the app is a pure function of the data.
