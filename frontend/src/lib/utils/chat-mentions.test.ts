import { describe, expect, it } from 'vitest'
import { activeMention, encodeMentions, filterMentionables, mentionedIds, plainMentions, splitMentions, type Mentionable } from './chat-mentions'

const items: Mentionable[] = [
  { id: 'source:a', title: 'Resumen [final].pdf', kind: 'source' },
  { id: 'note:b', title: 'Auditoría ISO 19011', kind: 'note' },
  { id: 'source:c', title: 'Normas de auditoria', kind: 'source' },
]

describe('chat mentions', () => {
  it('finds the @query before the caret only at a word start', () => {
    expect(activeMention('hola @audi', 10)).toEqual({ query: 'audi', start: 5 })
    expect(activeMention('@', 1)).toEqual({ query: '', start: 0 })
    expect(activeMention('mail@audi', 9)).toBeNull()
    expect(activeMention('@audi listo', 11)).toBeNull()
  })

  it('filters without accents, prefix matches first', () => {
    expect(filterMentionables(items, 'audit').map(item => item.id)).toEqual(['note:b', 'source:c'])
  })

  it('encodes visible mentions and reads them back', () => {
    const sent = encodeMentions('Compará @Resumen final .pdf y @Auditoría ISO 19011', items.slice(0, 2))
    expect(sent).toBe('Compará @[Resumen final .pdf](source:a) y @[Auditoría ISO 19011](note:b)')
    expect(mentionedIds(sent)).toEqual(['source:a', 'note:b'])
    expect(splitMentions(sent)).toEqual([
      { text: 'Compará ' },
      { mention: { title: 'Resumen final .pdf', id: 'source:a' } },
      { text: ' y ' },
      { mention: { title: 'Auditoría ISO 19011', id: 'note:b' } },
    ])
    expect(plainMentions(sent)).toBe('Compará @Resumen final .pdf y @Auditoría ISO 19011')
  })

  it('drops a mention whose text was deleted', () => {
    expect(encodeMentions('ya no está', items)).toBe('ya no está')
  })
})
