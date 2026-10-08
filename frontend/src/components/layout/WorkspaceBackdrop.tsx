'use client'

import { useEffect, useRef } from 'react'

/** Dot-wave material adapted from Instasent's effects lab Grid Animator.
 * One capped Canvas 2D loop, no interaction layer over the study content. */
export function WorkspaceBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let last = 0
    let time = 0
    let width = 0
    let height = 0
    let color = ''
    let visible = true
    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = color
      const spacing = width < 768 ? 40 : 32
      for (let y = 16; y < height; y += spacing) {
        for (let x = 16; x < width; x += spacing) {
          const wave = (Math.sin(time * .55 + x * .007 - y * .005) + 1) / 2
          ctx.globalAlpha = .08 + wave * .16
          ctx.beginPath()
          ctx.arc(x, y, .6 + wave * .9, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 50) return // 20fps is enough for a slow background wave.
      time += Math.min((now - last) / 1000, .1)
      last = now
      draw()
    }
    const sync = () => {
      cancelAnimationFrame(frame)
      frame = 0
      if (!visible || document.hidden) return
      draw()
      if (!media.matches) {
        last = performance.now()
        frame = requestAnimationFrame(tick)
      }
    }
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      color = getComputedStyle(canvas).getPropertyValue('--primary').trim()
      sync()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() })
    io.observe(canvas)
    const theme = new MutationObserver(resize)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    media.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    resize()
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      io.disconnect()
      theme.disconnect()
      media.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])
  return <canvas ref={ref} className="workspace-backdrop" aria-hidden="true" />
}
