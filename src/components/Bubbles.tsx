import { useEffect, useRef } from 'react'

interface Bubble {
  el: HTMLDivElement
  r: number
  x: number          // horizontal anchor
  y: number          // current vertical position (rises over time)
  rise: number       // px/sec upward
  swayAmp: number    // horizontal sway amplitude (px)
  swaySpeed: number  // sway frequency
  swayPhase: number
  popT: number       // pop progress 0..1 (0 = not popping)
  popped: boolean    // hidden / waiting to respawn
}

/** Interactive Frutiger Aero bubble field: bubbles rise on a gentle wind, sway
 *  left-right, pop when the cursor passes over them (works even behind the UI),
 *  and respawn from below. A fraction can wear a contributor's avatar. */
export function Bubbles({ count = 14, avatars = [] }: { count?: number; avatars?: string[] }) {
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hostEl = holder.current
    if (!hostEl) return
    const host: HTMLDivElement = hostEl
    const bubbles: Bubble[] = []
    const mouse = { x: -9999, y: -9999 }
    const GLOSS = 'radial-gradient(circle at 32% 26%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.3) 16%, rgba(255,255,255,0.05) 42%, rgba(190,230,255,0.12) 100%)'

    function dress(b: Bubble) {
      // ~1 in 12 bubbles wears a contributor avatar, when any are available
      if (avatars.length && Math.random() < 1 / 12) {
        const url = avatars[Math.floor(Math.random() * avatars.length)]
        b.el.style.backgroundImage = `${GLOSS}, url("${url}")`
        b.el.style.backgroundSize = 'cover, cover'
        b.el.style.backgroundPosition = 'center, center'
      } else {
        b.el.style.backgroundImage = GLOSS
        b.el.style.backgroundSize = ''
        b.el.style.backgroundPosition = ''
      }
    }

    function reset(b: Bubble, fromBottom: boolean) {
      b.r = 14 + Math.random() * 42
      b.el.style.width = b.el.style.height = `${b.r * 2}px`
      b.x = Math.random() * window.innerWidth
      b.y = fromBottom ? window.innerHeight + b.r + Math.random() * 220
                       : Math.random() * window.innerHeight
      b.rise = 10 + Math.random() * 20
      b.swayAmp = 20 + Math.random() * 55        // a touch wider for a nicer left-right drift
      b.swaySpeed = 0.12 + Math.random() * 0.28
      b.swayPhase = Math.random() * Math.PI * 2
      b.popT = 0
      b.popped = false
      b.el.style.opacity = '1'
      dress(b)
    }

    function makeBubble(): Bubble {
      const el = document.createElement('div')
      el.className = 'aero-bubble'
      const b: Bubble = { el, r: 20, x: 0, y: 0, rise: 15, swayAmp: 40, swaySpeed: 0.2, swayPhase: 0, popT: 0, popped: false }
      host.appendChild(el)
      reset(b, false)
      return b
    }

    for (let i = 0; i < count; i++) bubbles.push(makeBubble())

    const onMove = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY }
    window.addEventListener('pointermove', onMove, { passive: true })

    let raf = 0
    let lastT = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now
      for (const b of bubbles) {
        if (b.popped) continue

        if (b.popT > 0) {
          // popping: scale up + fade, all via transform (smooth), then respawn
          b.popT += dt / 0.32
          const sway = b.swayAmp * Math.sin(now * 0.001 * b.swaySpeed + b.swayPhase)
          const scale = 1 + 0.55 * Math.min(1, b.popT)
          b.el.style.transform = `translate3d(${b.x + sway - b.r}px, ${b.y - b.r}px, 0) scale(${scale})`
          b.el.style.opacity = String(Math.max(0, 1 - b.popT))
          if (b.popT >= 1) {
            b.popped = true
            setTimeout(() => reset(b, true), 900 + Math.random() * 1400)
          }
          continue
        }

        // rise + smooth sinusoidal sway (the wind)
        b.y -= b.rise * dt
        const sway = b.swayAmp * Math.sin(now * 0.001 * b.swaySpeed + b.swayPhase)
        const cx = b.x + sway
        const cy = b.y

        // pop when the cursor is over the bubble (manual hit-test, works behind the UI)
        const dx = cx - mouse.x, dy = cy - mouse.y
        if (dx * dx + dy * dy < b.r * b.r) { b.popT = 0.0001; continue }

        if (b.y < -b.r * 2 - 20) reset(b, true)

        // subpixel, GPU-composited position -> no pixel-step jitter
        b.el.style.transform = `translate3d(${cx - b.r}px, ${cy - b.r}px, 0)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      host.innerHTML = ''
    }
  }, [count, avatars])

  return <div ref={holder} className="aero-bubble-field" aria-hidden />
}
