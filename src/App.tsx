import { useState } from 'react'
import { Search, BarChart3, Code2, ChevronRight, X } from 'lucide-react'
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

// Loaded at build / import time from the generator output (see scripts/generate-chaos-db.py + README)
import chaosDb from '../data/chaos-db.json' with { type: 'json' }

const DB: ChaosDb = chaosDb as ChaosDb

function formatPct(n: number, d: number) {
  return d ? ((n / d) * 100).toFixed(2) : '0.00'
}

function App() {
  const db = DB
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'treemap' | 'prioritize' | 'prompt'>('treemap')

  const stats = db.stats
  const fnPct = formatPct(stats.matchedFunctions, stats.totalFunctions)
  const byPct = formatPct(stats.matchedBytes, stats.totalBytes)

  const filtered = db.functions.filter(f =>
    !search ||
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.module.toLowerCase().includes(search.toLowerCase()) ||
    f.id.includes(search)
  )

  const selectedFn = selectedId ? db.functions.find(f => f.id === selectedId) : null

  const modules = Array.from(new Set(db.functions.map(f => f.module))).sort()

  function selectFunction(id: string) {
    setSelectedId(id)
  }

  function clearSelection() {
    setSelectedId(null)
  }

  return (
    <div className="min-h-screen text-[15px] text-aero-text">
      {/* Subtle aero orbs */}
      <div className="aero-bg-orbs" aria-hidden />

      <div className="max-w-[1480px] mx-auto px-6 py-8">
        {/* Header */}
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
          {/* Sidebar (module tree + functions) - skeleton modeled on Mizuchi Sidebar */}
          <div className="w-72 flex-shrink-0 aero-panel p-3 overflow-hidden flex flex-col" style={{ minHeight: '520px' }}>
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
                const matchedInMod = modFns.filter(f => f.matched).length
                return (
                  <div key={mod} className="mb-1">
                    <button
                      onClick={() => setSelectedPath(selectedPath === mod ? null : mod)}
                      className={`w-full flex items-center justify-between px-2 py-1 rounded hover:bg-white/5 text-left ${selectedPath === mod ? 'bg-aero-primary/20 text-aero-primary' : 'text-aero-text'}`}
                    >
                      <span className="font-medium">{mod}</span>
                      <span className="text-[11px] tabular-nums text-aero-muted">{matchedInMod}/{modFns.length}</span>
                    </button>
                    {(!selectedPath || selectedPath === mod) && modFns.slice(0, 8).map(fn => (
                      <button
                        key={fn.id}
                        onClick={() => selectFunction(fn.id)}
                        className={`w-full text-left pl-6 pr-2 py-0.5 text-xs truncate rounded flex items-center gap-1.5 hover:bg-white/5 ${selectedId === fn.id ? 'bg-aero-primary/15 text-aero-primary font-medium' : 'text-aero-muted'}`}
                        title={fn.name}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${fn.matched ? 'bg-aero-matched' : 'bg-aero-unmatched'}`} />
                        {fn.name}
                      </button>
                    ))}
                    {modFns.length > 8 && <div className="pl-6 text-[10px] text-aero-muted/60">+{modFns.length - 8} more</div>}
                  </div>
                )
              })}
            </div>
            <div className="text-[10px] text-aero-muted/60 px-2 pt-2 border-t border-white/10">Data snapshot {db.generatedAt}. Run generator script for fresh.</div>
          </div>

          {/* Main content area */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Tabs - direct Mizuchi Atlas structure */}
            <div className="flex gap-1 border-b border-white/10 pb-1">
              {[
                { id: 'treemap' as const, label: 'Treemap Explorer', icon: BarChart3 },
                { id: 'prioritize' as const, label: 'Prioritize', icon: ChevronRight },
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

            {/* Tab contents (skeleton) */}
            <div className="aero-panel p-4 min-h-[420px]">
              {activeTab === 'treemap' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">Interactive squarified treemap (bytes per function)</div>
                    <div className="text-xs text-aero-muted">Click rects • {filtered.length} visible after filters</div>
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
                  <div className="font-medium mb-2">Prioritize — largest unmatched first (click row to select)</div>
                  <div className="space-y-px text-sm max-h-[320px] overflow-auto custom-scroll pr-1">
                    {db.functions.filter(f => !f.matched).sort((a, b) => b.size - a.size).slice(0, 12).map(f => (
                      <div key={f.id} onClick={() => selectFunction(f.id)} className={`aero-panel px-3 py-1 flex justify-between cursor-pointer hover:border-aero-primary/30 ${selectedId === f.id ? 'border-aero-primary/60' : ''}`}>
                        <div className="font-mono text-xs truncate pr-3">{f.name}</div>
                        <div className="tabular-nums text-aero-muted text-xs shrink-0">{f.size.toLocaleString()} B • {f.module}</div>
                      </div>
                    ))}
                    <div className="text-[10px] text-aero-muted/60 pt-1">Showing top 12 largest unmatched. Full sort + filters in later polish.</div>
                  </div>
                </div>
              )}

              {activeTab === 'prompt' && (
                <div>
                  <div className="font-medium mb-2">Prompt Builder — one-click rich template</div>
                  {!selectedFn ? (
                    <div className="text-aero-muted">Select any function from the sidebar or treemap to build a prompt.</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm">Target: <span className="font-mono text-aero-primary">{selectedFn.name}</span> ({selectedFn.module} @ 0x{selectedFn.addr.toString(16)} — {selectedFn.size} B)</div>
                      <pre className="glass p-3 text-[11px] overflow-auto max-h-[280px] whitespace-pre-wrap mono leading-snug">{`Decompile the following Super Mario 64 DS function into *matching* C.

Rules:
- Target toolchain: mwccarm 1.2/sp2p3 with -O4,p -enum int -lang c99 -char signed -interworking -proc arm946e -gccext,on -msgstyle gcc
- Output must be byte-identical (including relocations) when compiled and linked.
- Use only original work; import known struct/field knowledge from CREDITS but write all logic from scratch.
- Every arm-mode function in the game is in scope. Module overlaps mean you must key matches by (module, addr).

Function:
  name: ${selectedFn.name}
  module: ${selectedFn.module}
  addr: 0x${selectedFn.addr.toString(16)}
  size: ${selectedFn.size} bytes
  current status: ${selectedFn.matched ? 'already matched (do not overwrite without reason)' : 'unmatched — high value target'}

Paste the disassembly (or Ghidra pseudocode + your notes) below the marker.
Provide the complete C function body only in the final answer (no wrapper explanation).

--- DISASSEMBLY / NOTES ---
`}</pre>
                      <button
                        onClick={() => {
                          const txt = `Decompile the following Super Mario 64 DS function into *matching* C.\n\n... (full prompt as above) ...`
                          navigator.clipboard.writeText(txt).then(() => alert('Prompt copied (full template in real run would include the exact text above)'))
                        }}
                        className="aero-button px-3 py-1 text-sm"
                      >
                        Copy prompt
                      </button>
                      <div className="text-[10px] text-aero-muted">In full version this will be a complete multi-paragraph prompt with project rules + optional src snippet if small matched func.</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Details panel - always visible when selected (Mizuchi style) */}
            <AnimatePresence>
              {selectedFn && (
                <motion.div initial={{opacity:0, y:6}} animate={{opacity:1, y:0}} exit={{opacity:0}} className="aero-panel p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold mono text-lg">{selectedFn.name}</div>
                      <div className="text-xs text-aero-muted">{selectedFn.module} • 0x{selectedFn.addr.toString(16)} • {selectedFn.size} bytes • {selectedFn.matched ? 'MATCHED' : 'UNMATCHED'}</div>
                    </div>
                    <button onClick={clearSelection} className="text-aero-muted hover:text-white"><X className="w-4 h-4" /></button>
                  </div>
                  {selectedFn.srcPath && (
                    <a href={`https://github.com/bmanus2-dotcom/sm64ds-decomp/blob/main/${selectedFn.srcPath}`} target="_blank" className="inline-block mt-2 text-xs text-aero-primary hover:underline">View source on GitHub →</a>
                  )}
                  <div className="text-[11px] text-aero-muted mt-2">More details (callers, asm snippet, full C) will appear here in later passes once real db + optional snippet export is wired.</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <footer className="mt-8 text-[10px] text-aero-muted/50 text-center">
          Chaos Viewer • data from sm64ds-decomp tools (modules/sweep/ledger/treemap) • theme follows GitHub avatar + Frutiger Aero
        </footer>
      </div>
    </div>
  )
}

export default App
