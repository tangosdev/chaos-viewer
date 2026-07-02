import { useEffect, useMemo, useState } from 'react'
import { Search, BarChart3, Code2, ChevronRight, X, Target, Link2, FileCode, Lock, RefreshCw, Plus, Minus, Palette, Settings, MessageCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Treemap } from './components/Treemap'
import { Bubbles } from './components/Bubbles'
import './App.css'

interface ChaosFunction {
  id: string
  module: string
  name: string
  addr: number
  size: number
  matched: boolean
  srcPath?: string
  div?: number          // near-miss divergence (instructions off)
  cat?: string          // near-miss category (heuristic classifier)
  floor?: string        // parked reason (documented compiler floor)
  sim?: number          // best coddog opcode similarity (unmatched only)
  sibling?: string      // that best matched sibling's name
}

interface FunctionDetail {
  callees?: string[]
  calledBy?: string[]
  disasm?: string[]
  pool?: string[]
  draft?: string
  draftDiv?: number
}

interface Claim {
  id?: string
  module: string
  start: string | number
  end: string | number
  handle?: string
  note?: string
}

interface ProjectConfig {
  name: string
  title?: string
  tagline?: string
  github: string
  compiler?: string
  cppNote?: string
  setup?: string
  verifyCommand?: string
  readFirst?: string
  rules?: string
  claimsApi?: string
  discord?: string
}

interface ChaosDb {
  generatedAt: string
  project?: ProjectConfig | null
  stats: {
    totalFunctions: number
    matchedFunctions: number
    totalBytes: number
    matchedBytes: number
    moduleCount: number
  }
  functions: ChaosFunction[]
}

import bundledDb from '../data/chaos-db.json' with { type: 'json' }

const BUNDLED: ChaosDb = bundledDb as ChaosDb

// ---- link config: ?repo= / ?discord= / ?data= make a fully pre-set-up shareable URL ----
const _url = new URL(window.location.href)
function _param(k: string) { return _url.searchParams.get(k) || _url.hash.match(new RegExp(`[#&]${k}=([^&]+)`))?.[1] }
function _repoName(gh?: string | null) { return gh ? gh.replace(/\/+$/, '').split('/').slice(-1)[0] : undefined }
const LINK_REPO = _param('repo') ? decodeURIComponent(_param('repo')!) : null
const LINK_DISCORD = _param('discord') ? decodeURIComponent(_param('discord')!) : null
// URL to a project's published chaos-db.json (its own generated data). This is what
// makes the hosted viewer work for ANY project: point it at that project's data file.
const DATA_URL_INIT = _param('data') ? decodeURIComponent(_param('data')!)
  : (() => { try { return JSON.parse(localStorage.getItem('chaos-project') || '{}').dataUrl || null } catch { return null } })()
const HAS_LINK = !!(LINK_REPO || DATA_URL_INIT)

const urlProject: Partial<ProjectConfig> = {}
if (LINK_REPO) { urlProject.github = LINK_REPO; urlProject.name = _repoName(LINK_REPO) }
if (LINK_DISCORD) urlProject.discord = LINK_DISCORD

// localStorage config is used only when the URL did NOT specify one (so a shared
// link works regardless of what the recipient saved before).
const savedProject: Partial<ProjectConfig> | null = (() => {
  if (HAS_LINK) return null
  try { return JSON.parse(localStorage.getItem('chaos-project') || 'null') } catch { return null }
})()

// P starts from the bundled data's project; the runtime data load can refine it.
let P: ProjectConfig = { ...(BUNDLED.project ?? {}), ...(savedProject ?? {}), ...urlProject } as ProjectConfig
const HAS_BUNDLED_DATA = (BUNDLED.functions?.length ?? 0) > 0
// details chunks live next to the data file
let DETAILS_BASE = DATA_URL_INIT ? DATA_URL_INIT.replace(/[^/]*$/, '') + 'details/' : `${import.meta.env.BASE_URL}details/`
const BATCH_MAX = 16

function shareLink() {
  const base = window.location.origin + window.location.pathname
  const q = new URLSearchParams()
  if (DATA_URL_INIT) q.set('data', DATA_URL_INIT)
  if (P.github) q.set('repo', P.github)
  if (P.discord && !DATA_URL_INIT) q.set('discord', P.discord)
  return `${base}?${q.toString()}`
}

// Probe a repo for a published Chaos Viewer data file. CORS-friendly raw.* URLs
// first, then GitHub Pages. Returns the working URL or null.
async function discoverData(github: string): Promise<string | null> {
  const m = github.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  if (!m) return null
  const [, owner, name] = m
  const cands = [
    `https://raw.githubusercontent.com/${owner}/${name}/main/data/chaos-db.json`,
    `https://raw.githubusercontent.com/${owner}/${name}/main/chaos-db.json`,
    `https://raw.githubusercontent.com/${owner}/${name}/master/data/chaos-db.json`,
    `https://raw.githubusercontent.com/${owner}/${name}/master/chaos-db.json`,
    `https://raw.githubusercontent.com/${owner}/${name}/main/docs/chaos-db.json`,
    `https://${owner}.github.io/${name}/data/chaos-db.json`,
    `https://${owner}.github.io/${name}/chaos-db.json`,
  ]
  for (const url of cands) {
    try {
      const r = await fetch(url)
      if (!r.ok) continue
      const j = await r.json()
      if (j && j.stats && Array.isArray(j.functions)) return url
    } catch { /* try next */ }
  }
  return null
}
const AUTHOR = 'Brennen (Tango)'
const AUTHOR_URL = 'https://github.com/bmanus2-dotcom'

// EDIT ME: little confirmation phrases shown on the Copy button + floating bubble
// (one is picked at random each press). Add your own.
const COPY_PHRASES = [
  "Let's Tango!",
  'Good luck!',
  'Godspeed!',
  'You bring order to chaos.',
  'Taste divine fury!',
  'Very well, then.',
]

function fillTemplate(t: string, fn: ChaosFunction) {
  return t
    .replaceAll('{github}', P.github)
    .replaceAll('{name}', fn.name)
    .replaceAll('{module}', fn.module)
    .replaceAll('{addr}', String(fn.addr))
    .replaceAll('{addrHex}', fn.addr.toString(16))
    .replaceAll('{size}', String(fn.size))
    .replaceAll('{sizeHex}', fn.size.toString(16))
}

