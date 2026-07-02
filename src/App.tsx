import { useEffect, useState } from 'react'
import { Search, BarChart3, Code2, ChevronRight, X, Target, Link2, FileCode } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Treemap } from './components/Treemap'
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

interface ChaosDb {
  generatedAt: string
  stats: {
    totalFunctions: number
    matchedFunctions: number
    totalBytes: number
    matchedBytes: number
    moduleCount: number
  }
  functions: ChaosFunction[]
}

import chaosDb from '../data/chaos-db.json' with { type: 'json' }

const DB: ChaosDb = chaosDb as ChaosDb
const GITHUB = 'https://github.com/bmanus2-dotcom/sm64ds-decomp'

const detailCache = new Map<string, Record<string, FunctionDetail>>()

async function fetchDetail(module: string, name: string): Promise<FunctionDetail | null> {
  if (!detailCache.has(module)) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}details/${module}.json`)
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

function buildPrompt(fn: ChaosFunction, det: FunctionDetail | null) {
  const lines: string[] = []
  lines.push(`Match one Super Mario 64 DS function to the retail ROM, byte-for-byte, with mwccarm.`)
  lines.push(``)
  lines.push(`FUNCTION: ${fn.name}   module: ${fn.module}   addr: 0x${fn.addr.toString(16)}   size: ${fn.size} bytes`)
  lines.push(``)
  lines.push(`SETUP (once): clone ${GITHUB} and follow CONTRIBUTING.md`)
  lines.push(`(python deps + mwccarm from the DS-decomp Discord + tools/unpack.py on YOUR OWN cartridge dump).`)
  lines.push(``)
  lines.push(`COMPILER: mwccarm 1.2/sp2p3. Flags (C): -O4,p -enum int -lang c99 -char signed -interworking -proc arm946e -gccext,on -msgstyle gcc`)
  lines.push(`If the name starts with _Z (C++ mangled), write C++ with the FIRST LINE exactly //cpp`)
  lines.push(``)
  lines.push(`VERIFY every attempt (relocation-aware byte compare, prints the exact mismatching instructions):`)
  lines.push(`  python tools/match.py --c yourfile.c --func ${fn.name} --addr 0x${fn.addr.toString(16)} --size 0x${fn.size.toString(16)} --version 1.2/sp2p3`)
  lines.push(``)
  lines.push(`READ FIRST: notes/mwccarm-codegen.md (esp. sec 6e-6g levers: u64-mask laundering for`)
  lines.push(`materialized bases, declaration/statement order for register coloring, //cpp dummy-vtable`)
  lines.push(`dispatch, struct-copy interleave) and notes/pret-idioms.md. Coordinate via CLAIMS.md.`)
  if (fn.sibling) {
    lines.push(``)
    lines.push(`CLOSEST MATCHED SIBLING (opcode similarity ${fn.sim}): src/${fn.sibling}.c[pp] - use it as your scaffold.`)
  }
  if (det?.draft) {
    lines.push(``)
    lines.push(`A NEAR-MISS DRAFT EXISTS (${det.draftDiv} instruction(s) from matching) - START FROM THIS, do not re-decompile:`)
    lines.push('```c')
    lines.push(det.draft.trimEnd())
    lines.push('```')
  }
  if (fn.floor) {
    lines.push(``)
    lines.push(`WARNING: previously parked as "${fn.floor}" - check the sec 6e-6g levers before grinding.`)
  }
  if (det?.disasm?.length) {
    lines.push(``)
    lines.push(`TARGET DISASSEMBLY (annotated, callees resolved):`)
    lines.push('```')
    lines.push(det.disasm.join('\n'))
    if (det.pool?.length) {
      lines.push(``)
      lines.push(`pool slots:`)
      for (const p of det.pool) lines.push(`  ${p}`)
    }
    lines.push('```')
  }
  lines.push(``)
  lines.push(`Rules: only your own legally dumped ROM; never commit the ROM or anything extracted from it;`)
  lines.push(`import struct/field knowledge (see CREDITS.md) but write all C from scratch. Matched means`)
  lines.push(`byte-identical - iterate until tools/match.py reports a MATCH, then open a PR (one function`)
  lines.push(`or a small family per PR, note compiler version + address).`)
  return lines.join('\n')
}

