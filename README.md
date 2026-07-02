# Chaos Viewer

An interactive progress atlas for matching-decompilation projects. Browse every function
as a treemap, find the best functions to work on next, and copy a complete, ready-to-paste
AI prompt for any of them.

Hosted: **https://bmanus2-dotcom.github.io/chaos-viewer/**

## What it does

- **Treemap** of every function, sized by bytes, green = matched / gray = unmatched.
- **Search + module browser** with hide-matched / hide-unmatched toggles.
- **Prioritize** tab, three ways to pick your next target: *Nearly done* (stored near-miss
  drafts, fewest instructions off), *Best scaffolded* (closest already-matched twin), and
  *Biggest bytes*.
- **Function details**: callers/callees, annotated disassembly, and the stored near-miss draft.
- **Prompt Builder**: one click copies a full matching task (setup, compiler flags, the verify
  command, the closest scaffold, the disassembly, and the near-miss draft when one exists) that
  tells the AI to open a PR back to your repo. Queue several functions into one batch prompt.

## Use it for your own decomp

You don't host anything. Use the hosted viewer above and point it at your project's data.

1. **Generate your data file.** Use `scripts/generate-chaos-db.py` (the reference generator,
   which reads a decomp's own tooling) or any script that emits the schema in
   [`ADAPTING.md`](ADAPTING.md). It writes `data/chaos-db.json` plus per-module
   `details/*.json` chunks. No ROM or extracted assets are included, only disassembly text.
2. **Commit them to your repo** on the default branch, e.g. `data/chaos-db.json` and
   `data/details/`. (Any CORS-reachable location works; committing to the repo is simplest.)
3. **Open the viewer and enter your repo URL.** It finds your published data automatically.
   Or share a direct link that's already set up:
   `https://bmanus2-dotcom.github.io/chaos-viewer/?data=<raw-url-to-your-chaos-db.json>`

If a repo has no published data file, the viewer stays on the setup screen and tells you to
generate one, so it won't load someone else's data by mistake.

## The config file

Your project's branding, compiler line, verify command, and links come from a
`project.config.json` that the generator embeds into your `chaos-db.json`. Copy
[`project.config.example.json`](project.config.example.json) and fill it in:

```jsonc
{
  "name": "your-decomp",
  "github": "https://github.com/you/your-decomp",
  "compiler": "your compiler + exact flags (shown to the AI)",
  "setup": "clone {github} and follow CONTRIBUTING.md ...",
  "verifyCommand": "python tools/verify.py --func {name} --addr 0x{addrHex} --size 0x{sizeHex}",
  "readFirst": "docs a contributor should read first",
  "rules": "any legal / originality rules",
  "discord": "optional; auto-detected from your README if present"
}
```

Placeholders in `verifyCommand`: `{name} {module} {addr} {addrHex} {size} {sizeHex} {github}`.

## Run / regenerate locally (optional)

```bash
npm install
npm run dev            # http://localhost:5173
# regenerate data from a decomp checkout:
python scripts/generate-chaos-db.py --repo /path/to/your-decomp
```

## License

MIT. UI inspired by the [Mizuchi Decomp Atlas](https://github.com/macabeus/mizuchi).
