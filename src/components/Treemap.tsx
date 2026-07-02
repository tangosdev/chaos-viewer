import { useMemo } from 'react'
import { squarify } from '../lib/squarify'

export interface TreemapFunc {
  id: string
  module: string
  name: string
  size: number
  matched: boolean
}

interface TreemapProps {
  functions: TreemapFunc[]
  selectedId: string | null
  selectedPath: string | null
  onSelect: (id: string) => void
  width?: number
  height?: number
}

interface LayoutRect {
  id: string
  name: string
  matched: boolean
  x: number
  y: number
  w: number
  h: number
  isModuleLabel?: boolean
  moduleLabel?: string
  pct?: number
}

const PAD = 3
const LABEL_H = 18
const INNER = 2
const CANVAS_W = 1200
const CANVAS_H = 620

export function Treemap({ functions, selectedId, selectedPath, onSelect, width = CANVAS_W, height = CANVAS_H }: TreemapProps) {

  const { rects } = useMemo(() => {
    // Group by module (like gather + squarify in treemap.py)
    const byMod = new Map<string, TreemapFunc[]>()
    for (const f of functions) {
      if (!byMod.has(f.module)) byMod.set(f.module, [])
      byMod.get(f.module)!.push(f)
    }

    const mods = Array.from(byMod.entries()).map(([label, recs]) => {
      const bytes = recs.reduce((s, r) => s + r.size, 0)
      const doneBytes = recs.filter(r => r.matched).reduce((s, r) => s + r.size, 0)
      return { label, recs, bytes, doneBytes }
    }).filter(m => m.bytes > 0)

    if (!mods.length) return { rects: [] as LayoutRect[], viewW: width, viewH: height }

    const modItems = mods.map(m => ({ value: m.bytes, mod: m }))

    const modBoxes = squarify(modItems, 0, 0, CANVAS_W, CANVAS_H)

    const out: LayoutRect[] = []

    for (const { item: mitem, x: mx, y: my, w: mw, h: mh } of modBoxes) {
      const m = mitem.mod
      const bx = mx + PAD / 2
      const by = my + PAD / 2
      const bw = mw - PAD
      const bh = mh - PAD
      if (bw < 2 || bh < 2) continue

      const pct = m.bytes ? (m.doneBytes / m.bytes) * 100 : 0

      // module region bg
      out.push({
        id: `mod:${m.label}`,
        name: m.label,
        matched: false,
        x: bx, y: by, w: bw, h: bh,
        isModuleLabel: true,
        moduleLabel: `${m.label} ${pct.toFixed(1)}%`,
        pct,
      })

      const showLabel = bh > LABEL_H + 6 && bw > 40
      const innerY = by + (showLabel ? LABEL_H : 0) + INNER
      const innerH = bh - (showLabel ? LABEL_H : 0) - INNER * 2
      const innerX = bx + INNER
      const innerW = bw - INNER * 2
      if (innerW < 1 || innerH < 1) continue

      const fitems = m.recs.map(r => ({ value: Math.max(r.size, 1), rec: r }))
      const fboxes = squarify(fitems, innerX, innerY, innerW, innerH)

      for (const { item: fit, x: fx, y: fy, w: fw, h: fh } of fboxes) {
        if (fw < 0.6 || fh < 0.6) continue
        const r = fit.rec
        out.push({
          id: r.id,
          name: r.name,
          matched: r.matched,
          x: fx, y: fy, w: fw, h: fh,
        })
      }
    }

    return { rects: out, viewW: CANVAS_W, viewH: CANVAS_H }
  }, [functions])

  return (
    <div className="relative select-none" style={{ width, height }}>
      <svg
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        width={width}
        height={height}
        className="block rounded-xl border border-white/10 bg-black/40"
      >
        {rects.map((r, idx) => {
          const isSel = r.id === selectedId
          const isDim = selectedPath ? !r.id.startsWith(`mod:${selectedPath}`) && !r.id.includes(selectedPath) : false

          let fill = r.matched ? 'var(--aero-matched)' : 'var(--aero-unmatched)'
          if (r.isModuleLabel) fill = '#111827'
          if (isDim) fill = r.isModuleLabel ? '#0b1320' : '#1f2937'

          const stroke = isSel ? 'var(--aero-primary)' : (r.isModuleLabel ? '#334155' : (r.matched ? '#166534' : '#334155'))
          const sw = isSel ? 2.5 : (r.isModuleLabel ? 1 : 0.6)

          return (
            <g key={idx}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={fill}
                stroke={stroke}
                strokeWidth={sw}
                rx={r.isModuleLabel ? 2 : 0.5}
                onClick={() => { if (!r.isModuleLabel) onSelect(r.id) }}
                className={r.isModuleLabel ? '' : 'cursor-pointer'}
                style={{ transition: 'fill 120ms, stroke 120ms' }}
              />
              {r.isModuleLabel && r.moduleLabel && r.h > LABEL_H + 4 && r.w > 36 && (
                <text
                  x={r.x + 4}
                  y={r.y + 13}
                  fontSize={10.5}
                  fill="#cbd5e1"
                  fontFamily="system-ui, Segoe UI, sans-serif"
                  fontWeight={600}
                  pointerEvents="none"
                >
                  {r.moduleLabel}
                </text>
              )}
              {!r.isModuleLabel && (r.h > 9 && r.w > 18) && (
                <title>{r.name} — {r.matched ? 'matched' : 'unmatched'} ({Math.round(r.w * r.h)} area)</title>
              )}
            </g>
          )
        })}
      </svg>

      {/* minimal legend + controls overlay (aero style) */}
      <div className="absolute top-2 left-2 glass px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-3 pointer-events-none">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded" style={{background:'var(--aero-matched)'}} /> matched</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded" style={{background:'var(--aero-unmatched)'}} /> unmatched</span>
      </div>

      {selectedId && (
        <button
          onClick={() => onSelect('__clear__')}
          className="absolute top-2 right-2 glass px-2 py-0.5 text-xs rounded hover:bg-white/10"
        >
          clear
        </button>
      )}
    </div>
  )
}
