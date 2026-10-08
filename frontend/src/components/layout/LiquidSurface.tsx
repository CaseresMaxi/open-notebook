'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import type { LiquidGlassEngine } from 'quick-liquid'
import { cn } from '@/lib/utils'

let accelerated: boolean | undefined
function hasAcceleration() {
  if (accelerated !== undefined) return accelerated
  const gl = document.createElement('canvas').getContext('webgl', { failIfMajorPerformanceCaveat: true })
  if (!gl) return (accelerated = false)
  const debug = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : ''
  accelerated = !/swiftshader|llvmpipe|software|softpipe/i.test(renderer)
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return accelerated
}

/** Same quick-liquid engine/material calibration as Instasent's iOS glass.
 * Chrome only. The solid face always exists for SSR, CPU rendering and preferences. */
export function LiquidSurface({ children, className, radius = 18 }: { children: ReactNode; className?: string; radius?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = ref.current
    if (!host || typeof ResizeObserver === 'undefined') return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const transparency = matchMedia('(prefers-reduced-transparency: reduce)')
    const contrast = matchMedia('(forced-colors: active)')
    let engine: LiquidGlassEngine | undefined
    let cancelled = false
    let generation = 0
    const config = () => {
      const dark = document.documentElement.classList.contains('dark')
      return {
        material: 'regular' as const, borderRadius: radius, blur: 2.6,
        saturation: dark ? 1.1 : 1, refractionStrength: 18, bezelWidth: 21,
        thickness: 8, chromaticAberration: 0, appearance: 'light' as const,
        backdropLuminance: .5, lightAngle: -45, specularStrength: .15,
        edgeHighlight: dark ? .55 : 1, elevation: .15,
        tint: dark ? '150, 150, 150' : '240, 240, 240',
        tintOpacity: dark ? .125 : .545, quality: 'medium' as const,
        hoverLighting: true, respectPreferences: true,
      }
    }
    const sync = async () => {
      const ticket = ++generation
      if (motion.matches || transparency.matches || contrast.matches || !hasAcceleration()) {
        engine?.destroy(); engine = undefined
        host.dataset.glass = 'solid'
        return
      }
      if (engine) { engine.setConfig(config()); return }
      try {
        const { LiquidGlassEngine: Engine } = await import('quick-liquid')
        if (cancelled || ticket !== generation || !host.getClientRects().length) return
        engine = new Engine(host, config())
        host.dataset.glass = 'liquid'
      } catch { host.dataset.glass = 'solid' }
    }
    const observer = new MutationObserver(() => { void sync() })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    const resize = new ResizeObserver(() => { if (!engine) void sync() })
    resize.observe(host)
    const onPreference = () => { void sync() }
    for (const query of [motion, transparency, contrast]) query.addEventListener('change', onPreference)
    void sync()
    return () => {
      cancelled = true; generation++
      engine?.destroy(); observer.disconnect(); resize.disconnect()
      for (const query of [motion, transparency, contrast]) query.removeEventListener('change', onPreference)
    }
  }, [radius])
  return <div ref={ref} data-glass="solid" className={cn('liquid-surface', className)} style={{ borderRadius: radius }}>
    <div className="ql-content relative z-10 h-full">{children}</div>
  </div>
}
