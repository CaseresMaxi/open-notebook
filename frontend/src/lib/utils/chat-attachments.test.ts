import { afterEach, describe, expect, it, vi } from 'vitest'
import { sourcesApi } from '@/lib/api/sources'
import { isChatImage, waitForSource, withDocumentMentions, type ChatDocument } from './chat-attachments'

vi.mock('@/lib/api/sources', () => ({ sourcesApi: { status: vi.fn() } }))
const status = vi.mocked(sourcesApi.status)

afterEach(() => status.mockReset())

describe('chat attachments', () => {
  it('tells images from documents', () => {
    expect(isChatImage(new File([''], 'a.png', { type: 'image/png' }))).toBe(true)
    expect(isChatImage(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBe(false)
  })

  it('mentions ready documents the text does not mention yet', () => {
    const documents: ChatDocument[] = [
      { key: '1', name: 'Parcial [2024].pdf', status: 'ready', sourceId: 'source:a' },
      { key: '2', name: 'Otro.pdf', status: 'ready', sourceId: 'source:b' },
      { key: '3', name: 'Roto.pdf', status: 'failed' },
    ]
    expect(withDocumentMentions('Extrae las preguntas @[Otro.pdf](source:b)', documents))
      .toBe('Extrae las preguntas @[Otro.pdf](source:b)\n\n@[Parcial 2024 .pdf](source:a)')
    expect(withDocumentMentions('', documents.slice(1))).toBe('@[Otro.pdf](source:b)')
    expect(withDocumentMentions('hola', [])).toBe('hola')
  })

  it('waits until the source finishes processing', async () => {
    status.mockResolvedValueOnce({ status: 'queued', message: '' })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ status: 'completed', message: '' })
    await expect(waitForSource('source:a', { interval: 0 })).resolves.toBeUndefined()
    expect(status).toHaveBeenCalledTimes(3)
  })

  it('rejects when processing fails or never ends', async () => {
    status.mockResolvedValue({ status: 'failed', message: '' })
    await expect(waitForSource('source:a', { interval: 0 })).rejects.toThrow('chat.documentFailed')
    status.mockResolvedValue({ status: 'running', message: '' })
    await expect(waitForSource('source:a', { interval: 0, timeout: -1 })).rejects.toThrow('chat.documentTimeout')
  })
})
