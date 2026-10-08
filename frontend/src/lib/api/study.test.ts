import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateStudySummary } from './study'
import { sourcesApi } from './sources'
import { transformationsApi } from './transformations'
import { notesApi } from './notes'
import { isStudySummary } from '@/lib/utils/study-summary'
vi.mock('./sources', () => ({ sourcesApi: { get: vi.fn() } }))
vi.mock('./transformations', () => ({
  transformationsApi: { execute: vi.fn() },
}))
vi.mock('./notes', () => ({ notesApi: { create: vi.fn() } }))
const request = {
  notebookId: 'notebook:one',
  sourceId: 'source:original',
  templateId: 'transformation:summary',
  instructions: 'Summarize faithfully',
  title: (title: string) => `Summary: ${title}`,
  sourceLabel: 'Original source',
  emptyError: 'Not processed',
  outputError: 'No summary',
}
beforeEach(() => vi.clearAllMocks())
describe('study summary', () => {
  it('uses actual source text and saves provenance in the selected notebook', async () => {
    vi.mocked(sourcesApi.get).mockResolvedValue({
      title: 'Probability',
      full_text: 'Probability lies between zero and one.',
    } as Awaited<ReturnType<typeof sourcesApi.get>>)
    vi.mocked(transformationsApi.execute).mockResolvedValue({
      output: 'A probability is between 0 and 1.',
      transformation_id: request.templateId,
      model_id: null,
    })
    await generateStudySummary(request)
    expect(transformationsApi.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        input_text: expect.stringContaining(
          'Probability lies between zero and one.'
        ),
      })
    )
    const saved = vi.mocked(notesApi.create).mock.calls[0][0]
    expect(saved.notebook_id).toBe('notebook:one')
    expect(saved.content).toContain('/sources/source%3Aoriginal')
    expect(saved.content).toContain('A probability is between 0 and 1.')
    expect(isStudySummary(saved)).toBe(true)
  })
  it('does not call AI or create a note for an unprocessed source', async () => {
    vi.mocked(sourcesApi.get).mockResolvedValue({ full_text: ' ' } as Awaited<
      ReturnType<typeof sourcesApi.get>
    >)
    await expect(generateStudySummary(request)).rejects.toThrow('Not processed')
    expect(transformationsApi.execute).not.toHaveBeenCalled()
    expect(notesApi.create).not.toHaveBeenCalled()
  })
  it('does not persist an empty model response', async () => {
    vi.mocked(sourcesApi.get).mockResolvedValue({
      full_text: 'Source text',
    } as Awaited<ReturnType<typeof sourcesApi.get>>)
    vi.mocked(transformationsApi.execute).mockResolvedValue({
      output: ' ',
      transformation_id: request.templateId,
      model_id: null,
    })
    await expect(generateStudySummary(request)).rejects.toThrow('No summary')
    expect(notesApi.create).not.toHaveBeenCalled()
  })
})