function legacyCopy(text: string) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  } catch { /* nothing more we can do */ }
}

const detailCache = new Map<string, Record<string, FunctionDetail>>()

async function fetchDetail(module: string, name: string): Promise<FunctionDetail | null> {
  if (!detailCache.has(module)) {
    try {
      const res = await fetch(`${DETAILS_BASE}${module}.json`)
      if (!res.ok) return null
      detailCache.set(module, await res.json())
    } catch {
      return null
    }
  }
  return detailCache.get(module)?.[name] ?? null
}

function formatPct(n: number, d: number) {
  return d ? ((n / d) * 100).toFixed(2) : '0.00'
}

function toNum(v: string | number): number {
  return typeof v === 'number' ? v : parseInt(v, v.startsWith('0x') ? 16 : 10)
}

// ---- prompt building ------------------------------------------------------

function promptHeader(n: number) {
  const lines = [
    `Match ${n === 1 ? `one ${P.name} function` : `${n} ${P.name} functions`} to the retail binary, byte-for-byte.`,
  ]
  if (P.setup) lines.push(``, `SETUP (once): ${P.setup.replaceAll('{github}', P.github)}`)
  if (P.compiler) lines.push(``, `COMPILER: ${P.compiler}`)
  if (P.cppNote) lines.push(P.cppNote)
  if (P.readFirst) lines.push(``, `READ FIRST: ${P.readFirst}`)
  return lines.join('\n')
}

function promptSection(fn: ChaosFunction, det: FunctionDetail | null) {
  const lines: string[] = []
  lines.push(`${'='.repeat(70)}`)
  lines.push(`FUNCTION: ${fn.name}   module: ${fn.module}   addr: 0x${fn.addr.toString(16)}   size: ${fn.size} bytes`)
  if (P.verifyCommand) {
    lines.push(`VERIFY every attempt (relocation-aware byte compare):`)
    lines.push(`  ${fillTemplate(P.verifyCommand, fn)}`)
  }
  if (fn.sibling) {
    lines.push(`CLOSEST MATCHED SIBLING (opcode similarity ${fn.sim}): src/${fn.sibling}.c[pp] - use it as your scaffold.`)
  }
  if (fn.floor) {
    lines.push(`WARNING: previously parked as "${fn.floor}" - check the sec 6e-6g levers before grinding.`)
  }
  if (det?.draft) {
    lines.push(``)
    lines.push(`A NEAR-MISS DRAFT EXISTS (${det.draftDiv} instruction(s) from matching) - START FROM THIS, do not re-decompile:`)
    lines.push('```c')
    lines.push(det.draft.trimEnd())
    lines.push('```')
  }
  if (det?.disasm?.length) {
    const MAXD = 90
    const truncated = det.disasm.length > MAXD
    const dis = truncated
      ? det.disasm.slice(0, MAXD).concat([`... (${det.disasm.length - MAXD} more lines omitted to keep this prompt pasteable - in the repo run  python tools/abrow.py --name ${fn.name}  for the full annotated listing)`])
      : det.disasm
    lines.push(``)
    lines.push(truncated ? `TARGET DISASSEMBLY (first ${MAXD} of ${det.disasm.length} lines, annotated):` : `TARGET DISASSEMBLY (annotated, callees resolved):`)
    lines.push('```')
    lines.push(dis.join('\n'))
    if (det.pool?.length) {
      lines.push(``)
      lines.push(`pool slots:`)
      for (const pl of det.pool.slice(0, 40)) lines.push(`  ${pl}`)
    }
    lines.push('```')
  }
  return lines.join('\n')
}

function promptFooter(n: number) {
  const lines = [``]
  if (P.rules) lines.push(`Rules: ${P.rules}`)
  const target = P.github ? ` to ${P.github}` : ''
  lines.push(
    `Matched means byte-identical - iterate until the verify command reports a MATCH${n > 1 ? ' for each function, one at a time (verify before moving on)' : ''}.`,
    `When it matches, fork the repo and open a pull request${target} against its default branch`,
    `(one function or a small related family per PR; note the compiler version and the function address).`)
  return lines.join('\n')
}

// ---- small components ------------------------------------------------------

function StatusBadge({ fn, lockedBy }: { fn: ChaosFunction; lockedBy?: string }) {
  return (
    <span className="inline-flex gap-1.5">
      {fn.matched
        ? <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-400/30 text-emerald-800 border border-emerald-600/40">MATCHED</span>
        : fn.div != null
          ? <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-300/40 text-amber-800 border border-amber-600/40">NEAR-MISS · {fn.div} off</span>
          : fn.floor
            ? <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-300/30 text-rose-700 border border-rose-500/40" title={fn.floor}>FLOOR</span>
            : <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-300/40 text-slate-700 border border-slate-500/40">UNMATCHED</span>}
      {lockedBy && !fn.matched && (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-300/40 text-violet-800 border border-violet-600/40 inline-flex items-center gap-1" title={`claims-locked by ${lockedBy}`}>
          <Lock className="w-3 h-3" /> {lockedBy}
        </span>
      )}
    </span>
  )
}

function Pill({ name, onClick }: { name: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`px-2 py-0.5 rounded text-[11px] font-mono ${onClick ? 'bg-sky-900/10 hover:bg-aero-primary/20 text-aero-primary cursor-pointer' : 'bg-sky-900/5 text-aero-muted cursor-default'}`}
    >
      {name}
    </button>
  )
}


const THEMES: { id: string; label: string; swatch: string }[] = [
  { id: 'aero', label: 'Frutiger Aero', swatch: 'linear-gradient(135deg,#7cc4f2,#8ec841)' },
  { id: 'sunset', label: 'Sunset', swatch: 'linear-gradient(135deg,#ffd9a0,#a86bc9)' },
  { id: 'deepsea', label: 'Deep Sea', swatch: 'linear-gradient(135deg,#0b3350,#24d3ee)' },
  { id: 'bubblegum', label: 'Bubblegum', swatch: 'linear-gradient(135deg,#ffd6ec,#c3b1f7)' },
  { id: 'mint', label: 'Mint', swatch: 'linear-gradient(135deg,#eafff6,#8fd9c2)' },
]

