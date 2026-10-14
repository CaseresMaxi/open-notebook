/**
 * Inline Arc components in answers: a ```arc fenced block holds one JSON
 * object (validated by the API before saving; see open_notebook/utils/arc_blocks.py).
 * Parsing here is defensive anyway, since notes can be edited by hand.
 */

type Point = { label: string; value: number }

export type ArcSpec =
  | { type: 'line'; title?: string; unit?: string; x: string[]; series: { name: string; values: number[] }[] }
  | { type: 'bar'; title?: string; unit?: string; period?: string; items: Point[] }
  | { type: 'donut' | 'waffle'; title?: string; unit?: string; items: Point[] }
  | { type: 'table'; title?: string; columns: string[]; rows: (string | number | null)[][] }
  | { type: 'metrics'; title?: string; items: { label: string; value: number; suffix?: string; context?: string; change?: string }[] }
  | { type: 'gauge'; title?: string; value: number; min?: number; max?: number; detail?: string }
  | { type: 'steps'; title?: string; items: { label: string; description?: string }[] }
  | { type: 'accordion'; title?: string; items: { title: string; content: string }[] }
  | { type: 'callout'; title: string; tone?: 'info' | 'success' | 'warning' | 'danger'; text?: string }

// Citations belong in the prose; drop any converted [n](#ref-…) link that slipped into a label.
const text = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value)).replace(/\s*\[\d+\]\(#ref-[^)]*\)/g, '')
const num = (value: unknown) => typeof value === 'number' ? value : Number(value)
const isList = (value: unknown): value is unknown[] => Array.isArray(value) && value.length > 0
const record = (value: unknown) => (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
const points = (value: unknown) => isList(value)
  ? value.map(item => ({ label: text(record(item).label), value: num(record(item).value) })).filter(item => item.label && Number.isFinite(item.value))
  : []

export function parseArcBlock(source: string): ArcSpec | null {
  let raw: Record<string, unknown>
  try { raw = record(JSON.parse(source)) } catch { return null }
  const title = text(raw.title) || undefined
  const unit = text(raw.unit)
  switch (raw.type) {
    case 'line': {
      const x = isList(raw.x) ? raw.x.map(text) : []
      const series = isList(raw.series) ? raw.series.map(item => ({ name: text(record(item).name), values: (Array.isArray(record(item).values) ? record(item).values as unknown[] : []).map(num) })) : []
      if (x.length < 2 || !series.length || series.some(item => item.values.length !== x.length || item.values.some(value => !Number.isFinite(value)))) return null
      return { type: 'line', title, unit, x, series }
    }
    case 'bar': case 'donut': case 'waffle': {
      const items = points(raw.items)
      if (!items.length) return null
      return raw.type === 'bar' ? { type: 'bar', title, unit, period: text(raw.period), items } : { type: raw.type, title, unit, items }
    }
    case 'table': {
      const columns = isList(raw.columns) ? raw.columns.map(text) : []
      const rows = isList(raw.rows) ? raw.rows.filter(Array.isArray).map(row => (row as unknown[]).map(cell => typeof cell === 'number' ? cell : cell == null ? null : text(cell))) : []
      if (!columns.length || !rows.length || rows.some(row => row.length !== columns.length)) return null
      return { type: 'table', title, columns, rows }
    }
    case 'metrics': {
      const items = isList(raw.items) ? raw.items.map(item => {
        const metric = record(item)
        return { label: text(metric.label), value: num(metric.value), suffix: text(metric.suffix) || undefined, context: text(metric.context), change: text(metric.change) || undefined }
      }).filter(item => item.label && Number.isFinite(item.value)) : []
      return items.length ? { type: 'metrics', title, items } : null
    }
    case 'gauge': {
      const value = num(raw.value), min = raw.min == null ? 0 : num(raw.min), max = raw.max == null ? 100 : num(raw.max)
      if (![value, min, max].every(Number.isFinite) || min >= max) return null
      return { type: 'gauge', title, value: Math.min(Math.max(value, min), max), min, max, detail: text(raw.detail) || undefined }
    }
    case 'steps': {
      const items = isList(raw.items) ? raw.items.map(item => ({ label: text(record(item).label), description: text(record(item).description) || undefined })).filter(item => item.label) : []
      return items.length ? { type: 'steps', title, items } : null
    }
    case 'accordion': {
      const items = isList(raw.items) ? raw.items.map(item => ({ title: text(record(item).title), content: text(record(item).content) })).filter(item => item.title && item.content) : []
      return items.length ? { type: 'accordion', title, items } : null
    }
    case 'callout': {
      const tone = ['info', 'success', 'warning', 'danger'].includes(text(raw.tone)) ? raw.tone as 'info' : 'info'
      return title ? { type: 'callout', title, tone, text: text(raw.text) || undefined } : null
    }
    default:
      return null
  }
}

const cell = (value: unknown) => text(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const table = (columns: string[], rows: unknown[][]) =>
  [`| ${columns.map(cell).join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${row.map(cell).join(' | ')} |`)].join('\n')

/** Plain Markdown for copying, saving elsewhere and reading aloud. */
export function arcBlockToMarkdown(spec: ArcSpec): string {
  const heading = spec.title && spec.type !== 'callout' ? `**${spec.title}**\n\n` : ''
  const unit = 'unit' in spec && spec.unit ? ` ${spec.unit}` : ''
  switch (spec.type) {
    case 'line':
      return heading + table(['', ...spec.series.map(series => series.name)], spec.x.map((label, point) => [label, ...spec.series.map(series => `${series.values[point]}${unit}`)]))
    case 'bar': case 'donut': case 'waffle':
      return heading + spec.items.map(item => `- ${item.label}: ${item.value}${unit}`).join('\n')
    case 'table':
      return heading + table(spec.columns, spec.rows)
    case 'metrics':
      return heading + spec.items.map(item => `- ${item.label}: ${item.value}${item.suffix ?? ''}${item.context ? ` (${item.context})` : ''}${item.change ? ` ${item.change}` : ''}`).join('\n')
    case 'gauge':
      return `${heading}${spec.value} / ${spec.max ?? 100}${spec.detail ? ` (${spec.detail})` : ''}`
    case 'steps':
      return heading + spec.items.map((item, index) => `${index + 1}. ${item.label}${item.description ? `: ${item.description}` : ''}`).join('\n')
    case 'accordion':
      return heading + spec.items.map(item => `**${item.title}**\n\n${item.content}`).join('\n\n')
    case 'callout':
      return `> **${spec.title}**${spec.text ? `\n> ${spec.text}` : ''}`
  }
}

const FENCE = /```arc[ \t]*\r?\n([\s\S]*?)```/gi

export function replaceArcBlocksWithMarkdown(content: string): string {
  return content.replace(FENCE, (_, source: string) => {
    const spec = parseArcBlock(source.trim())
    return spec ? arcBlockToMarkdown(spec) : ''
  })
}
