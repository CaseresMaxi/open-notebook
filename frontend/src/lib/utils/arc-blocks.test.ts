import { describe, expect, it } from 'vitest'
import { arcBlockToMarkdown, parseArcBlock, replaceArcBlocksWithMarkdown } from './arc-blocks'

describe('arc blocks', () => {
  it('parses every supported component', () => {
    const specs = [
      { type: 'line', x: ['a', 'b'], series: [{ name: 's', values: [1, 2] }] },
      { type: 'bar', items: [{ label: 'A', value: 1 }] },
      { type: 'donut', items: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] },
      { type: 'waffle', items: [{ label: 'A', value: 40 }, { label: 'B', value: 60 }] },
      { type: 'table', columns: ['A', 'B'], rows: [['x', 1]] },
      { type: 'metrics', items: [{ label: 'A', value: 1 }] },
      { type: 'gauge', value: 3, max: 5 },
      { type: 'steps', items: [{ label: 'Uno' }, { label: 'Dos' }] },
      { type: 'accordion', items: [{ title: 'T', content: 'C' }] },
      { type: 'callout', title: 'Ojo', tone: 'warning' },
    ]
    for (const spec of specs) expect(parseArcBlock(JSON.stringify(spec))?.type).toBe(spec.type)
  })

  it('rejects malformed blocks instead of rendering garbage', () => {
    for (const source of ['{oops', '{"type":"video"}', '{"type":"line","x":["a","b"],"series":[{"name":"s","values":[1]}]}',
      '{"type":"table","columns":["a","b"],"rows":[["x"]]}', '{"type":"gauge","value":1,"min":3,"max":2}', '{"type":"callout"}']) {
      expect(parseArcBlock(source)).toBeNull()
    }
  })

  it('strips citations that leaked into labels', () => {
    const spec = parseArcBlock('{"type":"bar","items":[{"label":"Ventas [1](#ref-source-abc)","value":2}]}')
    expect(spec?.type === 'bar' && spec.items[0].label).toBe('Ventas')
  })

  it('turns blocks into readable Markdown for copy and read-aloud', () => {
    const content = 'Intro\n\n```arc\n{"type":"table","title":"Modelos","columns":["Modelo","Niveles"],"rows":[["CMMI",5]]}\n```\n\nFin'
    expect(replaceArcBlocksWithMarkdown(content)).toBe('Intro\n\n**Modelos**\n\n| Modelo | Niveles |\n| --- | --- |\n| CMMI | 5 |\n\nFin')
    expect(arcBlockToMarkdown({ type: 'steps', items: [{ label: 'Plan', description: 'Definir' }, { label: 'Hacer' }] })).toBe('1. Plan: Definir\n2. Hacer')
  })
})