function StatusBadge({ fn }: { fn: ChaosFunction }) {
  if (fn.matched)
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">MATCHED</span>
  if (fn.div != null)
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-400/30">NEAR-MISS · {fn.div} off</span>
  if (fn.floor)
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/15 text-rose-300 border border-rose-400/25" title={fn.floor}>FLOOR</span>
  return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-500/20 text-slate-300 border border-slate-400/25">UNMATCHED</span>
}

function Pill({ name, onClick }: { name: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`px-2 py-0.5 rounded text-[11px] font-mono ${onClick ? 'bg-white/10 hover:bg-aero-primary/25 text-aero-primary cursor-pointer' : 'bg-white/5 text-aero-muted cursor-default'}`}
    >
      {name}
    </button>
  )
}

type PriorityMode = 'nearly' | 'scaffolded' | 'biggest'

function App() {
  const db = DB
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'treemap' | 'prioritize' | 'prompt'>('treemap')
  const [priorityMode, setPriorityMode] = useState<PriorityMode>('nearly')
  const [detail, setDetail] = useState<FunctionDetail | null>(null)
  const [copied, setCopied] = useState(false)

  const stats = db.stats
  const fnPct = formatPct(stats.matchedFunctions, stats.totalFunctions)
  const byPct = formatPct(stats.matchedBytes, stats.totalBytes)

  const q = search.toLowerCase()
  const filtered = db.functions.filter(f =>
    !search ||
    f.name.toLowerCase().includes(q) ||
    f.module.toLowerCase().includes(q) ||
    f.id.includes(q)
  )

  const byName = new Map(db.functions.map(f => [f.name, f]))
  const selectedFn = selectedId ? db.functions.find(f => f.id === selectedId) : null

  const modules = Array.from(new Set(db.functions.map(f => f.module))).sort()

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

  function selectFunction(id: string) {
    setSelectedId(id)
  }
  function selectByName(name: string) {
    const f = byName.get(name)
    if (f) setSelectedId(f.id)
  }

  const priorityRows = (() => {
    const un = db.functions.filter(f => !f.matched)
    if (priorityMode === 'nearly')
      return un.filter(f => f.div != null && !(f.cat ?? '').includes('materialization'))
        .sort((a, b) => (a.div! - b.div!) || (a.size - b.size)).slice(0, 25)
    if (priorityMode === 'scaffolded')
      return un.filter(f => f.sim != null && !f.floor)
        .sort((a, b) => b.sim! - a.sim!).slice(0, 25)
    return un.filter(f => !f.floor).sort((a, b) => b.size - a.size).slice(0, 25)
  })()

  return (
    <div className="min-h-screen text-[15px] text-aero-text">
      <div className="aero-bg-orbs" aria-hidden />

      <div className="max-w-[1480px] mx-auto px-6 py-8">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-aero-primary to-aero-accent flex items-center justify-center text-white font-semibold tracking-[-1px]">CV</div>
              <div>
                <div className="text-3xl font-semibold tracking-[-1.5px]">Chaos Viewer</div>
                <div className="text-aero-muted text-sm -mt-1">sm64ds-decomp</div>
              </div>
            </div>
            <div className="mt-1 text-[13px] text-aero-muted">Frutiger Aero decomp atlas • matching C from ashes of assembly</div>
          </div>

          <div className="text-right">
            <div className="font-semibold">{stats.matchedFunctions.toLocaleString()} / {stats.totalFunctions.toLocaleString()} functions <span className="text-aero-primary">({fnPct}%)</span></div>
            <div className="text-sm text-aero-muted">{stats.matchedBytes.toLocaleString()} / {stats.totalBytes.toLocaleString()} bytes <span className="text-aero-primary">({byPct}%)</span> • {stats.moduleCount} modules</div>
          </div>
        </header>

        <div className="flex gap-4">
          {/* Sidebar */}
          <div className="w-72 flex-shrink-0 aero-panel p-3 overflow-hidden flex flex-col" style={{ minHeight: '560px', maxHeight: '80vh' }}>
            <div className="px-2 pb-2 flex items-center gap-2 border-b border-white/10 mb-2">
              <Search className="w-4 h-4 text-aero-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or module..."
                className="flex-1 bg-transparent outline-none placeholder:text-aero-muted/60 text-sm"
              />
              {search && <button onClick={() => setSearch('')} className="text-aero-muted hover:text-white"><X className="w-3.5 h-3.5" /></button>}
            </div>

            <div className="flex-1 overflow-auto text-sm space-y-px pr-1 custom-scroll">
              {modules.map(mod => {
                const modFns = filtered.filter(f => f.module === mod)
                if (search && modFns.length === 0) return null
                const matchedInMod = modFns.filter(f => f.matched).length
                const open = selectedPath === mod || (!!search && modFns.length <= 60)
                return (
                  <div key={mod} className="mb-1">
                    <button
                      onClick={() => setSelectedPath(selectedPath === mod ? null : mod)}
                      className={`w-full flex items-center justify-between px-2 py-1 rounded hover:bg-white/5 text-left ${selectedPath === mod ? 'bg-aero-primary/20 text-aero-primary' : 'text-aero-text'}`}
                    >
                      <span className="font-medium">{mod}</span>
                      <span className="text-[11px] tabular-nums text-aero-muted">{matchedInMod}/{modFns.length}</span>
                    </button>
                    {open && modFns.slice(0, 400).map(fn => (
                      <button
                        key={fn.id}
                        onClick={() => selectFunction(fn.id)}
                        className={`w-full text-left pl-6 pr-2 py-0.5 text-xs truncate rounded flex items-center gap-1.5 hover:bg-white/5 ${selectedId === fn.id ? 'bg-aero-primary/15 text-aero-primary font-medium' : 'text-aero-muted'}`}
                        title={fn.name}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${fn.matched ? 'bg-aero-matched' : fn.div != null ? 'bg-amber-400' : 'bg-aero-unmatched'}`} />
                        {fn.name}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="text-[10px] text-aero-muted/60 px-2 pt-2 border-t border-white/10">Snapshot {db.generatedAt} • amber dot = near-miss draft exists</div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex gap-1 border-b border-white/10 pb-1">
              {[
                { id: 'treemap' as const, label: 'Treemap Explorer', icon: BarChart3 },
                { id: 'prioritize' as const, label: 'Prioritize', icon: Target },
                { id: 'prompt' as const, label: 'Prompt Builder', icon: Code2 },
              ].map(tab => {
                const Icon = tab.icon
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-t text-sm font-medium transition ${active ? 'bg-aero-panel border border-white/10 border-b-aero-panel -mb-px' : 'text-aero-muted hover:text-aero-text'}`}
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
                    <div className="text-xs text-aero-muted">Click rects • {filtered.length.toLocaleString()} visible after filters</div>
                  </div>
                  <Treemap
                    functions={filtered.map(f => ({ id: f.id, module: f.module, name: f.name, size: f.size, matched: f.matched }))}
                    selectedId={selectedId}
                    selectedPath={selectedPath}
                    onSelect={(id) => {
                      if (id === '__clear__') { setSelectedId(null); return }
                      selectFunction(id)
                    }}
                    width={1080}
                    height={420}
                  />
                  <div className="mt-2 text-[11px] text-aero-muted">Green = matched (exact bytes). Gray = unmatched. Modules sized by total mass. Same layout math as the README treemap.</div>
                </div>
              )}

              {activeTab === 'prioritize' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">Prioritize — pick your fight</div>
                    <div className="flex gap-1">
                      {([
                        ['nearly', 'Nearly done'],
                        ['scaffolded', 'Best scaffolded'],
                        ['biggest', 'Biggest bytes'],
                      ] as [PriorityMode, string][]).map(([m, label]) => (
                        <button key={m} onClick={() => setPriorityMode(m)}
                          className={`px-3 py-1 rounded text-xs font-medium ${priorityMode === m ? 'bg-aero-primary/25 text-aero-primary' : 'bg-white/5 text-aero-muted hover:text-aero-text'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-[11px] text-aero-muted mb-2">
                    {priorityMode === 'nearly' && 'Stored near-miss drafts, fewest diverging instructions first (compiler-floor categories excluded). These are 1-6 instructions from done - the draft is in the Prompt Builder.'}
                    {priorityMode === 'scaffolded' && 'Unmatched functions with the closest already-matched opcode twin. The sibling source is your template - highest hit rate per attempt.'}
                    {priorityMode === 'biggest' && 'Largest unmatched by bytes (documented floors excluded). Hardest, but each one moves the code-size bar the most.'}
                  </div>
                  <div className="space-y-px text-sm max-h-[340px] overflow-auto custom-scroll pr-1">
                    {priorityRows.map(f => (
                      <div key={f.id} onClick={() => selectFunction(f.id)} className={`aero-panel px-3 py-1 flex justify-between items-center cursor-pointer hover:border-aero-primary/30 ${selectedId === f.id ? 'border-aero-primary/60' : ''}`}>
                        <div className="font-mono text-xs truncate pr-3">{f.name}</div>
                        <div className="tabular-nums text-aero-muted text-[11px] shrink-0 flex items-center gap-2">
                          {priorityMode === 'nearly' && <span className="text-amber-300">{f.div} off</span>}
                          {priorityMode === 'scaffolded' && <span className="text-aero-primary">sim {f.sim}</span>}
                          <span>{f.size.toLocaleString()} B</span>
                          <span>{f.module}</span>
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
                  {!selectedFn ? (
                    <div className="text-aero-muted">Select a function from the sidebar, treemap, or Prioritize tab.</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm flex items-center gap-2 flex-wrap">
                        Target: <span className="font-mono text-aero-primary">{selectedFn.name}</span>
                        <span className="text-aero-muted">({selectedFn.module} @ 0x{selectedFn.addr.toString(16)} — {selectedFn.size.toLocaleString()} B)</span>
                        <StatusBadge fn={selectedFn} />
                        {selectedFn.matched && <span className="text-[11px] text-aero-muted">already matched — pick an unmatched one</span>}
                      </div>
                      <pre className="glass p-3 text-[11px] overflow-auto max-h-[300px] whitespace-pre-wrap mono leading-snug">{buildPrompt(selectedFn, detail)}</pre>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(buildPrompt(selectedFn, detail)).then(() => {
                            setCopied(true)
                            setTimeout(() => setCopied(false), 1600)
                          })
                        }}
                        className="aero-button px-3 py-1 text-sm"
                      >
                        {copied ? 'Copied ✓' : 'Copy prompt'}
                      </button>
                      {!detail && <span className="text-[11px] text-aero-muted ml-2">loading disassembly/draft…</span>}
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
                      <div className="font-semibold mono text-lg flex items-center gap-3">{selectedFn.name} <StatusBadge fn={selectedFn} /></div>
                      <div className="text-xs text-aero-muted mt-0.5">{selectedFn.module} • 0x{selectedFn.addr.toString(16)} • {selectedFn.size.toLocaleString()} bytes{selectedFn.cat ? ` • ${selectedFn.cat}` : ''}</div>
                    </div>
                    <button onClick={clearSelectionButton(setSelectedId)} className="text-aero-muted hover:text-white"><X className="w-4 h-4" /></button>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs">
                    {selectedFn.srcPath && (
                      <a href={`${GITHUB}/blob/main/${selectedFn.srcPath}`} target="_blank" className="flex items-center gap-1 text-aero-primary hover:underline">
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
                          <div className="text-[11px] uppercase tracking-wide text-amber-300 mb-1">Near-miss draft — {detail.draftDiv} instruction(s) from matching</div>
                          <pre className="text-[10.5px] mono overflow-auto max-h-[200px] whitespace-pre-wrap leading-snug">{detail.draft}</pre>
                        </div>
                      )}

                      {detail.disasm && (
                        <div className={`glass p-3 rounded-lg ${detail.draft ? '' : 'lg:col-span-1'}`}>
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

        <footer className="mt-8 text-[10px] text-aero-muted/50 text-center">
          Chaos Viewer • data from sm64ds-decomp tools (modules/sweep/ledger/coddog/nearmiss) • inspired by Mizuchi Decomp Atlas
        </footer>
      </div>
    </div>
  )
}

function clearSelectionButton(setSelectedId: (v: string | null) => void) {
  return () => setSelectedId(null)
}

export default App