function ThemePicker() {
  const [theme, setTheme] = useState(() => localStorage.getItem('chaos-theme') || 'aero')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('chaos-theme', theme)
  }, [theme])
  return (
    <span className="inline-flex items-center gap-1.5" title="theme">
      <Palette className="w-3.5 h-3.5 text-aero-muted" />
      {THEMES.map(t => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          title={t.label}
          className="w-4 h-4 rounded-full transition-transform hover:scale-125"
          style={{ background: t.swatch, border: theme === t.id ? '2px solid var(--aero-primary)' : '1px solid rgba(255,255,255,0.9)', boxShadow: '0 1px 4px rgb(0 0 0 / 0.2)' }}
        />
      ))}
    </span>
  )
}

function PopLogo() {
  const [state, setState] = useState<'idle' | 'pop' | 'inflate'>('idle')
  function popIt() {
    if (state !== 'idle') return
    setState('pop')
    setTimeout(() => setState('inflate'), 330)
    setTimeout(() => setState('idle'), 900)
  }
  return (
    <button onClick={popIt} className={`w-11 h-11 relative cursor-pointer ${state === 'idle' ? 'logo-bob' : state === 'pop' ? 'logo-pop' : 'logo-inflate'}`} aria-label="pop the bubble" title="pop me">
      <svg viewBox="0 0 100 100" className="w-11 h-11">
        <defs>
          <radialGradient id="lg-bubble" cx="35%" cy="28%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#e8fbff" stopOpacity="0.55" />
            <stop offset="80%" stopColor="#bfe9ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#9ed9f7" stopOpacity="0.5" />
          </radialGradient>
          <linearGradient id="lg-jelly" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b8ec6a" />
            <stop offset="45%" stopColor="#7fd42e" />
            <stop offset="100%" stopColor="#4fae1f" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill="url(#lg-bubble)" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" />
        <ellipse cx="34" cy="26" rx="14" ry="8" fill="white" opacity="0.85" transform="rotate(-24 34 26)" />
        <path d="M34 36 C 32 24, 46 17, 56 21 C 67 25, 70 35, 62 43 C 56 49, 50 48, 49 56 L 49 61"
              fill="none" stroke="url(#lg-jelly)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M34 36 C 32 24, 46 17, 56 21 C 67 25, 70 35, 62 43 C 56 49, 50 48, 49 56 L 49 61"
              fill="none" stroke="#fff9d9" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.65"
              transform="translate(-1.5,-2)" />
        <circle cx="49" cy="74" r="7" fill="url(#lg-jelly)" />
        <circle cx="46.5" cy="71.5" r="2.2" fill="#fff9d9" opacity="0.8" />
      </svg>
    </button>
  )
}

