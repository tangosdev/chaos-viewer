import { useEffect, useRef } from 'react'

interface Bubble {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  el: HTMLDivElement
  popped: boolean
}

/** Interactive Frutiger Aero bubble field: bubbles drift upward, drift gently
 *  away from the mouse, pop when clicked, and respawn from the bottom. */
export function Bubbles({ count = 14 }: { count?: number }) {
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hostEl = holder.current
    if (!hostEl) return
    const host: HTMLDivElement = hostEl
    const bubbles: Bubble[] = []
    const mouse = { x: -9999, y: -9999 }

    function makeBubble(initial: boolean): Bubble {
      const r = 14 + Math.random() * 42
      const el = document.createElement('div')
      el.className = 'aero-bubble'
      el.style.width = el.style.height = `${r * 2}px`
      const b: Bubble = {
        x: Math.random() * window.innerWidth,
        y: initial ? Math.random() * window.innerHeight : window.innerHeight + r * 2 + Math.random() * 120,
        r,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -(0.05 + Math.random() * 0.09),
        el,
        popped: false,
      }
      el.addEventListener('pointerdown', e => {
        e.preventDefault()
        pop(b)
      })
      host.appendChild(el)
      return b
    }

    function pop(b: Bubble) {
      if (b.popped) return
      b.popped = true
      b.el.classList.add('popping')
      setTimeout(() => {
        b.el.classList.remove('popping')
        b.x = Math.random() * window.innerWidth
        b.y = window.innerHeight + b.r * 2 + Math.random() * 200
        b.vx = (Math.random() - 0.5) * 0.08
        b.vy = -(0.05 + Math.random() * 0.09)
        b.popped = false
      }, 1200 + Math.random() * 1800)
    }

    for (let i = 0; i < count; i++) bubbles.push(makeBubble(true))

    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    let raf = 0
    const tick = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      for (const b of bubbles) {
        if (!b.popped) {
          // gentle repulsion within a radius around the cursor
          const dx = b.x - mouse.x
          const dy = b.y - mouse.y
          const reach = 120 + b.r
          const d2 = dx * dx + dy * dy
          if (d2 < reach * reach && d2 > 0.01) {
            const d = Math.sqrt(d2)
            const f = (1 - d / reach) * 0.045   // barely-there nudge
            b.vx += (dx / d) * f
            b.vy += (dy / d) * f
          }
          // gentle buoyancy + strong drag so pushes decay fast into a slow drift
          b.vy -= 0.0016
          b.vx *= 0.94
          b.vy *= 0.95
          // cap speed so a fast mouse can never fling a bubble
          const sp = Math.hypot(b.vx, b.vy), MAXV = 0.9
          if (sp > MAXV) { b.vx = b.vx / sp * MAXV; b.vy = b.vy / sp * MAXV }
          b.x += b.vx
          b.y += b.vy
          // wrap
          if (b.y < -b.r * 2 - 30) {
            b.y = H + b.r * 2
            b.x = Math.random() * W
            b.vy = -(0.12 + Math.random() * 0.22)
          }
          if (b.x < -b.r * 2 - 10) b.x = W + b.r
          if (b.x > W + b.r * 2 + 10) b.x = -b.r
          b.el.style.left = `${b.x - b.r}px`
          b.el.style.top = `${b.y - b.r}px`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      host.innerHTML = ''
    }
  }, [count])

  return <div ref={holder} className="aero-bubble-field" aria-hidden />
}
