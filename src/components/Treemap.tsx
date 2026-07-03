import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  lockedIds?: Set<string>
  colors?: Map<string, string>   // per-function fill override (contributor coloring)
  onSelect: (id: string) => void
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
const MIN_H = 300
const MAX_H = 1400

// memo: the SVG holds ~11k rects; rebuilding it blocks the main thread for
// seconds, so it must only re-render when its own props actually change
export const Treemap = memo(function Treemap({ functions, selectedId, selectedPath, lockedIds, colors, onSelect }: TreemapProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1080)
  const [height, setHeight] = useState(() => {
    const s = Number(localStorage.getItem('chaos-tm-height'))
    return s >= MIN_H && s <= MAX_H ? s : 460
  })

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

  // drag the bottom edge to resize
  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    let last = startH
    const move = (ev: PointerEvent) => {
      last = Math.max(MIN_H, Math.min(MAX_H, startH + (ev.clientY - startY)))
      setHeight(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      localStorage.setItem('chaos-tm-height', String(Math.round(last)))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Resolve theme colors to concrete literals in JS and feed the rects literal
  // fills, instead of var(--x) in the SVG. iOS Safari does not reliably resolve
  // CSS custom properties inside SVG fill/stroke (attribute OR style), which left
  // matched rects unfilled on mobile; literal colors render everywhere. Re-read
  // when the theme (html[data-theme]) changes.
  const [themeV, setThemeV] = useState(0)
  useLayoutEffect(() => {
    const mo = new MutationObserver(() => setThemeV(v => v + 1))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  const C = useMemo(() => {
    const cs = getComputedStyle(document.documentElement)
    const g = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb
    const triplet = (n: string, fb: string, a: number) => {
      const [r, gg, b] = g(n, fb).split(/[\s,]+/)
      return `rgba(${r}, ${gg}, ${b}, ${a})`
    }
    return {
      matchedFlat: g('--tm-matched-flat', '#86e39c'),
      unmatchedFlat: g('--tm-unmatched-flat', '#cddcea'),
      matchedLo: g('--tm-matched-lo', '#2fae4e'),
      unmatchedLo: g('--tm-unmatched-lo', '#9fb4c8'),
      border: g('--aero-border', 'rgba(0,0,0,0.1)'),
      primary: g('--aero-primary', '#2f9be4'),
      text: g('--aero-text', '#0b2a3a'),
      glossLabel: triplet('--aero-gloss-rgb', '255 255 255', 0.28),
      glossDim: triplet('--aero-gloss-rgb', '255 255 255', 0.12),
      unmatchedDim: triplet('--aero-unmatched-rgb', '205 220 234', 0.4),
    }
  }, [themeV])

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
        style={{ background: 'linear-gradient(180deg, var(--aero-glass), rgb(var(--aero-gloss-rgb) / 0.12))', border: '1px solid var(--aero-border)' }}
      >
        <defs>
          <linearGradient id="tm-matched" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--tm-matched-hi)" />
            <stop offset="100%" stopColor="var(--tm-matched-lo)" />
          </linearGradient>
          <linearGradient id="tm-unmatched" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--tm-unmatched-hi)" />
            <stop offset="100%" stopColor="var(--tm-unmatched-lo)" />
          </linearGradient>
          <linearGradient id="tm-locked" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe08a" />
            <stop offset="100%" stopColor="#f0a92e" />
          </linearGradient>
          <filter id="tm-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#ffb52e" floodOpacity="0.95" />
          </filter>
        </defs>
        {rects.map((r, idx) => {
          const isSel = r.id === selectedId
          const isLocked = !r.isModuleLabel && lockedIds?.has(r.id)
          const isDim = selectedPath ? !r.id.startsWith(`mod:${selectedPath}`) && !r.id.includes(selectedPath) : false

          let fill = r.matched ? (colors?.get(r.id) ?? C.matchedFlat) : C.unmatchedFlat
          if (isLocked) fill = 'url(#tm-locked)'
          if (r.isModuleLabel) fill = C.glossLabel
          if (isDim && !isLocked) fill = r.isModuleLabel ? C.glossDim : C.unmatchedDim

          const stroke = isSel ? C.primary
            : isLocked ? '#f59e0b'
            : (r.isModuleLabel ? C.border : (r.matched ? C.matchedLo : C.unmatchedLo))
          const sw = isSel ? 2.5 : (isLocked ? 1.2 : (r.isModuleLabel ? 1 : 0.5))

          return (
            <g key={idx}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                strokeWidth={sw}
                rx={r.isModuleLabel ? 4 : 1}
                filter={isLocked ? 'url(#tm-glow)' : undefined}
                onClick={() => { if (!r.isModuleLabel) onSelect(r.id) }}
                className={r.isModuleLabel ? '' : 'cursor-pointer'}
                // fill/stroke go through CSS (style), not SVG presentation attrs:
                // iOS Safari does not resolve var() inside a fill="" attribute, which
                // left matched rects unfilled on mobile. CSS fill resolves var() fine.
                style={{ fill, stroke, transition: 'fill 120ms, stroke 120ms' }}
              />
              {r.isModuleLabel && r.moduleLabel && r.h > LABEL_H + 4 && r.w > 36 && (
                <text
                  x={r.x + 5}
                  y={r.y + 13}
                  fontSize={10.5}
                  fontFamily="'Segoe UI', system-ui, sans-serif"
                  fontWeight={600}
                  pointerEvents="none"
                  style={{ fill: C.text }}
                >
                  {r.moduleLabel}
                </text>
              )}
              {!r.isModuleLabel && (r.h > 9 && r.w > 18) && (
                <title>{r.name}: {isLocked ? 'being worked on' : r.matched ? 'matched' : 'unmatched'}</title>
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

      {/* resize handle - drag to make the treemap taller */}
      <div
        onPointerDown={startResize}
        title="drag to resize"
        className="absolute left-1/2 -translate-x-1/2 -bottom-1 h-3 w-16 flex items-center justify-center cursor-ns-resize group"
      >
        <div className="h-1 w-12 rounded-full opacity-40 group-hover:opacity-80 transition" style={{ background: 'var(--aero-primary)' }} />
      </div>
    </div>
  )
})
