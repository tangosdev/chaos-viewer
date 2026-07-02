import { useLayoutEffect, useMemo, useRef, useState } from 'react'
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

export function Treemap({ functions, selectedId, selectedPath, onSelect, height = 460 }: TreemapProps) {
  // fill the parent: measure it and lay out in real pixels (no letterboxing)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1080)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width)
      if (w > 0) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rects = useMemo(() => {
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

    if (!mods.length) return [] as LayoutRect[]

    const modItems = mods.map(m => ({ value: m.bytes, mod: m }))
    const modBoxes = squarify(modItems, 0, 0, width, height)

    const out: LayoutRect[] = []

    for (const { item: mitem, x: mx, y: my, w: mw, h: mh } of modBoxes) {
      const m = mitem.mod
      const bx = mx + PAD / 2
      const by = my + PAD / 2
      const bw = mw - PAD
      const bh = mh - PAD
      if (bw < 2 || bh < 2) continue

      const pct = m.bytes ? (m.doneBytes / m.bytes) * 100 : 0

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

    return out
  }, [functions, width, height])

  return (
    <div ref={wrapRef} className="relative select-none w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block rounded-xl"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0.15))', border: '1px solid rgba(255,255,255,0.8)' }}
      >
        <defs>
          <linearGradient id="tm-matched" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#71dd8a" />
            <stop offset="45%" stopColor="#3fc45f" />
            <stop offset="100%" stopColor="#2fae4e" />
          </linearGradient>
          <linearGradient id="tm-unmatched" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c3d4e3" />
            <stop offset="100%" stopColor="#9fb4c8" />
          </linearGradient>
        </defs>
        {rects.map((r, idx) => {
          const isSel = r.id === selectedId
          const isDim = selectedPath ? !r.id.startsWith(`mod:${selectedPath}`) && !r.id.includes(selectedPath) : false

          let fill = r.matched ? 'url(#tm-matched)' : 'url(#tm-unmatched)'
          if (r.isModuleLabel) fill = 'rgba(255,255,255,0.4)'
          if (isDim) fill = r.isModuleLabel ? 'rgba(255,255,255,0.2)' : 'rgba(190,205,220,0.45)'

          const stroke = isSel ? 'var(--aero-primary)' : (r.isModuleLabel ? 'rgba(255,255,255,0.9)' : (r.matched ? '#2a9b46' : '#8fa6bb'))
          const sw = isSel ? 2.5 : (r.isModuleLabel ? 1 : 0.5)

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
                rx={r.isModuleLabel ? 4 : 1}
                onClick={() => { if (!r.isModuleLabel) onSelect(r.id) }}
                className={r.isModuleLabel ? '' : 'cursor-pointer'}
                style={{ transition: 'fill 120ms, stroke 120ms' }}
              />
              {r.isModuleLabel && r.moduleLabel && r.h > LABEL_H + 4 && r.w > 36 && (
                <text
                  x={r.x + 5}
                  y={r.y + 13}
                  fontSize={10.5}
                  fill="#0d3a5c"
                  fontFamily="'Segoe UI', system-ui, sans-serif"
                  fontWeight={600}
                  pointerEvents="none"
                >
                  {r.moduleLabel}
                </text>
              )}
              {!r.isModuleLabel && (r.h > 9 && r.w > 18) && (
                <title>{r.name} — {r.matched ? 'matched' : 'unmatched'}</title>
              )}
            </g>
          )
        })}
      </svg>



      {selectedId && (
        <button
          onClick={() => onSelect('__clear__')}
          className="absolute top-2 right-2 glass px-2.5 py-0.5 text-xs hover:brightness-105"
        >
          clear
        </button>
      )}
    </div>
  )
}
