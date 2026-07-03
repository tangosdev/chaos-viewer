# Chaos Viewer

An interactive progress atlas and contributor funnel for matching-decompilation projects.
It shows every function in the game on one screen, ranks what is worth working on next,
and builds a ready-to-paste AI prompt for any of them.

**Live:** https://bmanus2-dotcom.github.io/chaos-viewer/
**View-only mirror (no sign-in, no claiming):** https://bmanus2-dotcom.github.io/chaos-viewer/public/

## Why I made this

I run [sm64ds-decomp](https://github.com/bmanus2-dotcom/sm64ds-decomp), a from-scratch
matching decompilation of Super Mario 64 DS. A matching decomp is thousands of small,
verifiable tasks: pick a function, write C, compile it with the original compiler, and
check it against the ROM byte for byte. The hard part is not the individual functions, it is the
coordination: knowing what is done, what is close, what is worth doing next, and who is
already working on what.

I had a static treemap image in the README and a markdown table for claims. Both were
always stale, and neither helped anyone actually start. Chaos Viewer replaced them with
one live page: the whole game as a map, the near-misses ranked by
how close they are, live locks so two people never grind the same function, and a Prompt
Builder that turns any function into a complete task an AI assistant can run. The goal is
that someone who has never touched the project can land their first verified match in one
sitting, and get credit for it under their own name.

## What it does

- **Treemap of the whole game.** Every function drawn to scale, matched in green,
  unmatched in gray, grouped by module. Canvas-rendered, so ten thousand functions
  redraw instantly. Click any rectangle to open that function.
- **Priorities.** Three ranked lists for picking your next target: *Nearly done* (stored
  near-miss drafts, fewest diverging instructions first), *Best scaffolded* (functions
  with a nearly identical already-matched twin to copy from), and *Biggest bytes*.
  Anything claimed by someone else drops off the lists until it is done or released.
- **Function details.** Callers and callees as clickable pills, annotated disassembly,
  and the stored near-miss draft when one exists.
- **Prompt Builder.** One click copies a complete matching task: project setup, the exact
  compiler and flags, the verify command, the closest matched scaffold, the annotated
  disassembly, the near-miss draft, and instructions to open a PR back to the repo when
  it matches. Queue up to 16 functions into a single batch prompt, or send it straight
  to claude.ai, the Claude desktop app, Grok, Cursor, or your terminal.
- **Live claims.** Locked functions glow gold on the treemap and vanish from Priorities.
  Locks come from a claims API and from the repo's CLAIMS.md, merged, refreshed every
  minute.
- **Claim from the page.** Sign in with GitHub and claim functions in your own name, no
  keys to manage. Prompts built while signed in carry a short-lived token so your AI
  assistant locks its own ranges before writing code, renews while it works, and releases
  when it is done.
- **Contributor colors.** Flip a toggle and every matched function tints by who matched
  it, with a legend linking to each contributor's GitHub. Credit comes from git authorship, so it is
  automatic and permanent, and nobody has to remember to update a list.
- **Always current.** The data regenerates in CI on every push to the project repo, and
  the page fetches fresh on every open, so nobody has to regenerate a progress image by hand.
- **Themes.** Five glossy themes.

## Use it on your project

You do not host anything and you do not fork this repo. The hosted viewer is
project-agnostic: it reads everything it knows about a project from one JSON file that
you publish.

1. **Generate your data.** Any script that emits the schema in
   [`ADAPTING.md`](ADAPTING.md) works. `scripts/generate-chaos-db.py` is the reference
   generator (it reads sm64ds-decomp's own tooling); the sm64ds repo also has a CI-safe
   generator that runs on every push with no ROM present, which is the pattern to copy.
   The data is a lean index (name, address, size, matched, plus optional near-miss and
   similarity enrichments) and optional per-module detail chunks with annotated
   disassembly text.
2. **Publish it.** The recommended home is an orphan `chaos-data` branch of your repo,
   so the data never bloats your main history. `data/chaos-db.json` on your default
   branch works too.
3. **Point the viewer at it.** Open the hosted viewer and paste your repo URL. It
   probes the standard locations and finds your data. Share a preconfigured link
   (`?data=<raw-url-to-your-chaos-db.json>`) and your contributors skip even that step.

Branding, compiler line, verify command, rules, Discord invite, and the optional claims
API all come from a config block embedded in your data file, so the viewer speaks your
project's language everywhere: the prompts it builds reference your tools, your docs,
and your repo.

If a repo has no published data, the viewer stays on the setup screen rather than
guessing, so it never shows someone else's project by mistake.

## Building it yourself

```
npm install
npm run dev            # local dev server
npm run build          # full build (claims + GitHub sign-in)
npm run build:public   # view-only build: no locks, no sign-in, prompt copying kept
```

Both builds are static files that host anywhere. The view-only build strips the
interactive layer at compile time, which is what the public mirror above runs.

## Credits

**This project would be half of what it is without
[andrewboudreau](https://github.com/andrewboudreau).** He built and runs the claims
coordination service that powers the live locks, the GitHub sign-in, and the whole
claim-from-the-page flow, and designed its agent-facing API so AI assistants can lock
their own work safely. On the decomp side he has matched hundreds of functions across
arm9 and dozens of overlays, contributed compiler-behavior research that directly raised
every contributor's hit rate, hardened the matching workflow, and reported and helped fix real scheduler bugs. The viewer's contributor coloring exists in large part so that work like his
is permanently visible. Thank you, Andrew.

Inspired by [Mizuchi's Decomp Atlas](https://github.com/macabeus/mizuchi). Built for
[sm64ds-decomp](https://github.com/bmanus2-dotcom/sm64ds-decomp) and released under the
MIT License so any decomp project can use it.

No copyrighted ROM, binaries, or game assets are included or distributed. Unmatched
functions are described as annotated disassembly text, which leaves the published data
as soon as a function is matched. All trademarks and game assets belong to their
respective owners.

## Coming soon

More tools for the matching-decomp workflow are in the pipeline:

- **Verify from the page**: paste a candidate, get the instruction diff back, no local
  toolchain needed
- **PR from the page**: a verified match becomes a pull request without leaving the
  browser
- **More project adapters** for common decomp toolchains (splat, objdiff, frogress)
