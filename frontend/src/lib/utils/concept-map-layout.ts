/**
 * Deterministic layout for concept_map arc blocks: a short force simulation
 * (links pull, concepts repel, relevant concepts gravitate to the centre)
 * followed by rectangle collision passes so no two labels overlap.
 * It runs in the panel's real pixel width, so text keeps its size on phones.
 */
import type { Concept, Relation } from './arc-blocks'

export type ConceptBox = {
  id: string
  x: number
  y: number
  width: number
  height: number
  lines: string[]
  fontSize: number
}

export type ConceptLayout = { boxes: ConceptBox[]; width: number; height: number }

const MARGIN = 12
const GAP = 14
const CHAR_WIDTH = 0.58
const LINE_HEIGHT = 1.25

/** Up to three lines of about maxChars, breaking between words. */
export function wrapLabel(label: string, maxChars = 16): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of label.split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  if (lines.length > 3) return [...lines.slice(0, 2), `${lines.slice(2).join(' ').slice(0, maxChars - 1)}…`]
  return lines.map(item => (item.length > maxChars + 6 ? `${item.slice(0, maxChars + 5)}…` : item))
}

function measure(node: Concept): Omit<ConceptBox, 'x' | 'y'> {
  const fontSize = 11.5 + node.weight * 0.9
  const lines = wrapLabel(node.label)
  const longest = Math.max(...lines.map(line => line.length))
  return {
    id: node.id,
    lines,
    fontSize,
    width: Math.max(64, longest * fontSize * CHAR_WIDTH + 24),
    height: lines.length * fontSize * LINE_HEIGHT + 16,
  }
}

/** Where the segment from a box centre towards (dx, dy) leaves the box. */
export function boxExit(box: Pick<ConceptBox, 'x' | 'y' | 'width' | 'height'>, dx: number, dy: number, pad = 0) {
  const scale = Math.min(
    dx ? (box.width / 2 + pad) / Math.abs(dx) : Infinity,
    dy ? (box.height / 2 + pad) / Math.abs(dy) : Infinity,
  )
  return Number.isFinite(scale) ? { x: box.x + dx * scale, y: box.y + dy * scale } : { x: box.x, y: box.y }
}

