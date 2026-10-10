'use client'

import { useEffect } from 'react'
import { motionTokens } from '@/components/arc/lib/motion-tokens'
import { RECORD_MUTATION_EVENT, type RecordMutation } from '@/lib/utils/record-motion'

const visible = (element: HTMLElement) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
const easing = (curve: readonly number[]) => `cubic-bezier(${curve.join(',')})`

/** Shared feedback for records, including rows in the standard Arc table.
 * The API event precedes query invalidation, so deleted records can be captured
 * before React removes them. Navigation, sorting and initial loads never pop.
 */
export function RecordMotion() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pending = new Map<string, { until: number; seen: Set<string> }>()
    const animations = new Set<Animation>()
    const overlays = new Set<HTMLElement>()
    const records = () => Array.from(document.querySelectorAll<HTMLElement>('[data-record-id]'))
    const track = (animation: Animation, done?: () => void) => {
      animations.add(animation)
      animation.finished.catch(() => {}).finally(() => { animations.delete(animation); done?.() })
    }
    const enter = () => {
      if (reduce.matches) { pending.clear(); return }
      const now = Date.now()
      for (const [id, { until, seen }] of pending) {
        if (until < now) { pending.delete(id); continue }
        const matches = records().filter(node => (id.endsWith('*') ? node.dataset.recordId?.startsWith(id.slice(0, -1)) && !seen.has(node.dataset.recordId) : node.dataset.recordId === id) && visible(node))
        if (!matches.length) continue
        if (!id.endsWith('*')) pending.delete(id)
        for (const node of matches) { seen.add(node.dataset.recordId!) }
        for (const node of matches) track(node.animate([
          { opacity: 0, transform: 'translateY(6px) scale(.97)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ], { duration: motionTokens.duration.standard * 1000, easing: easing(motionTokens.ease.enter) }))
      }
    }
    const exit = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect()
      const layer = document.createElement('div')
      layer.className = 'product-shell record-pop-layer'
      layer.setAttribute('aria-hidden', 'true')
      layer.inert = true
      Object.assign(layer.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
      const clone = node.cloneNode(true) as HTMLElement
      clone.removeAttribute('data-record-id')
      clone.removeAttribute('id')
      clone.querySelectorAll('[id], [data-record-id]').forEach(child => { child.removeAttribute('id'); child.removeAttribute('data-record-id') })
      // Capture inherited styling outside the original flex/grid/table context.
      const properties = ['display', 'position', 'align-items', 'justify-content', 'gap', 'padding', 'margin', 'border', 'border-radius', 'box-shadow', 'color', 'background-color', 'font', 'line-height', 'text-align', 'width', 'height', 'min-width', 'max-width', 'overflow', 'flex', 'grid-template-columns']
      const originals = [node, ...node.querySelectorAll<HTMLElement>('*')]
      const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')]
      originals.forEach((original, index) => {
        const computed = getComputedStyle(original)
        properties.forEach(property => copies[index].style.setProperty(property, computed.getPropertyValue(property)))
      })
      const style = getComputedStyle(node)
      Object.assign(clone.style, { width: '100%', height: '100%', margin: '0', color: style.color, background: style.background, borderRadius: style.borderRadius })
      if (node.tagName === 'TR') {
        const table = document.createElement('table')
        table.className = 'record-pop-table'
        const body = document.createElement('tbody')
        body.append(clone); table.append(body); layer.append(table)
        clone.querySelectorAll('td').forEach((cell, i) => { cell.style.width = `${node.children[i].getBoundingClientRect().width}px` })
      } else layer.append(clone)
      document.body.append(layer)
      overlays.add(layer)
      node.style.visibility = 'hidden'
      const duration = motionTokens.duration.exit * 1000
      track(clone.animate([
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(1.035)' },
      ], { duration, easing: easing(motionTokens.ease.exit), fill: 'forwards' }), () => { layer.remove(); overlays.delete(layer) })
      for (let index = 0; index < 6; index++) {
        const dot = document.createElement('i')
        dot.className = 'record-pop-dot'
        const angle = index * Math.PI / 3
        Object.assign(dot.style, { left: `${50 + Math.cos(angle) * 32}%`, top: `${50 + Math.sin(angle) * 32}%` })
        layer.append(dot)
        track(dot.animate([
          { opacity: .45, transform: 'translate(0, 0) scale(1)' },
          { opacity: 0, transform: `translate(${Math.cos(angle) * 12}px, ${Math.sin(angle) * 12}px) scale(.3)` },
        ], { duration, easing: easing(motionTokens.ease.exit), fill: 'forwards' }))
      }
    }
    const onMutation = (event: Event) => {
      if (reduce.matches || !HTMLElement.prototype.animate) return
      const { action, id } = (event as CustomEvent<RecordMutation>).detail
      if (action === 'create') { pending.set(id, { until: Date.now() + (id.endsWith('*') ? 600_000 : 10_000), seen: new Set(records().map(node => node.dataset.recordId!)) }); enter() }
      else records().filter(node => node.dataset.recordId === id && visible(node)).forEach(exit)
    }
    const observer = new MutationObserver(enter)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener(RECORD_MUTATION_EVENT, onMutation)
    const stop = () => { pending.clear(); animations.forEach(animation => animation.cancel()); overlays.forEach(layer => layer.remove()) }
    reduce.addEventListener('change', stop)
    return () => { observer.disconnect(); window.removeEventListener(RECORD_MUTATION_EVENT, onMutation); reduce.removeEventListener('change', stop); stop() }
  }, [])
  return null
}
