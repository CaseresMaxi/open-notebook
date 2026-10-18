'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { ArcSpec } from '@/lib/utils/arc-blocks'
import { boxExit, layoutConceptMap } from '@/lib/utils/concept-map-layout'
import styles from './ConceptMap.module.css'

type Spec = Extract<ArcSpec, { type: 'concept_map' }>
type Point = { x: number; y: number }
type Drag = { id: string | null; start: Point; origin: Point; moved: boolean }

const KEY_WEIGHT = 4
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5

/** Panel width in pixels; jsdom and the first paint fall back to a chat column. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width)
      // Small jitters (scrollbars appearing) must not relayout the map.
      if (next > 0) setWidth(current => (Math.abs(current - next) > 24 ? next : current))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** An interactive concept map: relevance sets size, links read source → target. */
export function ConceptMap({ spec }: { spec: Spec }) {
  const { t } = useTranslation()
  const [frame, width] = useWidth()
  const [keyOnly, setKeyOnly] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [moved, setMoved] = useState<Record<string, Point>>({})
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const drag = useRef<Drag | null>(null)
  // url(#…) references break on the colons React puts in generated ids.
  const markerId = `cm-arrow-${useId().replace(/[^\w-]/g, '')}`

  const canFilter = spec.nodes.filter(node => node.weight >= KEY_WEIGHT).length >= 2 && spec.nodes.some(node => node.weight < KEY_WEIGHT)
  const nodes = useMemo(() => (keyOnly && canFilter ? spec.nodes.filter(node => node.weight >= KEY_WEIGHT) : spec.nodes), [spec.nodes, keyOnly, canFilter])
  const links = useMemo(() => {
    const visible = new Set(nodes.map(node => node.id))
    return spec.links.filter(link => visible.has(link.source) && visible.has(link.target))
  }, [spec.links, nodes])
  const layout = useMemo(() => layoutConceptMap(nodes, links, width), [nodes, links, width])
  // A new layout (filter or width change) discards hand-placed positions.
  useEffect(() => { setMoved({}); setView({ k: 1, x: 0, y: 0 }) }, [layout])

  const groups = useMemo(() => [...new Set(spec.nodes.map(node => node.group).filter(Boolean))] as string[], [spec.nodes])
  const byId = useMemo(() => new Map(spec.nodes.map(node => [node.id, node])), [spec.nodes])
  const boxes = useMemo(() => layout.boxes.map(box => ({ ...box, ...moved[box.id] })), [layout, moved])
  const boxById = new Map(boxes.map(box => [box.id, box]))
  const focus = selected && boxById.has(selected) ? selected : null
  const related = useMemo(() => {
    if (!focus) return null
    const ids = new Set([focus])
    for (const link of links) if (link.source === focus || link.target === focus) ids.add(link.source).add(link.target)
    return ids
  }, [focus, links])

  const toLocal = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY })
  const startDrag = (event: PointerEvent<SVGElement>, id: string | null) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const box = id ? boxById.get(id) : null
    drag.current = { id, start: toLocal(event), origin: box ? { x: box.x, y: box.y } : { x: view.x, y: view.y }, moved: false }
  }
  const moveDrag = (event: PointerEvent<SVGElement>) => {
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.start.x, dy = event.clientY - current.start.y
    if (!current.moved && Math.hypot(dx, dy) < 4) return
    current.moved = true
    if (current.id) {
      const id = current.id
      setMoved(state => ({ ...state, [id]: { x: current.origin.x + dx / view.k, y: current.origin.y + dy / view.k } }))
    } else {
      setView(state => ({ ...state, x: current.origin.x + dx, y: current.origin.y + dy }))
    }
  }
  const endDrag = () => {
    const current = drag.current
    drag.current = null
    if (!current || current.moved) return
    setSelected(state => (current.id && state !== current.id ? current.id : null))
  }
  const zoom = (factor: number) => setView(state => {
    const k = Math.min(Math.max(state.k * factor, MIN_ZOOM), MAX_ZOOM)
    // Zoom around the centre of the panel.
    return { k, x: layout.width / 2 - ((layout.width / 2 - state.x) * k) / state.k, y: layout.height / 2 - ((layout.height / 2 - state.y) * k) / state.k }
  })
  const onKey = (event: KeyboardEvent, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(state => (state === id ? null : id)) }
    if (event.key === 'Escape') setSelected(null)
  }

  const groupIndex = (group?: string) => (group ? groups.indexOf(group) + 1 : 0)
  const selectedNode = focus ? byId.get(focus) : null
  const outgoing = focus ? links.filter(link => link.source === focus) : []
  const incoming = focus ? links.filter(link => link.target === focus) : []

  return <div className={styles.root} data-grouped={groups.length ? '' : undefined}>
    <div className={styles.toolbar}>
      {canFilter && <div className={styles.segmented} role="group" aria-label={t('chat.conceptMapFilter')}>
        <button type="button" aria-pressed={!keyOnly} onClick={() => setKeyOnly(false)}>{t('chat.conceptMapAll')}</button>
        <button type="button" aria-pressed={keyOnly} onClick={() => setKeyOnly(true)}>{t('chat.conceptMapKey')}</button>
      </div>}
      <div className={styles.zoom}>
        <button type="button" aria-label={t('chat.conceptMapZoomOut')} onClick={() => zoom(1 / 1.25)}>−</button>
        <button type="button" aria-label={t('chat.conceptMapZoomIn')} onClick={() => zoom(1.25)}>+</button>
        <button type="button" onClick={() => { setMoved({}); setView({ k: 1, x: 0, y: 0 }); setSelected(null) }}>{t('chat.conceptMapReset')}</button>
      </div>
    </div>
    <div ref={frame} className={styles.frame}>
      <svg
        className={styles.svg}
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="group"
        aria-label={spec.title || t('chat.conceptMap')}
        data-focused={focus ? '' : undefined}
        onPointerDown={event => startDrag(event, null)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => { drag.current = null }}
      >
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className={styles.arrow} />
          </marker>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {links.map((link, index) => {
            const from = boxById.get(link.source)!, to = boxById.get(link.target)!
            const dx = to.x - from.x, dy = to.y - from.y
            const start = boxExit(from, dx, dy, 2), end = boxExit(to, -dx, -dy, 5)
            const active = related ? link.source === focus || link.target === focus : false
            return <g key={`${link.source}-${link.target}-${index}`} className={styles.link} data-active={active ? '' : undefined} data-dim={related && !active ? '' : undefined}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerEnd={`url(#${markerId})`} />
              {link.label && (active || Math.hypot(end.x - start.x, end.y - start.y) >= link.label.length * 6.2 + 10) && <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2} dy="0.35em" textAnchor="middle">{link.label}</text>}
            </g>
          })}
          {boxes.map((box, rank) => {
            const node = byId.get(box.id)!
            const lineHeight = box.fontSize * 1.25
            return <g
              key={box.id}
              className={styles.node}
              style={{ ['--rank' as string]: rank }}
              data-group={groupIndex(node.group)}
              data-weight={node.weight}
              data-active={focus === box.id ? '' : undefined}
              data-dim={related && !related.has(box.id) ? '' : undefined}
              transform={`translate(${box.x - box.width / 2} ${box.y - box.height / 2})`}
              role="button"
              tabIndex={0}
              aria-pressed={focus === box.id}
              aria-label={`${node.label}. ${t('chat.conceptMapRelevance', { value: node.weight })}`}
              onPointerDown={event => startDrag(event, box.id)}
              onKeyDown={event => onKey(event, box.id)}
            >
              <rect width={box.width} height={box.height} rx={Math.min(14, box.height / 2)} />
              <text x={box.width / 2} y={(box.height - box.lines.length * lineHeight) / 2 + lineHeight * 0.8} textAnchor="middle" fontSize={box.fontSize}>
                {box.lines.map((line, index) => <tspan key={index} x={box.width / 2} dy={index ? lineHeight : 0}>{line}</tspan>)}
              </text>
            </g>
          })}
        </g>
      </svg>
    </div>
    <div className={styles.detail} aria-live="polite">
      {selectedNode ? <>
        <p className={styles.detailTitle}>{selectedNode.label} <span>{t('chat.conceptMapRelevance', { value: selectedNode.weight })}</span></p>
        {selectedNode.detail && <p>{selectedNode.detail}</p>}
        {(outgoing.length > 0 || incoming.length > 0) && <ul className={styles.relations}>
          {outgoing.map((link, index) => <li key={`o${index}`}><em>{link.label || '→'}</em> {byId.get(link.target)?.label}</li>)}
          {incoming.map((link, index) => <li key={`i${index}`}>{byId.get(link.source)?.label} <em>{link.label || '→'}</em></li>)}
        </ul>}
      </> : <p className={styles.hint}>{t('chat.conceptMapHint')}</p>}
    </div>
    {groups.length > 0 && <ul className={styles.legend} aria-label={t('chat.conceptMapLegend')}>
      {groups.map((group, index) => <li key={group} data-group={index + 1}><span aria-hidden="true" />{group}</li>)}
      <li className={styles.sizeNote}>{t('chat.conceptMapSize')}</li>
    </ul>}
  </div>
}

export default ConceptMap
