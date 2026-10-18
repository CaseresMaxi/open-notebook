import { describe, expect, it } from 'vitest'
import { boxExit, layoutConceptMap, wrapLabel } from './concept-map-layout'

const nodes = Array.from({ length: 14 }, (_, index) => ({
  id: `n${index}`,
  label: index === 0 ? 'Aprendizaje automático supervisado' : `Concepto número ${index}`,
  weight: index === 0 ? 5 : 1 + (index % 4),
}))
const links = nodes.slice(1).map((node, index) => ({ source: index % 3 ? nodes[index].id : 'n0', target: node.id }))

describe('concept map layout', () => {
  it.each([340, 720])('keeps every concept inside a %ipx panel without overlaps', width => {
    const layout = layoutConceptMap(nodes, links, width)
    expect(layout.width).toBe(width)
    for (const box of layout.boxes) {
      expect(box.x - box.width / 2).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width / 2).toBeLessThanOrEqual(width)
      expect(box.y - box.height / 2).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height / 2).toBeLessThanOrEqual(layout.height)
    }
    for (const [i, a] of layout.boxes.entries()) {
      for (const b of layout.boxes.slice(i + 1)) {
        const apart = Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true)
      }
    }
  })

  it('is deterministic and sizes central ideas larger', () => {
    const first = layoutConceptMap(nodes, links, 600), second = layoutConceptMap(nodes, links, 600)
    expect(first).toEqual(second)
    expect(first.boxes[0].fontSize).toBeGreaterThan(first.boxes[1].fontSize)
  })

  it('wraps labels into at most three lines', () => {
    expect(wrapLabel('Aprendizaje automático supervisado')).toEqual(['Aprendizaje', 'automático', 'supervisado'])
    expect(wrapLabel('uno dos tres cuatro cinco seis siete ocho nueve diez', 8)).toHaveLength(3)
  })

  it('starts links at the edge of a concept box', () => {
    expect(boxExit({ x: 0, y: 0, width: 100, height: 40 }, 10, 0)).toEqual({ x: 50, y: 0 })
    expect(boxExit({ x: 0, y: 0, width: 100, height: 40 }, 0, -5)).toEqual({ x: 0, y: -20 })
  })
})
