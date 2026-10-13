import { describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('./client', () => ({ default: api }))

import { createStudySummary } from './study'

describe('createStudySummary', () => {
  it('asks the server for a grounded summary of one source', async () => {
    api.post.mockResolvedValue({ data: { id: 'note:1', images: [] } })
    const note = await createStudySummary({ notebookId: 'notebook:one', sourceId: 'source:a', language: 'es-ES', title: 'Resumen: A' })
    expect(api.post).toHaveBeenCalledWith('/notebooks/notebook%3Aone/study-summaries', {
      source_id: 'source:a', topic: undefined, language: 'es-ES', title: 'Resumen: A',
    })
    expect(note.id).toBe('note:1')
  })

  it('sends a topic instead of a source for topic summaries', async () => {
    api.post.mockResolvedValue({ data: { id: 'note:2' } })
    await createStudySummary({ notebookId: 'n', topic: 'métricas', language: 'es-ES', title: 'Resumen: métricas' })
    expect(api.post.mock.calls.at(-1)?.[1]).toMatchObject({ topic: 'métricas', source_id: undefined })
  })
})
