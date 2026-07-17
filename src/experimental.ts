/**
 * Attempt-tree / provenance helpers for this fork.
 *
 * This viewer always uses the experimental tracking model (MATCH_RESULT prompts,
 * matchProvenance as how-record). There is no default/classic dual mode here —
 * discuss any upstream contribution with Tango separately.
 */

export interface MatchProvenance {
  kind: 'human' | 'ai'
  /** AI model slug (e.g. grok-4.5). Required for complete AI records. */
  model?: string
  /** Reasoning / effort (highest first): max | xhigh | high | medium | low | none */
  reasoning?: string
  /** Harness slug: grok-build, cursor-agent, … */
  harness?: string
  /** Optional note (human or free-form). */
  note?: string
  /** Legacy operator field — ignore for credit; use function.author. */
  by?: string
}

export interface ExpFunction {
  id: string
  module: string
  name: string
  addr: number
  size: number
  matched: boolean
  author?: string
  matchProvenance?: MatchProvenance
}

export interface ExpDetail {
  draft?: string
  draftDiv?: number
}

/**
 * Compact how line for UI — values only, no model=/harness= keys.
 * AI example: "Grok 4.5 (high) · grok-build"
 */
export function formatHowDisplay(opts: {
  kind?: string | null
  model?: string | null
  reasoning?: string | null
  harness?: string | null
  note?: string | null
}): string {
  const kind = (opts.kind || '').trim().toLowerCase()
  if (kind === 'human') {
    const note = opts.note?.trim()
    return note ? `human · ${note}` : 'human'
  }
  const modelSlug = opts.model?.trim() || ''
  const reasoning = opts.reasoning?.trim() || ''
  const harness = opts.harness?.trim() || ''
  if (!modelSlug && !reasoning && !harness) {
    return kind === 'ai' ? 'ai' : kind
  }
  // Prefer known labels (Grok 4.5); unknown slugs → spaces not dashes
  let modelLabel = ''
  if (modelSlug) {
    const known = provenanceModelLabel(modelSlug)
    modelLabel = known !== modelSlug ? known : modelSlug.replace(/-/g, ' ')
  }
  const modelPart = modelLabel
    ? reasoning
      ? `${modelLabel} (${reasoning})`
      : modelLabel
    : kind === 'ai'
      ? 'ai'
      : ''
  return [modelPart, harness].filter(Boolean).join(' · ')
}

export function provenanceSummary(p: MatchProvenance): string {
  return formatHowDisplay({
    kind: p.kind,
    model: p.model,
    reasoning: p.reasoning,
    harness: p.harness,
    note: p.note,
  })
}

/** AI records need model + reasoning + harness; human only needs kind. */
export function provenanceIsComplete(p: MatchProvenance): boolean {
  if (p.kind === 'human') return true
  if (p.kind === 'ai') {
    return !!(p.model?.trim() && p.reasoning?.trim() && p.harness?.trim())
  }
  return false
}

export type ProvenanceStatus =
  | { kind: 'not_matched' }
  | { kind: 'required_missing' }
  | { kind: 'present'; summary: string }
  | { kind: 'incomplete'; summary: string }

/** Matched functions must carry a complete how-record. */
export function provenanceStatus(
  fn: Pick<ExpFunction, 'matched' | 'matchProvenance'>,
): ProvenanceStatus {
  if (!fn.matched) return { kind: 'not_matched' }
  const p = fn.matchProvenance
  if (!p) return { kind: 'required_missing' }
  if (!provenanceIsComplete(p)) {
    return { kind: 'incomplete', summary: provenanceSummary(p) }
  }
  return { kind: 'present', summary: provenanceSummary(p) }
}

export function isGhidraScaffoldText(s: string): boolean {
  const head = s.slice(0, 400)
  return (
    head.includes('GHIDRA SCAFFOLD') ||
    (head.includes('Ghidra') && head.includes('decompiler')) ||
    head.includes('/* The decompiler')
  )
}

