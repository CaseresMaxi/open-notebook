import { describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ post: vi.fn() }))
const notes = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('./client', () => ({ default: api }))
vi.mock('./notes', () => ({ notesApi: notes }))
vi.mock('./sources', () => ({ sourcesApi: {} }))
vi.mock('./transformations', () => ({ transformationsApi: {} }))

import { generateTopicSummary } from './study'
import { SUMMARY_MARKER } from '@/lib/utils/study-summary'

describe('generateTopicSummary', () => {
  it('asks only this notebook and saves the answer as a study summary', async () => {
    api.post.mockResolvedValue({ data: { answer: '## Métricas\n\nPrecisión y recall.' } })
    notes.create.mockResolvedValue({ id: 'note:1' })
    await generateTopicSummary({ notebookId: 'notebook:1', modelId: 'model:chat', question: 'Resume métricas', title: 'Resumen: métricas', outputError: 'vacío' })
    expect(api.post).toHaveBeenCalledWith('/search/ask/simple', {
      question: 'Resume métricas', strategy_model: 'model:chat', answer_model: 'model:chat',
      final_answer_model: 'model:chat', notebook_ids: ['notebook:1'],
    })
    expect(notes.create).toHaveBeenCalledWith(expect.objectContaining({
      notebook_id: 'notebook:1', note_type: 'ai', title: 'Resumen: métricas',
      content: `${SUMMARY_MARKER}\n\n## Métricas\n\nPrecisión y recall.`,
    }))
  })

  it('refuses to save an empty answer', async () => {
    api.post.mockResolvedValue({ data: { answer: '  ' } })
    notes.create.mockClear()
    await expect(generateTopicSummary({ notebookId: 'n', modelId: 'm', question: 'q', title: 't', outputError: 'vacío' })).rejects.toThrow('vacío')
    expect(notes.create).not.toHaveBeenCalled()
  })
})
