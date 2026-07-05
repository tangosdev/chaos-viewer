import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
const MIN_SCALE = 1
const MAX_SCALE = 8
const ZOOM_STEP = 1.5

interface Transform { scale: number; x: number; y: number }

// gesture handlers below are attached once (empty-deps effect) but must never
// act on stale width/height/rects from mount; every render refreshes this
// ref so the handlers always read the latest closures
interface Interaction {
  rects: LayoutRect[]
  onSelect: (id: string) => void
  clampTransform: (scale: number, x: number, y: number) => Transform
  rectAtClient: (clientX: number, clientY: number) => LayoutRect | null
  showTooltipFor: (r: LayoutRect, clientX: number, clientY: number) => void
  hideTooltip: () => void
  zoomAtCanvasPoint: (newScaleRaw: number, sx: number, sy: number) => void
  requestRedraw: () => void
}

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

  // ---- zoom / pan -----------------------------------------------------------
  // transform lives in a ref (not state) so drag/pinch/wheel gestures redraw
  // the canvas directly at gesture speed instead of round-tripping through
  // React renders every pointermove.
  const transformRef = useRef<Transform>({ scale: 1, x: 0, y: 0 })
  const [zoomed, setZoomed] = useState(false)

  function clampTransform(scale: number, x: number, y: number): Transform {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
    const contentW = width * s
    const contentH = height * s
    const nx = contentW <= width ? (width - contentW) / 2 : Math.min(0, Math.max(width - contentW, x))
    const ny = contentH <= height ? (height - contentH) / 2 : Math.min(0, Math.max(height - contentH, y))
    return { scale: s, x: nx, y: ny }
  }

  // ---- canvas rendering ----------------------------------------------------
  // ~11k rects as SVG DOM nodes took seconds to mount and made the mouse lag
  // after load; a single canvas draws the same layout in ~10ms, so first paint
  // and every redraw are effectively free. Interactions (tooltip, click) are
  // delegated via hit-testing against the layout rects.
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const hoverId = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)

  // backing-store size only needs to change when the CSS box resizes; doing
  // it on every pan/zoom frame would reset the canvas bitmap and cause flicker
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    transformRef.current = clampTransform(transformRef.current.scale, transformRef.current.x, transformRef.current.y)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height])

  const drawCanvas = useCallback((t: Transform) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.translate(t.x, t.y)
    ctx.scale(t.scale, t.scale)
    ctx.font = "600 10.5px 'Segoe UI', system-ui, sans-serif"

    for (const r of rects) {
      const isSel = r.id === selectedId
      const isLocked = !r.isModuleLabel && lockedIds?.has(r.id)
      const isDim = selectedPath ? !r.id.startsWith(`mod:${selectedPath}`) && !r.id.includes(selectedPath) : false

      let fill = r.matched ? (colors?.get(r.id) ?? C.matchedFlat) : C.unmatchedFlat
      if (r.isModuleLabel) fill = C.glossLabel
      if (isDim && !isLocked) fill = r.isModuleLabel ? C.glossDim : C.unmatchedDim

      const stroke = isSel ? C.primary
        : isLocked ? '#f59e0b'
        : (r.isModuleLabel ? C.border : (r.matched ? C.matchedLo : C.unmatchedLo))
      // stroke/glow widths are defined in screen pixels, but the ctx.scale()
      // above stretches everything drawn afterward, so divide out the zoom
      // level here or borders get proportionally thicker as you zoom in
      const sw = (isSel ? 2.5 : (isLocked ? 1.2 : (r.isModuleLabel ? 1 : 0.5))) / t.scale

      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') ctx.roundRect(r.x, r.y, r.w, r.h, r.isModuleLabel ? 4 : 1)
      else ctx.rect(r.x, r.y, r.w, r.h)
      if (isLocked) {
        // gold gradient + glow for claims-locked functions
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h)
        g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#f0a92e')
        ctx.save()
        ctx.shadowColor = '#ffb52e'; ctx.shadowBlur = 6 / t.scale
        ctx.fillStyle = g
        ctx.fill()
        ctx.restore()
      } else {
        ctx.fillStyle = fill
        ctx.fill()
      }
      ctx.strokeStyle = stroke
      ctx.lineWidth = sw
      ctx.stroke()

      if (r.isModuleLabel && r.moduleLabel && r.h > LABEL_H + 4 && r.w > 36) {
        ctx.save()
        ctx.beginPath(); ctx.rect(r.x, r.y, r.w, LABEL_H); ctx.clip()
        ctx.fillStyle = C.text
        ctx.fillText(r.moduleLabel, r.x + 5, r.y + 13)
        ctx.restore()
      }
    }
  }, [rects, selectedId, selectedPath, lockedIds, colors, C, width, height])

  useLayoutEffect(() => {
    drawCanvas(transformRef.current)
  }, [drawCanvas])

  function requestRedraw() {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      drawCanvas(transformRef.current)
    })
  }

  // hit-test helpers: function rects sit after their module box in the array,
  // so scanning backwards returns the function under the cursor first.
  // Screen coords are converted through the current pan/zoom transform.
  function rectAtClient(clientX: number, clientY: number): LayoutRect | null {
    const el = canvasRef.current
    if (!el) return null
    const b = el.getBoundingClientRect()
    const t = transformRef.current
    const x = (clientX - b.left - t.x) / t.scale
    const y = (clientY - b.top - t.y) / t.scale
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i]
      if (r.isModuleLabel) continue
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r
    }
    return null
  }

  function hideTooltip() {
    const tip = tipRef.current, el = canvasRef.current
    hoverId.current = null
    if (tip) tip.style.display = 'none'
    if (el) el.style.cursor = 'default'
  }

  function showTooltipFor(r: LayoutRect, clientX: number, clientY: number) {
    const tip = tipRef.current, el = canvasRef.current
    if (!tip || !el) return
    const isLocked = lockedIds?.has(r.id)
    if (hoverId.current !== r.id) {
      hoverId.current = r.id
      tip.textContent = `${r.name}: ${isLocked ? 'being worked on' : r.matched ? 'matched' : 'unmatched'}`
      tip.style.display = 'block'
      el.style.cursor = 'pointer'
    }
    const b = el.getBoundingClientRect()
    tip.style.left = `${Math.min(clientX - b.left + 12, width - 240)}px`
    tip.style.top = `${clientY - b.top + 14}px`
  }

  function zoomAtCanvasPoint(newScaleRaw: number, sx: number, sy: number) {
    const t = transformRef.current
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScaleRaw))
    const layoutX = (sx - t.x) / t.scale
    const layoutY = (sy - t.y) / t.scale
    const clamped = clampTransform(newScale, sx - layoutX * newScale, sy - layoutY * newScale)
    transformRef.current = clamped
    setZoomed(clamped.scale > 1.001)
    requestRedraw()
  }

  function zoomButton(factor: number) {
    zoomAtCanvasPoint(transformRef.current.scale * factor, width / 2, height / 2)
  }

  function resetZoom() {
    transformRef.current = clampTransform(1, 0, 0)
    setZoomed(false)
    requestRedraw()
  }

  const interactionRef = useRef<Interaction>(null as unknown as Interaction)
  interactionRef.current = { rects, onSelect, clampTransform, rectAtClient, showTooltipFor, hideTooltip, zoomAtCanvasPoint, requestRedraw }

  // pan (mouse drag / single-finger touch) and pinch-zoom (two-finger touch),
  // both driven off native Pointer Events attached once so wheel/touch
  // preventDefault reliably stops page scroll and browser pinch-zoom
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.style.touchAction = 'none'

    const pointers = new Map<number, { x: number; y: number }>()
    type Gesture =
      | { mode: 'none' }
      | { mode: 'pan'; pointerId: number; startX: number; startY: number; startOffsetX: number; startOffsetY: number; moved: boolean }
      | { mode: 'pinch'; startDist: number; startScale: number; startOffsetX: number; startOffsetY: number; midLocalX: number; midLocalY: number }
    let gesture: Gesture = { mode: 'none' }

    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

    function startPinch() {
      const pts = Array.from(pointers.values())
      const b = canvas!.getBoundingClientRect()
      const m = mid(pts[0], pts[1])
      const t = transformRef.current
      gesture = {
        mode: 'pinch',
        startDist: dist(pts[0], pts[1]),
        startScale: t.scale,
        startOffsetX: t.x,
        startOffsetY: t.y,
        midLocalX: m.x - b.left,
        midLocalY: m.y - b.top,
      }
      interactionRef.current.hideTooltip()
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      try { canvas!.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 1) {
        const t = transformRef.current
        gesture = { mode: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startOffsetX: t.x, startOffsetY: t.y, moved: false }
      } else if (pointers.size === 2) {
        startPinch()
      }
    }

    function onPointerMove(e: PointerEvent) {
      const it = interactionRef.current
      if (!pointers.has(e.pointerId)) {
        const r = it.rectAtClient(e.clientX, e.clientY)
        if (r) it.showTooltipFor(r, e.clientX, e.clientY)
        else it.hideTooltip()
        return
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (gesture.mode === 'pan') {
        const dx = e.clientX - gesture.startX, dy = e.clientY - gesture.startY
        if (!gesture.moved && Math.hypot(dx, dy) > 4) gesture.moved = true
        if (gesture.moved) {
          transformRef.current = it.clampTransform(transformRef.current.scale, gesture.startOffsetX + dx, gesture.startOffsetY + dy)
          it.hideTooltip()
          it.requestRedraw()
        }
      } else if (gesture.mode === 'pinch') {
        const pts = Array.from(pointers.values())
        if (pts.length < 2) return
        const b = canvas!.getBoundingClientRect()
        const m = mid(pts[0], pts[1])
        const rawScale = gesture.startScale * (dist(pts[0], pts[1]) / gesture.startDist)
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, rawScale))
        const layoutX = (gesture.midLocalX - gesture.startOffsetX) / gesture.startScale
        const layoutY = (gesture.midLocalY - gesture.startOffsetY) / gesture.startScale
        const curLocalX = m.x - b.left, curLocalY = m.y - b.top
        const clamped = it.clampTransform(newScale, curLocalX - layoutX * newScale, curLocalY - layoutY * newScale)
        transformRef.current = clamped
        setZoomed(clamped.scale > 1.001)
        it.requestRedraw()
      }
    }

    function endPointer(e: PointerEvent) {
      const it = interactionRef.current
      const wasPan = gesture.mode === 'pan' && !gesture.moved && pointers.has(e.pointerId)
      pointers.delete(e.pointerId)
      if (canvas!.hasPointerCapture(e.pointerId)) canvas!.releasePointerCapture(e.pointerId)

      if (pointers.size === 0) {
        if (wasPan) {
          const r = it.rectAtClient(e.clientX, e.clientY)
          if (r) it.onSelect(r.id)
        }
        gesture = { mode: 'none' }
      } else if (pointers.size === 1) {
        const [[pointerId, p]] = Array.from(pointers.entries())
        const t = transformRef.current
        gesture = { mode: 'pan', pointerId, startX: p.x, startY: p.y, startOffsetX: t.x, startOffsetY: t.y, moved: true }
      }
    }

    function onWheel(e: WheelEvent) {
      // require ctrl/cmd (trackpad pinch or explicit zoom intent) so plain
      // scroll-wheel still scrolls the page instead of getting trapped here
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const b = canvas!.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.01)
      interactionRef.current.zoomAtCanvasPoint(transformRef.current.scale * factor, e.clientX - b.left, e.clientY - b.top)
    }

    function onLeave() { if (pointers.size === 0) interactionRef.current.hideTooltip() }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', endPointer)
    canvas.addEventListener('pointercancel', endPointer)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', endPointer)
      canvas.removeEventListener('pointercancel', endPointer)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={wrapRef} className="relative select-none w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        style={{
          width, height, display: 'block', borderRadius: '0.75rem',
          background: 'linear-gradient(180deg, var(--aero-glass), rgb(var(--aero-gloss-rgb) / 0.12))',
          border: '1px solid var(--aero-border)',
        }}
      />
      <div
        ref={tipRef}
        className="absolute z-10 pointer-events-none px-2 py-1 rounded text-[11px] mono"
        // solid dark chip on every theme: the old theme-var colors went
        // light-on-light on dark themes and were unreadable over the treemap
        style={{ display: 'none', background: 'rgba(8, 16, 26, 0.92)', color: '#f2f7fb', border: '1px solid rgba(255,255,255,0.18)', maxWidth: 320 }}
      />

      {/* zoom controls: gestures (wheel+ctrl, drag, pinch) cover desktop and
          mobile, but buttons keep zoom discoverable/precise on touch too */}
      <div className="absolute top-2 left-2 flex items-center gap-1">
        <button
          onClick={() => zoomButton(1 / ZOOM_STEP)}
          title="zoom out"
          className="glass w-6 h-6 flex items-center justify-center text-sm leading-none hover:brightness-105"
        >
          −
        </button>
        <button
          onClick={() => zoomButton(ZOOM_STEP)}
          title="zoom in"
          className="glass w-6 h-6 flex items-center justify-center text-sm leading-none hover:brightness-105"
        >
          +
        </button>
        {zoomed && (
          <button
            onClick={resetZoom}
            title="reset zoom"
            className="glass px-2 h-6 flex items-center justify-center text-xs hover:brightness-105"
          >
            reset
          </button>
        )}
      </div>

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