/** Overlay after the classic prompt header (always applied in this fork). */
export function matchResultHeaderAddon(
  author: string,
  sessionScope: 'focused' | 'batch',
  batchSize: number,
): string {
  const authorLine =
    author === 'YOUR_GITHUB_LOGIN'
      ? '  author     = REQUIRED credit field: operator GitHub login (same as classic chaos-viewer).\n               Put it on MATCH_RESULT.author — NOT inside matchProvenance.'
      : `  author     = REQUIRED credit: already set to "${author}" (GitHub login).\n               Put this on MATCH_RESULT.author — NOT inside matchProvenance. Same field as contributor colors.`
  const scopeLine =
    sessionScope === 'focused'
      ? `  sessionScope = focused  (this prompt is for ONE function; batchSize=${batchSize})\n               Keep sessionScope=focused and batchSize=1 on every MATCH_RESULT.`
      : `  sessionScope = batch  (this prompt covers ${batchSize} functions together)\n               Keep sessionScope=batch and batchSize=${batchSize} on every MATCH_RESULT.\n               Do not claim focused unless you later re-ran a solo session for one function.`

  return `

======================================================================
WHO vs HOW vs ATTEMPT TREE
======================================================================
WHO (credit, contributor colors) → function field \`author\` (GitHub login)
HOW  (final method when banked)  → \`matchProvenance\` only
EVERY TRY (including dead ends)  → one MATCH_RESULT node in an **attempt tree**

ATTEMPT TREE (required mental model — not a flat list of anonymous tries):
  Each try is a **node**. Links make history reconstructable later:

    arm9:0x020009e0  (functionId — stable; never log name alone)
    ├─ near_miss div=40  base=scratch          [attemptId=01J…]
    │  ├─ no_progress    parent=01J…           [01K…]  ← same base, no win
    │  └─ near_miss div=12 improved parent=…   [01L…]  ← new settings, better
    │     └─ matched     parent=01L…           [01M…]  ← continued from best tip

  IDENTITY (required every try — without this the log cannot be queried later):
  - functionId  = atlas function.id (e.g. module:0xaddr). Stable key.
  - attemptId   = unique id for THIS node. Prefer ULID/UUID. NEVER reuse.
    NEVER "a1"/"try2". Do not embed wall-clock times in ids.
  - parentAttemptId = attemptId of the node you built on, or null for a new root.
  - schemaVersion = 1  (bump only when field meanings change).
  - Privacy: do NOT record loggedAt, ts, or any wall-clock finish time.

  Rules:
  - First try for a function: parentAttemptId = null, base.kind = scratch
    (or matched_sibling / imported draft if you truly started from one).
  - Every later try MUST set parentAttemptId to the node you **built on**
    (usually the best near-miss so far, not "whatever you last typed").
  - no_progress / compile_error / failed still get a node under that parent
    so dead ends stay visible as siblings, not erased history.
  - When you improve a near-miss, parent = the previous best node you forked
    from; set improvedNearMiss: true. Next work continues from the new node.
  - When you abandon a branch and restart from scratch or from an older node,
    parentAttemptId must reflect that fork (not pretend it was linear).
  - Never invent a parentAttemptId that was not logged earlier for this functionId.

  DRAFT SOURCE TRACKERS (required every try — two independent booleans):
  - usedNearMissDraft: true if this try used a stored near-miss / NONMATCHING C
    draft (detail draft, // NONMATCHING src, previous best C tip).
  - usedGhidraDraft: true if this try used a Ghidra decompiler scaffold
    (GHIDRA SCAFFOLD block / ghidra_out).

  INHERITANCE (important — lineage, not only "opened the file this session"):
  - If parentAttemptId is set, OR in the parent's flags:
      usedGhidraDraft    = (this try used Ghidra)    OR parent.usedGhidraDraft
      usedNearMissDraft  = (this try used near-miss) OR parent.usedNearMissDraft
  - Set a flag false only if neither this try nor any ancestor used that source.
  - Trackers are SEPARATE (both may be true). They do not replace base.kind /
    parentAttemptId — still set those.

CONTEXT FOCUS (required on EVERY attempt — same tier as model/harness):
  sessionScope + batchSize must appear on every MATCH_RESULT, every try.
  focused — session was only for this one function
  batch   — multi-function session (this target was one of N)

${scopeLine}

You MUST emit a MATCH_RESULT for **each function in this batch on every
attempt**, even when:
  - nothing improved
  - near-miss did not beat the previous best
  - compile failed
  - you gave up / skipped

status values:
  matched | near_miss | no_progress | compile_error | failed | skipped

matchProvenance answers HOW only:
  kind=ai    → model + reasoning + harness (slug tokens, no spaces)
  kind=human → human match (optional note); credit still goes in \`author\`

${authorLine}

TOKEN RULES for matchProvenance (ai):
  - model:   GOOD: grok-4.5  claude-opus-4   BAD: "Grok 4.5"
  - harness: GOOD: grok-build  cursor-agent  BAD: "Grok Build"
  - reasoning: max | xhigh | high | medium | low | none  (max is highest)
  Do NOT put the operator name in matchProvenance (no \`by\` field).

Do NOT invent a match. VERIFY until MATCH.
Do NOT omit MATCH_RESULT because the try was "useless" — useless tries are data.
Do NOT put secrets or full chain-of-thought dumps into the log.`
}