function SetupModal({ open, onClose, contrib, setContrib, canDismiss }: { open: boolean; onClose: () => void; contrib: boolean; setContrib: (v: boolean) => void; canDismiss: boolean }) {
  const [url, setUrl] = useState(P.github ?? '')
  const [advanced, setAdvanced] = useState('')
  const [err, setErr] = useState('')
  const [checking, setChecking] = useState(false)
  if (!open) return null
  async function save() {
    const gh = url.trim().replace(/\/+$/, '')
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(gh)) {
      setErr('Enter a repo link like https://github.com/you/your-decomp')
      return
    }
    let extra: Partial<ProjectConfig> & { dataUrl?: string } = {}
    if (advanced.trim()) {
      try { extra = JSON.parse(advanced) } catch { setErr('Advanced config is not valid JSON'); return }
    }
    setErr(''); setChecking(true)
    // an explicit dataUrl in advanced config is trusted; otherwise find it in the repo
    let dataUrl = extra.dataUrl
    if (!dataUrl) dataUrl = (await discoverData(gh)) || undefined
    if (!dataUrl) {
      setChecking(false)
      setErr("No Chaos Viewer data found in this repo. The project owner must generate chaos-db.json "
        + "(see ADAPTING.md) and commit it to the repo (e.g. data/chaos-db.json on the default branch) "
        + "or publish it, then it will load here.")
      return
    }
    const name = extra.name || gh.split('/').slice(-1)[0]
    localStorage.setItem('chaos-project', JSON.stringify({ name, github: gh, ...extra, dataUrl }))
    location.reload()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgb(var(--aero-text-rgb) / 0.35)', backdropFilter: 'blur(6px)' }}>
      <div className="aero-panel p-6 w-[520px] max-w-[92vw] space-y-4">
        <div className="text-xl font-semibold">Point Chaos Viewer at your decomp</div>
        <div className="text-sm text-aero-muted">
          Enter the GitHub repository this atlas is for. Generate the data with your own
          script per <span className="mono">ADAPTING.md</span> (or the bundled generator for sm64ds-decomp).
        </div>
        <input
          value={url}
          onChange={e => { setUrl(e.target.value); setErr('') }}
          placeholder="https://github.com/you/your-decomp"
          className="w-full glass px-3 py-2 text-sm outline-none placeholder:text-aero-muted/60"
          autoFocus
        />
        <details>
          <summary className="text-xs text-aero-muted cursor-pointer">Advanced: paste a full project config JSON (compiler, verify command, claims...)</summary>
          <textarea
            value={advanced}
            onChange={e => setAdvanced(e.target.value)}
            rows={5}
            placeholder='{"compiler": "...", "verifyCommand": "python tools/verify.py --func {name} ..."}'
            className="mt-2 w-full glass px-3 py-2 text-[11px] mono outline-none"
          />
        </details>
        {err && <div className="text-xs text-rose-600">{err}</div>}
        {P.github && (
          <button onClick={() => { navigator.clipboard?.writeText(shareLink()).catch(() => {}) }}
                  className="w-full glass px-3 py-2 text-xs text-left hover:brightness-105">
            <span className="font-medium text-aero-primary">Copy shareable setup link</span>
            <span className="block text-[11px] text-aero-muted break-all mt-0.5">{shareLink()}</span>
          </button>
        )}
        <label className="flex items-start gap-2 text-sm cursor-pointer pt-1">
          <input type="checkbox" checked={contrib} onChange={e => setContrib(e.target.checked)} className="mt-0.5 accent-aero-primary" />
          <span>
            <span className="font-medium">Contributor bubbles</span>
            <span className="block text-[11px] text-aero-muted">Pull the repo's GitHub contributors and let roughly 1 in 12 background bubbles wear a contributor's avatar. Off by default; bot/Claude accounts are skipped.</span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={() => { localStorage.removeItem('chaos-project'); location.href = location.origin + location.pathname }}
                  className="px-3 py-1 text-sm text-aero-muted hover:text-rose-600 mr-auto" title="forget the saved repo and use this build's bundled project">
            Reset
          </button>
          {canDismiss && <button onClick={onClose} className="px-3 py-1 text-sm text-aero-muted hover:text-aero-text">cancel</button>}
          <button onClick={save} disabled={checking} className="aero-button px-4 py-1.5 text-sm disabled:opacity-60">{checking ? 'Checking repo for data…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

type PriorityMode = 'nearly' | 'scaffolded' | 'biggest'
type SortMode = 'name' | 'pctAsc' | 'pctDesc' | 'count' | 'bytes'

function App() {
  const [db, setDb] = useState<ChaosDb>(BUNDLED)
  const [dataUrl, setDataUrl] = useState<string | null>(DATA_URL_INIT)
  const [dataLoading, setDataLoading] = useState(!!DATA_URL_INIT)
  const [dataError, setDataError] = useState(false)
  // (hasUsableData defined below)
  // load the project's own data file when we have one
  useEffect(() => {
    if (!dataUrl) return
    DETAILS_BASE = dataUrl.replace(/[^/]*$/, '') + 'details/'
    detailCache.clear()
    let cancelled = false
    setDataLoading(true); setDataError(false)
    fetch(dataUrl).then(r => r.ok ? r.json() : Promise.reject(r.status)).then((j: ChaosDb) => {
      if (cancelled) return
      if (j.project) P = { ...j.project, ...urlProject }   // URL repo/discord still win
      setDb(j); setDataLoading(false)
    }).catch(() => { if (!cancelled) { setDataLoading(false); setDataError(true) } })
    return () => { cancelled = true }
  }, [dataUrl])
  // a repo-only link (?repo=) with no bundled data: try to discover its data file
  useEffect(() => {
    if (dataUrl || HAS_BUNDLED_DATA || !P.github) return
    let cancelled = false
    setDataLoading(true)
    discoverData(P.github).then(found => {
      if (cancelled) return
      if (found) setDataUrl(found)
      else { setDataLoading(false); setSetupOpen(true) }
    })
    return () => { cancelled = true }
  }, [])
  const hasUsableData = HAS_BUNDLED_DATA || (!!dataUrl && !dataError && !dataLoading)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'treemap' | 'prioritize' | 'prompt'>('treemap')
  const [priorityMode, setPriorityMode] = useState<PriorityMode>('nearly')
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [detail, setDetail] = useState<FunctionDetail | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyMsg, setCopyMsg] = useState('')
  const [copyKey, setCopyKey] = useState(0)
  const [hideMatched, setHideMatched] = useState(false)
  const [hideUnmatched, setHideUnmatched] = useState(false)
  const [contribBubbles, setContribBubbles] = useState(() => localStorage.getItem('chaos-contrib') === '1')
  const [avatars, setAvatars] = useState<string[]>([])
  const [batch, setBatch] = useState<string[]>([])
  const [batchPrompt, setBatchPrompt] = useState<string | null>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [claimsStatus, setClaimsStatus] = useState<'loading' | 'live' | 'unavailable'>('loading')
  const [setupOpen, setSetupOpen] = useState(!HAS_BUNDLED_DATA && !DATA_URL_INIT && !LINK_REPO)

  const stats = db.stats
  const fnPct = formatPct(stats.matchedFunctions, stats.totalFunctions)
  const byPct = formatPct(stats.matchedBytes, stats.totalBytes)

  // ---- live claims (via the vite dev proxy; refreshes every 60s) ----------
  async function loadClaims() {
    if (!P.claimsApi) return
    try {
      const r = await fetch(P.claimsApi)
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json()
      setClaims(Array.isArray(j.claims) ? j.claims : [])
      setClaimsStatus('live')
    } catch {
      setClaimsStatus('unavailable')
    }
  }
  useEffect(() => {
    localStorage.setItem('chaos-contrib', contribBubbles ? '1' : '0')
    if (!contribBubbles || !P.github) { setAvatars([]); return }
    const m = P.github.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
    if (!m) return
    let cancelled = false
    fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/contributors?per_page=100`)
      .then(r => r.ok ? r.json() : [])
      .then((list: Array<{ login?: string; type?: string; avatar_url?: string }>) => {
        if (cancelled || !Array.isArray(list)) return
        setAvatars(list
          .filter(u => u && u.login && u.avatar_url && u.type !== 'Bot' && !/claude|\[bot\]|-bot$|actions/i.test(u.login))
          .map(u => u.avatar_url as string))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [contribBubbles])

  useEffect(() => {
    if (!P.claimsApi) return
    loadClaims()
    const t = setInterval(loadClaims, 60_000)
    return () => clearInterval(t)
  }, [])

  const lockedBy = useMemo(() => {
    const m = new Map<string, string>()
    if (!claims.length) return m
    for (const f of db.functions) {
      if (f.matched) continue
      for (const c of claims) {
        if (c.module !== f.module) continue
        const s = toNum(c.start), e = toNum(c.end)
        if (f.addr < e && f.addr + f.size > s) {
          m.set(f.id, c.handle || 'someone')
          break
        }
      }
    }
    return m
  }, [claims])

  const q = search.toLowerCase()
  const filtered = db.functions.filter(f =>
    !search ||
    f.name.toLowerCase().includes(q) ||
    f.module.toLowerCase().includes(q) ||
    f.id.includes(q)
  )

  const visible = filtered.filter(f => !(hideMatched && f.matched) && !(hideUnmatched && !f.matched))

  const byName = useMemo(() => new Map(db.functions.map(f => [f.name, f])), [])
  const byId = useMemo(() => new Map(db.functions.map(f => [f.id, f])), [])
  const selectedFn = selectedId ? byId.get(selectedId) ?? null : null

  // ---- module list with sort ----------------------------------------------
  const moduleStats = useMemo(() => {
    const m = new Map<string, { total: number; matched: number; bytes: number }>()
    for (const f of db.functions) {
      const s = m.get(f.module) ?? { total: 0, matched: 0, bytes: 0 }
      s.total += 1
      if (f.matched) s.matched += 1
      s.bytes += f.size
      m.set(f.module, s)
    }
    return m
  }, [])

  const modules = useMemo(() => {
    const mods = Array.from(moduleStats.keys())
    const pct = (m: string) => {
      const s = moduleStats.get(m)!
      return s.total ? s.matched / s.total : 0
    }
    switch (sortMode) {
      case 'pctAsc': return mods.sort((a, b) => pct(a) - pct(b) || a.localeCompare(b))
      case 'pctDesc': return mods.sort((a, b) => pct(b) - pct(a) || a.localeCompare(b))
      case 'count': return mods.sort((a, b) => moduleStats.get(b)!.total - moduleStats.get(a)!.total)
      case 'bytes': return mods.sort((a, b) => moduleStats.get(b)!.bytes - moduleStats.get(a)!.bytes)
      default: return mods.sort()
    }
  }, [sortMode, moduleStats])

  // ---- selected-function detail -------------------------------------------
  useEffect(() => {
    setDetail(null)
    setCopied(false)
    if (!selectedFn) return
    let cancelled = false
    fetchDetail(selectedFn.module, selectedFn.name).then(d => {
      if (!cancelled) setDetail(d)
    })
    return () => { cancelled = true }
  }, [selectedId])

  // ---- batch prompt ---------------------------------------------------------
  useEffect(() => {
    if (activeTab !== 'prompt' || batch.length === 0) {
      setBatchPrompt(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const parts: string[] = [promptHeader(batch.length)]
      for (const id of batch) {
        const f = byId.get(id)
        if (!f) continue
        const d = await fetchDetail(f.module, f.name)
        if (cancelled) return
        parts.push(promptSection(f, d))
      }
      parts.push(promptFooter(batch.length))
      if (!cancelled) setBatchPrompt(parts.join('\n\n'))
    })()
    return () => { cancelled = true }
  }, [batch, activeTab])

  function selectFunction(id: string) {
    setSelectedId(id)
    const f = byId.get(id)
    if (f) setSelectedPath(f.module)
    setTimeout(() => {
      document.getElementById(`fnrow-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 60)
  }
  function selectByName(name: string) {
    const f = byName.get(name)
    if (f) setSelectedId(f.id)
  }
  function toggleBatch(id: string) {
    setBatch(b => b.includes(id) ? b.filter(x => x !== id) : b.length < BATCH_MAX ? [...b, id] : b)
  }

  const priorityRows = (() => {
    const un = db.functions.filter(f => !f.matched && !lockedBy.has(f.id))
    if (priorityMode === 'nearly')
      return un.filter(f => f.div != null && !(f.cat ?? '').includes('materialization'))
        .sort((a, b) => (a.div! - b.div!) || (a.size - b.size)).slice(0, 25)
    if (priorityMode === 'scaffolded')
      return un.filter(f => f.sim != null && !f.floor)
        .sort((a, b) => b.sim! - a.sim!).slice(0, 25)
    return un.filter(f => !f.floor).sort((a, b) => b.size - a.size).slice(0, 25)
  })()

  const singlePrompt = selectedFn && batch.length === 0
    ? [promptHeader(1), promptSection(selectedFn, detail), promptFooter(1)].join('\n\n')
    : null
  const promptText = batchPrompt ?? singlePrompt

  return (
    <div className="min-h-screen text-[15px] text-aero-text">
      <Bubbles avatars={avatars} />
      {!dataLoading && !dataUrl && P.github && db.project?.name && _repoName(P.github) !== db.project.name && (
        <div className="fixed top-0 inset-x-0 z-40 pointer-events-auto text-center text-[12px] py-1.5 px-4"
             style={{ background: 'rgb(240 160 40 / 0.95)', color: '#3a2600' }}>
          Linked to <b>{P.name}</b>, but the data shown is <b>{db.project.name}</b>. To view {P.name}&apos;s
          functions, generate its data (see ADAPTING.md) and open this page with <code>?data=&lt;url-to-chaos-db.json&gt;</code>.
        </div>
      )}
      <SetupModal open={setupOpen || !hasUsableData} onClose={() => setSetupOpen(false)} contrib={contribBubbles} setContrib={setContribBubbles} canDismiss={hasUsableData} />

      <div className="relative z-10 w-full max-w-[1900px] mx-auto px-4 sm:px-6 xl:px-10 py-6 xl:py-8 select-none">
        <header className="mb-6 flex items-end justify-between select-none">
          <div>
            <div className="flex items-center gap-3">
              <PopLogo />
              <div>
                <div className="text-3xl font-semibold tracking-[-1.5px]">Chaos Viewer</div>
                <div className="text-aero-muted text-sm -mt-1">Bring order to the chaos</div>
              </div>
            </div>
            {P.github ? (
              <a href={P.github} target="_blank" rel="noreferrer"
                 className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium rounded-full pl-2 pr-3 py-1"
                 style={{ background: 'rgb(var(--aero-primary-rgb) / 0.14)', border: '1px solid rgb(var(--aero-primary-rgb) / 0.35)', color: 'var(--aero-primary)' }}
                 title="this atlas is generated for a specific repository">
                <span className="uppercase tracking-wide opacity-70 text-[10px]">Project</span>
                <span className="mono">{P.name}</span>
              </a>
            ) : (
              <button onClick={() => setSetupOpen(true)}
                 className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium rounded-full px-3 py-1"
                 style={{ background: 'rgb(var(--aero-primary-rgb) / 0.14)', border: '1px dashed rgb(var(--aero-primary-rgb) / 0.5)', color: 'var(--aero-primary)' }}>
                + link a GitHub repo to begin
              </button>
            )}
          </div>

          <div className="text-right">
            <div className="font-semibold">{stats.matchedFunctions.toLocaleString()} / {stats.totalFunctions.toLocaleString()} functions <span className="text-aero-primary">({fnPct}%)</span></div>
            <div className="text-sm text-aero-muted">{stats.matchedBytes.toLocaleString()} / {stats.totalBytes.toLocaleString()} bytes <span className="text-aero-primary">({byPct}%)</span> • {modules.length} modules</div>
            <div className="text-[11px] mt-1 flex items-center gap-2 justify-end">
              {P.discord && (
                <a href={P.discord} target="_blank" rel="noreferrer" title="project Discord"
                   className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 mr-1"
                   style={{ background: 'rgb(88 101 242 / 0.16)', border: '1px solid rgb(88 101 242 / 0.4)', color: '#5865F2' }}>
                  <MessageCircle className="w-3.5 h-3.5" /> Discord
                </a>
              )}
              <ThemePicker />
              <button onClick={() => setSetupOpen(true)} title="project settings" className="text-aero-muted hover:text-aero-primary"><Settings className="w-3.5 h-3.5" /></button>
            </div>
            {P.claimsApi && (
              <div className="text-[11px] mt-0.5 flex items-center gap-1.5 justify-end">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${claimsStatus === 'live' ? 'bg-emerald-400' : claimsStatus === 'loading' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                <span className="text-aero-muted">
                  claims {claimsStatus === 'live' ? `live · ${claims.length} active lock${claims.length === 1 ? '' : 's'}` : claimsStatus}
                </span>
                <button onClick={loadClaims} title="refresh claims" className="text-aero-muted hover:text-aero-primary"><RefreshCw className="w-3 h-3" /></button>
              </div>
            )}
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Sidebar */}
          <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 aero-panel p-3 overflow-hidden flex flex-col" style={{ minHeight: '420px', maxHeight: '80vh' }}>
            <div className="px-2 pb-2 flex items-center gap-2 border-b border-white/70 mb-1">
              <Search className="w-4 h-4 text-aero-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or module..."
                className="flex-1 bg-transparent outline-none placeholder:text-aero-muted/60 text-sm"
              />
              {search && <button onClick={() => setSearch('')} className="text-aero-muted hover:text-sky-900"><X className="w-3.5 h-3.5" /></button>}
            </div>

            <div className="px-2 pb-2 flex items-center gap-2 text-[11px] text-aero-muted border-b border-white/70 mb-2">
              <span>sort</span>
              <select
                value={sortMode}
                onChange={e => setSortMode(e.target.value as SortMode)}
                className="flex-1 bg-sky-900/5 border border-white/70 rounded px-1.5 py-0.5 outline-none text-aero-text text-[11px]"
              >
                <option value="name">name (a–z)</option>
                <option value="pctAsc">% matched ↑ (worst first)</option>
                <option value="pctDesc">% matched ↓ (best first)</option>
                <option value="count">most functions</option>
                <option value="bytes">most bytes</option>
              </select>
            </div>

            <div className="px-2 pb-2 flex items-center gap-4 text-[11px] text-aero-muted border-b border-white/70 mb-2">
              <label className="inline-flex items-center gap-1.5 cursor-pointer hover:text-aero-text">
                <input type="checkbox" checked={hideMatched} onChange={e => setHideMatched(e.target.checked)} className="accent-aero-primary" />
                Hide matched
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer hover:text-aero-text">
                <input type="checkbox" checked={hideUnmatched} onChange={e => setHideUnmatched(e.target.checked)} className="accent-aero-primary" />
                Hide unmatched
              </label>
            </div>

            <div className="flex-1 overflow-auto text-sm space-y-px pr-1 custom-scroll">
              {modules.map(mod => {
                const modFns = visible.filter(f => f.module === mod)
                if (search && modFns.length === 0) return null
                const s = moduleStats.get(mod)!
                const open = selectedPath === mod || (!!search && modFns.length <= 60)
                return (
                  <div key={mod} className="mb-1">
                    <button
                      onClick={() => setSelectedPath(selectedPath === mod ? null : mod)}
                      className={`w-full flex items-center justify-between px-2 py-1 rounded hover:bg-sky-600/10 text-left ${selectedPath === mod ? 'bg-aero-primary/20 text-aero-primary' : 'text-aero-text'}`}
                    >
                      <span className="font-medium">{mod}</span>
                      <span className="text-[11px] tabular-nums text-aero-muted">{formatPct(s.matched, s.total)}% · {s.matched}/{s.total}</span>
                    </button>
                    {open && (selectedPath === mod ? modFns : modFns.slice(0, 400)).map(fn => (
                      <button
                        key={fn.id}
                        id={`fnrow-${fn.id}`}
                        onClick={() => selectFunction(fn.id)}
                        className={`w-full text-left pl-6 pr-2 py-0.5 text-xs truncate rounded flex items-center gap-1.5 hover:bg-sky-600/10 ${selectedId === fn.id ? 'bg-aero-primary/15 text-aero-primary font-medium' : 'text-aero-muted'}`}
                        title={lockedBy.has(fn.id) ? `${fn.name} (locked by ${lockedBy.get(fn.id)})` : fn.name}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${fn.matched ? 'bg-aero-matched' : lockedBy.has(fn.id) ? 'bg-violet-400' : fn.div != null ? 'bg-amber-400' : 'bg-aero-unmatched'}`} />
                        {fn.name}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="text-[10px] text-aero-muted/60 px-2 pt-2 border-t border-white/70">Snapshot {db.generatedAt} • amber = near-miss draft • violet = claims-locked</div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex gap-1 border-b border-white/70 pb-1">
              {[
                { id: 'treemap' as const, label: 'Treemap Explorer', icon: BarChart3 },
                { id: 'prioritize' as const, label: 'Prioritize', icon: Target },
                { id: 'prompt' as const, label: `Prompt Builder${batch.length ? ` (${batch.length})` : ''}`, icon: Code2 },
              ].map(tab => {
                const Icon = tab.icon
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-t text-sm font-medium transition ${active ? 'bg-aero-panel border border-white/70 border-b-aero-panel -mb-px' : 'text-aero-muted hover:text-aero-text'}`}
                  >
                    <Icon className="w-4 h-4" /> {tab.label}
                  </button>
                )
              })}
            </div>

            <div className="aero-panel p-4 min-h-[420px]">
              {activeTab === 'treemap' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">Interactive squarified treemap (bytes per function)</div>
                    <div className="text-xs text-aero-muted">Click rects • {visible.length.toLocaleString()} visible after filters</div>
                  </div>
                  <Treemap
                    functions={visible.map(f => ({ id: f.id, module: f.module, name: f.name, size: f.size, matched: f.matched }))}
                    selectedId={selectedId}
                    selectedPath={selectedPath}
                    lockedIds={new Set(lockedBy.keys())}
                    onSelect={(id) => {
                      if (id === '__clear__') { setSelectedId(null); return }
                      selectFunction(id)
                    }}
                  />
                  <div className="mt-2 text-[11px] text-aero-muted">Green = matched (exact bytes). Gray = unmatched. Modules sized by total mass. Same layout math as the README treemap.</div>
                </div>
              )}

              {activeTab === 'prioritize' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">Prioritize — pick your fight <span className="text-[11px] text-aero-muted font-normal">(claims-locked functions hidden)</span></div>
                    <div className="flex gap-1">
                      {([
                        ['nearly', 'Nearly done'],
                        ['scaffolded', 'Best scaffolded'],
                        ['biggest', 'Biggest bytes'],
                      ] as [PriorityMode, string][]).map(([m, label]) => (
                        <button key={m} onClick={() => setPriorityMode(m)}
                          className={`px-3 py-1 rounded text-xs font-medium ${priorityMode === m ? 'bg-aero-primary/25 text-aero-primary' : 'bg-sky-900/5 text-aero-muted hover:text-aero-text'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-[11px] text-aero-muted mb-2">
                    {priorityMode === 'nearly' && 'Stored near-miss drafts, fewest diverging instructions first (compiler-floor categories excluded). These are 1-6 instructions from done - the draft is in the Prompt Builder.'}
                    {priorityMode === 'scaffolded' && 'Unmatched functions with the closest already-matched opcode twin. The sibling source is your template - highest hit rate per attempt.'}
                    {priorityMode === 'biggest' && 'Largest unmatched by bytes (documented floors excluded). Hardest, but each one moves the code-size bar the most.'}
                    {' '}Use + to queue several into one batch prompt (max {BATCH_MAX}).
                  </div>
                  <div className="space-y-px text-sm max-h-[340px] overflow-auto custom-scroll pr-1">
                    {priorityRows.map(f => (
                      <div key={f.id} className={`aero-panel px-3 py-1 flex justify-between items-center hover:border-aero-primary/30 ${selectedId === f.id ? 'border-aero-primary/60' : ''}`}>
                        <div onClick={() => selectFunction(f.id)} className="font-mono text-xs truncate pr-3 cursor-pointer flex-1">{f.name}</div>
                        <div className="tabular-nums text-aero-muted text-[11px] shrink-0 flex items-center gap-2">
                          {priorityMode === 'nearly' && <span className="text-amber-800">{f.div} off</span>}
                          {priorityMode === 'scaffolded' && <span className="text-aero-primary">sim {f.sim}</span>}
                          <span>{f.size.toLocaleString()} B</span>
                          <span>{f.module}</span>
                          <button
                            onClick={() => toggleBatch(f.id)}
                            title={batch.includes(f.id) ? 'remove from batch' : 'add to batch prompt'}
                            className={`p-0.5 rounded ${batch.includes(f.id) ? 'text-amber-800 hover:text-rose-600' : 'text-aero-muted hover:text-aero-primary'}`}
                          >
                            {batch.includes(f.id) ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                    {priorityRows.length === 0 && <div className="text-aero-muted text-sm">Nothing in this bucket - regenerate the db for fresh data.</div>}
                  </div>
                </div>
              )}

              {activeTab === 'prompt' && (
                <div>
                  <div className="font-medium mb-2">Prompt Builder — paste into Claude Code (or any assistant) and go</div>

                  {batch.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-aero-muted">Batch ({batch.length}/{BATCH_MAX}):</span>
                      {batch.map(id => {
                        const f = byId.get(id)
                        return f ? (
                          <span key={id} className="inline-flex items-center gap-1 bg-sky-900/10 rounded px-2 py-0.5 text-[11px] font-mono">
                            {f.name}
                            <button onClick={() => toggleBatch(id)} className="text-aero-muted hover:text-rose-600"><X className="w-3 h-3" /></button>
                          </span>
                        ) : null
                      })}
                      <button onClick={() => setBatch([])} className="text-[11px] text-aero-muted hover:text-rose-600 underline ml-1">clear</button>
                    </div>
                  )}

                  {!promptText ? (
                    <div className="text-aero-muted">Select a function (sidebar / treemap / Prioritize), or queue several with the + buttons for one batch prompt.</div>
                  ) : (
                    <div className="space-y-3">
                      {batch.length === 0 && selectedFn && (
                        <div className="text-sm flex items-center gap-2 flex-wrap">
                          Target: <span className="font-mono text-aero-primary">{selectedFn.name}</span>
                          <span className="text-aero-muted">({selectedFn.module} @ 0x{selectedFn.addr.toString(16)} — {selectedFn.size.toLocaleString()} B)</span>
                          <StatusBadge fn={selectedFn} lockedBy={lockedBy.get(selectedFn.id)} />
                          <button onClick={() => toggleBatch(selectedFn.id)} className="aero-button px-2 py-0.5 text-[11px] inline-flex items-center gap-1"><Plus className="w-3 h-3" /> add to batch</button>
                        </div>
                      )}
                      <pre className={`glass p-3 text-[11px] overflow-auto max-h-[300px] whitespace-pre-wrap mono leading-snug transition-[filter,opacity] duration-300 ${copied ? 'opacity-50 grayscale' : ''}`}>{promptText}</pre>
                      <div className="relative inline-block">
                        <button
                          onClick={() => {
                            const text = promptText
                            // copy (clipboard API, with a legacy fallback)
                            try {
                              navigator.clipboard?.writeText(text).catch(() => legacyCopy(text))
                            } catch {
                              legacyCopy(text)
                            }
                            // feedback fires immediately, independent of the clipboard promise
                            setCopyMsg(COPY_PHRASES[Math.floor(Math.random() * COPY_PHRASES.length)])
                            setCopyKey(k => k + 1)
                            setCopied(true)
                            setTimeout(() => setCopied(false), 1500)
                          }}
                          className="aero-button px-3 py-1 text-sm"
                        >
                          {copied ? copyMsg : `Copy prompt${batch.length ? ` (${batch.length} functions)` : ''}`}
                        </button>
                        {copied && (
                          <span key={copyKey} className="copy-float" style={{ color: 'var(--aero-primary)' }}>
                            {copyMsg}
                          </span>
                        )}
                      </div>
                      {batch.length === 0 && selectedFn && !detail && <span className="text-[11px] text-aero-muted ml-2">loading disassembly/draft…</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Details panel */}
            <AnimatePresence>
              {selectedFn && (
                <motion.div initial={{opacity:0, y:6}} animate={{opacity:1, y:0}} exit={{opacity:0}} className="aero-panel p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold mono text-lg flex items-center gap-3">{selectedFn.name} <StatusBadge fn={selectedFn} lockedBy={lockedBy.get(selectedFn.id)} /></div>
                      <div className="text-xs text-aero-muted mt-0.5">{selectedFn.module} • 0x{selectedFn.addr.toString(16)} • {selectedFn.size.toLocaleString()} bytes{selectedFn.cat ? ` • ${selectedFn.cat}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!selectedFn.matched && (
                        <button onClick={() => toggleBatch(selectedFn.id)} className="aero-button px-2 py-0.5 text-[11px] inline-flex items-center gap-1">
                          {batch.includes(selectedFn.id) ? <><Minus className="w-3 h-3" /> remove from batch</> : <><Plus className="w-3 h-3" /> add to batch</>}
                        </button>
                      )}
                      <button onClick={() => setSelectedId(null)} className="text-aero-muted hover:text-sky-900"><X className="w-4 h-4" /></button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs">
                    {selectedFn.srcPath && (
                      <a href={`${P.github}/blob/main/${selectedFn.srcPath}`} target="_blank" className="flex items-center gap-1 text-aero-primary hover:underline">
                        <FileCode className="w-3.5 h-3.5" /> View matched source
                      </a>
                    )}
                    {selectedFn.sibling && (
                      <span className="flex items-center gap-1.5 text-aero-muted">
                        <Link2 className="w-3.5 h-3.5" /> closest twin (sim {selectedFn.sim}): <Pill name={selectedFn.sibling} onClick={() => selectByName(selectedFn.sibling!)} />
                      </span>
                    )}
                  </div>

                  {detail && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {(detail.callees?.length || detail.calledBy?.length) ? (
                        <div className="glass p-3 rounded-lg space-y-2">
                          {detail.callees?.length ? (
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-aero-muted mb-1 flex items-center gap-1"><ChevronRight className="w-3 h-3" /> Calls ({detail.callees.length})</div>
                              <div className="flex flex-wrap gap-1">{detail.callees.slice(0, 24).map(c => <Pill key={c} name={c} onClick={byName.has(c) ? () => selectByName(c) : undefined} />)}</div>
                            </div>
                          ) : null}
                          {detail.calledBy?.length ? (
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-aero-muted mb-1 flex items-center gap-1"><ChevronRight className="w-3 h-3 rotate-180" /> Called by ({detail.calledBy.length})</div>
                              <div className="flex flex-wrap gap-1">{detail.calledBy.slice(0, 24).map(c => <Pill key={c} name={c} onClick={byName.has(c) ? () => selectByName(c) : undefined} />)}</div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {detail.draft && (
                        <div className="glass p-3 rounded-lg">
                          <div className="text-[11px] uppercase tracking-wide text-amber-800 mb-1">Near-miss draft — {detail.draftDiv} instruction(s) from matching</div>
                          <pre className="text-[10.5px] mono overflow-auto max-h-[200px] whitespace-pre-wrap leading-snug">{detail.draft}</pre>
                        </div>
                      )}

                      {detail.disasm && (
                        <div className="glass p-3 rounded-lg">
                          <div className="text-[11px] uppercase tracking-wide text-aero-muted mb-1">Annotated disassembly ({detail.disasm.length} lines)</div>
                          <pre className="text-[10.5px] mono overflow-auto max-h-[200px] leading-snug">{detail.disasm.join('\n')}</pre>
                        </div>
                      )}
                    </div>
                  )}
                  {!detail && <div className="text-[11px] text-aero-muted">loading details…</div>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <footer className="mt-10 pointer-events-auto text-center space-y-2 pb-4">
          <div className="flex items-center justify-center gap-4 text-[12px]">
            <a href={AUTHOR_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-aero-primary hover:underline">
              <FileCode className="w-3.5 h-3.5" /> {AUTHOR} on GitHub
            </a>
            {P.discord && (
              <a href={P.discord} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: '#5865F2' }}>
                <MessageCircle className="w-3.5 h-3.5" /> Discord
              </a>
            )}
            <a href="https://github.com/macabeus/mizuchi" target="_blank" rel="noreferrer" className="text-aero-muted hover:text-aero-text hover:underline">
              inspired by Mizuchi Atlas
            </a>
          </div>
          <div className="text-[10px] text-aero-muted/70 leading-relaxed max-w-[680px] mx-auto">
            Chaos Viewer &copy; {new Date().getFullYear()} <a href={AUTHOR_URL} target="_blank" rel="noreferrer" className="underline hover:text-aero-text">{AUTHOR}</a>. Released under the MIT License.
            Progress data generated from the {P.name || 'project'} tooling; no copyrighted ROM or extracted
            assets are included or distributed. All trademarks and game assets belong to their respective owners
            and are not affiliated with or endorsed by this project.
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