export function layoutConceptMap(nodes: Concept[], links: Relation[], width: number): ConceptLayout {
  const sized = nodes.map(measure)
  const degree = new Map<string, number>()
  for (const link of links) for (const id of [link.source, link.target]) degree.set(id, (degree.get(id) ?? 0) + 1)
  const weight = new Map(nodes.map(node => [node.id, node.weight]))
  const reach = (box: Omit<ConceptBox, 'x' | 'y'>) => Math.hypot(box.width, box.height) / 2
  // Ideal link length: room for two average concepts plus a readable label.
  const ideal = (2 * sized.reduce((sum, box) => sum + reach(box), 0)) / sized.length + 40

  // Fruchterman-Reingold in free space. Central ideas start in the middle,
  // the rest on a golden-angle spiral, so the result never depends on chance.
  const order = [...sized].sort((a, b) =>
    (weight.get(b.id)! - weight.get(a.id)!) || ((degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)))
  const boxes: ConceptBox[] = order.map((box, position) => {
    const radius = ideal * Math.sqrt(position)
    return { ...box, x: radius * Math.cos(position * 2.39996), y: radius * Math.sin(position * 2.39996) }
  })
  const index = new Map(boxes.map((box, position) => [box.id, position]))
  // Each link is long enough to show its label between the two boxes.
  const edges = links.map(link => {
    const a = index.get(link.source)!, b = index.get(link.target)!
    return [a, b, (reach(boxes[a]) + reach(boxes[b])) * 0.8 + (link.label?.length ?? 0) * 6.4 + 28] as const
  })
  for (let step = 0, heat = ideal; step < 300; step += 1, heat = Math.max(heat * 0.98, 1)) {
    const force = boxes.map(() => ({ x: 0, y: 0 }))
    for (let a = 0; a < boxes.length; a += 1) {
      for (let b = a + 1; b < boxes.length; b += 1) {
        const dx = boxes[a].x - boxes[b].x || 0.1, dy = boxes[a].y - boxes[b].y || 0.1
        const distance = Math.max(Math.hypot(dx, dy), 1)
        const room = (reach(boxes[a]) + reach(boxes[b])) / 2 + ideal / 2
        const push = (room * room) / distance
        force[a].x += (dx / distance) * push; force[a].y += (dy / distance) * push
        force[b].x -= (dx / distance) * push; force[b].y -= (dy / distance) * push
      }
    }
    for (const [a, b, length] of edges) {
      const dx = boxes[b].x - boxes[a].x, dy = boxes[b].y - boxes[a].y
      const distance = Math.max(Math.hypot(dx, dy), 1)
      const pull = (distance * distance) / length
      force[a].x += (dx / distance) * pull; force[a].y += (dy / distance) * pull
      force[b].x -= (dx / distance) * pull; force[b].y -= (dy / distance) * pull
    }
    boxes.forEach((box, position) => {
      // Relevance is gravity: the central ideas settle in the middle.
      const gravity = 0.02 * weight.get(box.id)!
      force[position].x -= box.x * gravity * Math.hypot(box.x, box.y) / ideal
      force[position].y -= box.y * gravity * Math.hypot(box.x, box.y) / ideal
      const length = Math.hypot(force[position].x, force[position].y)
      const move = Math.min(length, heat) / (length || 1)
      box.x += force[position].x * move
      box.y += force[position].y * move
    })
  }

  // Turn the layout so its long axis follows the panel: across in a wide
  // chat column, downward on a phone.
  const span = (key: 'x' | 'y') => Math.max(...boxes.map(box => box[key])) - Math.min(...boxes.map(box => box[key]))
  const narrow = width < 520
  if (narrow ? span('x') > width && span('x') > span('y') * 1.2 : span('y') > span('x') * 1.2) for (const box of boxes) [box.x, box.y] = [box.y, box.x]

  // Fit the free layout into the panel width, keeping its shape within limits.
  const left = Math.min(...boxes.map(box => box.x - box.width / 2)), right = Math.max(...boxes.map(box => box.x + box.width / 2))
  const top = Math.min(...boxes.map(box => box.y - box.height / 2)), bottom = Math.max(...boxes.map(box => box.y + box.height / 2))
  const spanX = Math.max(right - left, 1), spanY = Math.max(bottom - top, 1)
  const inner = width - MARGIN * 2
  const scale = Math.min(inner / spanX, 1.4)
  // Narrow panels compress less vertically: the map grows taller instead.
  const scaleY = narrow ? Math.max(scale, Math.min(1, scale * 1.6)) : scale
  const height = Math.round(Math.min(Math.max(spanY * scaleY + MARGIN * 2, 280), narrow ? width * 2.4 : width * 1.15))
  const offsetX = (width - spanX * scale) / 2, offsetY = (height - spanY * scaleY) / 2
  for (const box of boxes) {
    box.x = offsetX + (box.x - left) * scale
    box.y = offsetY + (box.y - top) * scaleY
  }
  // Width is fixed by the panel; the map may grow downward to stay readable.
  const clamp = (box: ConceptBox) => {
    box.x = Math.min(Math.max(box.x, MARGIN + box.width / 2), width - MARGIN - box.width / 2)
    box.y = Math.max(box.y, MARGIN + box.height / 2)
  }
  boxes.forEach(clamp)

  // Separate any boxes still overlapping along the axis of least overlap.
  for (let pass = 0; pass < 400; pass += 1) {
    let moved = false
    for (let a = 0; a < boxes.length; a += 1) {
      for (let b = a + 1; b < boxes.length; b += 1) {
        const first = boxes[a], second = boxes[b]
        const overlapX = (first.width + second.width) / 2 + GAP - Math.abs(first.x - second.x)
        const overlapY = (first.height + second.height) / 2 + GAP - Math.abs(first.y - second.y)
        if (overlapX <= 0 || overlapY <= 0) continue
        moved = true
        if (overlapX < overlapY) {
          const shift = (overlapX / 2 + 0.5) * Math.sign(first.x - second.x || a - b)
          first.x += shift; second.x -= shift
        } else {
          const shift = (overlapY / 2 + 0.5) * Math.sign(first.y - second.y || a - b)
          first.y += shift; second.y -= shift
        }
        clamp(first); clamp(second)
      }
    }
    if (!moved) break
  }

  // Order follows the input so the reading order matches the answer.
  const bottomEdge = Math.max(...boxes.map(box => box.y + box.height / 2)) + MARGIN
  return { boxes: nodes.map(node => boxes[index.get(node.id)!]), width, height: Math.round(Math.max(height, bottomEdge)) }
}