export type DraftPromptOpts = {
  model?: string
  reasoning?: string
  harness?: string
  /** When false, do not treat detail draft as near-miss (default true). */
  includeNearMissDraft?: boolean
  /** When false, do not treat Ghidra-tagged detail draft as scaffold (default true). */
  includeGhidraDraft?: boolean
}

/** Fixed model list (parity with chaos-viewer-cli Prompt `m` picker). */
export const PROVENANCE_MODELS: { slug: string; label: string }[] = [
  { slug: 'grok-4.5', label: 'Grok 4.5' },
  { slug: 'composer-2.5', label: 'Composer 2.5' },
  { slug: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { slug: 'claude-opus-4.8', label: 'Claude Opus 4.8' },
  { slug: 'claude-opus-4.7', label: 'Claude Opus 4.7' },
  { slug: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
  { slug: 'claude-fable-5', label: 'Claude Fable 5' },
  { slug: 'gpt-5.6-luna', label: 'GPT 5.6 Luna' },
  { slug: 'gpt-5.6-terra', label: 'GPT 5.6 Terra' },
  { slug: 'gpt-5.6-sol', label: 'GPT 5.6 Sol' },
  { slug: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { slug: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { slug: 'glm-5.2', label: 'GLM 5.2' },
  { slug: 'kimi-k3', label: 'Kimi K3' },
  { slug: 'kimi-3', label: 'Kimi 3' },
  { slug: 'hy3', label: 'Hy3' },
  { slug: 'stepfun-3.7', label: 'StepFun 3.7' },
  { slug: 'muse-spark-1.1', label: 'Muse Spark 1.1' },
  { slug: 'gemini-3.5-pro', label: 'Gemini 3.5 Pro' },
  { slug: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
]

/** Reasoning / “thinking initiative” levels (CLI Prompt `y`). */
export const PROVENANCE_REASONING_LEVELS = [
  'max',
  'xhigh',
  'high',
  'medium',
  'low',
  'none',
] as const

/** Harness presets (CLI Prompt `w`). */
export const PROVENANCE_HARNESS_PRESETS = [
  'grok-build',
  'cursor-agent',
  'claude-code',
  'codex',
  'antigravity',
  'manual',
] as const

export type ProvenanceReasoning = (typeof PROVENANCE_REASONING_LEVELS)[number]
export type ProvenanceHarness = (typeof PROVENANCE_HARNESS_PRESETS)[number]

export function provenanceModelLabel(slug: string): string {
  return PROVENANCE_MODELS.find(m => m.slug === slug)?.label ?? slug
}

export function isKnownProvenanceModel(slug: string): boolean {
  return PROVENANCE_MODELS.some(m => m.slug === slug)
}

export function isKnownReasoning(r: string): r is ProvenanceReasoning {
  return (PROVENANCE_REASONING_LEVELS as readonly string[]).includes(r)
}

export function isKnownHarness(h: string): h is ProvenanceHarness {
  return (PROVENANCE_HARNESS_PRESETS as readonly string[]).includes(h)
}

const LS_MODEL = 'chaos-prompt-model'
const LS_REASONING = 'chaos-prompt-reasoning'
const LS_HARNESS = 'chaos-prompt-harness'

/** Read saved pickers (localStorage); fall back to CLI defaults. */
export function loadProvenancePrefs(): {
  model: string
  reasoning: ProvenanceReasoning
  harness: ProvenanceHarness
} {
  let model = 'grok-4.5'
  let reasoning: ProvenanceReasoning = 'high'
  let harness: ProvenanceHarness = 'grok-build'
  try {
    const m = localStorage.getItem(LS_MODEL)
    if (m && isKnownProvenanceModel(m)) model = m
    const r = localStorage.getItem(LS_REASONING)
    if (r && isKnownReasoning(r)) reasoning = r
    const h = localStorage.getItem(LS_HARNESS)
    if (h && isKnownHarness(h)) harness = h
  } catch {
    /* ignore */
  }
  return { model, reasoning, harness }
}

export function saveProvenanceModel(slug: string): void {
  try {
    if (isKnownProvenanceModel(slug)) localStorage.setItem(LS_MODEL, slug)
  } catch {
    /* ignore */
  }
}

export function saveProvenanceReasoning(r: string): void {
  try {
    if (isKnownReasoning(r)) localStorage.setItem(LS_REASONING, r)
  } catch {
    /* ignore */
  }
}

export function saveProvenanceHarness(h: string): void {
  try {
    if (isKnownHarness(h)) localStorage.setItem(LS_HARNESS, h)
  } catch {
    /* ignore */
  }
}

/** What this prompt will actually attach from a detail draft (web has one draft slot). */
export function draftInclusion(
  det: ExpDetail | null | undefined,
  opts?: Pick<DraftPromptOpts, 'includeNearMissDraft' | 'includeGhidraDraft'>,
): { nearMiss: boolean; ghidra: boolean; text: string | null; draftDiv?: number } {
  const includeNear = opts?.includeNearMissDraft !== false
  const includeGhidra = opts?.includeGhidraDraft !== false
  const raw = det?.draft?.trim()
  if (!raw) return { nearMiss: false, ghidra: false, text: null }
  const isGhidra = isGhidraScaffoldText(raw)
  if (isGhidra && includeGhidra) {
    return { nearMiss: false, ghidra: true, text: raw, draftDiv: det?.draftDiv }
  }
  if (!isGhidra && includeNear) {
    return { nearMiss: true, ghidra: false, text: raw, draftDiv: det?.draftDiv }
  }
  return { nearMiss: false, ghidra: false, text: null }
}

export function matchResultBlock(
  fn: ExpFunction,
  det: ExpDetail | null,
  author: string,
  sessionScope: 'focused' | 'batch',
  batchSize: number,
  opts?: DraftPromptOpts,
): string {
  const authorComment =
    author === 'YOUR_GITHUB_LOGIN'
      ? '# REQUIRED GitHub login for credit (classic author field). Replace placeholder.'
      : '# REQUIRED GitHub login for credit — keep this value (claims / env).'

  const incl = draftInclusion(det, opts)
  const usedNearMiss = incl.nearMiss
  const usedGhidra = incl.ghidra
  const baseKind =
    usedNearMiss && usedGhidra
      ? 'mixed'
      : usedNearMiss
        ? 'near_miss_draft'
        : usedGhidra
          ? 'ghidra_scaffold'
          : 'scratch'

  const model = opts?.model?.trim() || 'grok-4.5'
  const reasoning = opts?.reasoning?.trim() || 'high'
  const harness = opts?.harness?.trim() || 'grok-build'

  return `----------------------------------------------------------------------
MATCH_RESULT — emit ONE node per function for THIS try
(even if status=no_progress / compile_error / failed)

Tree fields (attemptId / parentAttemptId / base) separate siblings and
branches so a later reader can rebuild the attempt tree — not a flat diary.

\`\`\`yaml
MATCH_RESULT:
  schemaVersion: 1
  # --- identity (required — stable keys for the attempt log) ---
  functionId: "${fn.id}"            # atlas function.id — NOT optional; not name alone
  function: ${fn.name}              # display name (may change; functionId does not)
  module: ${fn.module}
  addr: "0x${fn.addr.toString(16)}"
  size: ${fn.size}
  attemptId: "01JEXAMPLE0000000000000000"  # UNIQUE this node: ULID/UUID (never a1/try2)
  parentAttemptId: null         # null = new root; else a real prior attemptId for this functionId
  status: no_progress   # matched | near_miss | no_progress | compile_error | failed | skipped
  # --- attempt tree base ---
  base:
    kind: ${baseKind}           # scratch | previous_attempt | near_miss_draft | ghidra_scaffold | matched_sibling | mixed
  # DRAFT SOURCES (required — two independent trackers; both may be true):
  usedNearMissDraft: ${usedNearMiss}   # this try OR any ancestor (inherit from parent)
  usedGhidraDraft: ${usedGhidra}     # this try OR any ancestor (inherit from parent)
  # REQUIRED every run (same tier as model/harness — never omit):
  sessionScope: ${sessionScope}   # focused | batch
  batchSize: ${batchSize}         # 1 if focused; N if batch
  # WHO (classic credit — required when status=matched; preferred always):
  author: "${author}"            ${authorComment}
  # HOW this try was run (required for kind=ai on every attempt):
  matchProvenance:
    kind: ai                    # ai | human
    model: "${model}"            # slug; NOT display names like "Grok 4.5"
    reasoning: "${reasoning}"    # max | xhigh | high | medium | low | none
    harness: "${harness}"        # slug; NOT display names like "Grok Build"
  divergences: null
  prevBestDivergences: null
  improvedNearMiss: false
  note: ""
\`\`\`
`
}

export function matchResultFooterAddon(
  author: string,
  sessionScope: 'focused' | 'batch',
  batchSize: number,
): string {
  const authorRule =
    author === 'YOUR_GITHUB_LOGIN'
      ? `   - author → on MATCH_RESULT.author (classic credit). Required when matched.
     Replace YOUR_GITHUB_LOGIN. Not inside matchProvenance.`
      : `   - author → use "${author}" on MATCH_RESULT.author when known/matched.
     Not inside matchProvenance.`

  return `

======================================================================
BEFORE YOU FINISH
======================================================================
1. For EACH function, emit a filled MATCH_RESULT **node** for this try.
2. Identity (required): schemaVersion=1, functionId (atlas id), unique attemptId
   (ULID/UUID — never a1/try2), parentAttemptId, base. Do NOT log wall-clock times.
3. Draft trackers (required, independent): usedNearMissDraft and usedGhidraDraft.
   Pre-filled from this prompt; INHERIT true from parentAttemptId's node if the
   parent had that flag true.
4. status must reflect reality (prefer no_progress over silence).
5. ALWAYS set sessionScope=${sessionScope} and batchSize=${batchSize} on every
   MATCH_RESULT (every function, every try) — not optional; like model/harness.
6. Tree links:
   - parentAttemptId = the node you actually edited/built from
   - no_progress under the same parent as siblings of later improved tries
   - after an improved near_miss, continue with parent = that new node
7. If status=matched (verify says MATCH):
   - matchProvenance kind=ai → model + reasoning + harness (slug tokens)
   - matchProvenance kind=human → no model fields; optional note only
${authorRule}
8. If near_miss: include divergences (+ draft when available). Still log if
   it did NOT beat prevBestDivergences (improvedNearMiss: false).
9. Operators append every MATCH_RESULT into config/match_attempts.jsonl
   (tools/log_attempt.py or equivalent). Preserve functionId / attemptId /
   parentAttemptId / base / usedNearMissDraft / usedGhidraDraft. Never log loggedAt/ts.
10. Open a PR when matched; PR author should match \`author\`.

Refuse to claim "matched" without verify succeeding.
Never skip logging a failed/empty try — it is a leaf on the tree.
Never reuse attemptId. Never key history by function name alone — use functionId.`
}

/** Resolve operator GitHub login for author prefill (claims handle). */
export function operatorGithubHandle(): string {
  try {
    const h = (localStorage.getItem('chaos-claim-handle') || '').trim()
    if (h) return h
  } catch { /* ignore */ }
  return 'YOUR_GITHUB_LOGIN'
}
